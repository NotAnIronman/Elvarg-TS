import { LoginDetailsMessage } from "./login/LoginDetailsMessage";
import { Packet } from "./packet/Packet";
import { PacketBuilder } from "./packet/PacketBuilder";
import { NetworkConstants } from "./NetworkConstants";
import type { Player } from "../game/entity/impl/player/Player";
import { Appearance } from "../game/model/Appearance";
import { Flag } from "../game/model/Flag";
import {
  createNpcSyncState,
  createPlayerSyncState,
  ActorUpdateView,
  encodePlayerAppearance,
  encodeInitialPlayerSync,
  encodeNpcSync,
  encodePlaySong,
  encodePlayerSync,
  encodeTick,
  NpcSyncState,
  NpcView,
  PlayerSyncState,
  PlayerView,
} from "./protocol/ClientProtocol";
import { Music } from "../game/Music";
import { Skill } from "../game/model/Skill";
import { HitMask } from "../game/content/combat/hit/HitMask";

type SessionChannel = {
  binaryTransport?: boolean;
  bufferedAmount?: number;
  close?: (code?: number, reason?: string) => void;
  connected?: boolean;
  disconnect?: () => void;
  emit?: (event: string, payload: Packet) => void;
  on?: (event: string, handler: (data: unknown) => void) => void;
  readyState?: number;
  removeAllListeners?: (event?: string) => void;
  send?: (payload: Buffer) => void;
  isOpen?: (() => boolean) | boolean;
};

const OUTBOUND_BACKPRESSURE_LOG_COOLDOWN_MS = 5000;
const WS_CLOSE_BACKPRESSURE = 1013;

export class PlayerSession {
  private channel: SessionChannel;
  private player?: Player;
  private lastBackpressureLogAt = 0;
  private sceneBaseX = -1;
  private sceneBaseY = -1;
  private playerSyncState?: PlayerSyncState;
  private npcSyncState: NpcSyncState = createNpcSyncState();
  private appearanceCache = new Map<number, { player: Player; payload: Buffer }>();
  private lastMusicRegion = -1;
  private lastMusicTrack = -1;
  private lastGroundItemRegion = -1;

  constructor(channel: SessionChannel) {
    this.channel = channel;
  }

  public async finalizeLogin(msg: LoginDetailsMessage) {
    this.channel.removeAllListeners?.("packet");
    this.channel.on?.("packet", (_data: unknown) => {
      // Legacy socket.io login path is not used by the WebSocket server bootstrap.
    });
  }

  public write(_builder: PacketBuilder) {
    // Unported callers remain no-ops until they use a native packet encoder.
  }

  public flush(tick = 0) {
    this.flushClient(tick);
  }

  // public getPlayer(): Player {
  //     return this.player;
  // }

  public setPlayer(player: Player) {
    this.player = player;
  }

  public getChannel(): SessionChannel {
    return this.channel;
  }

  public sendClientPacket(frame: Buffer): boolean {
    if (!this.isBinaryChannelOpen() || this.getBufferedAmount() >= NetworkConstants.OUTBOUND_WS_BUFFER_CRITICAL_BYTES) {
      return true;
    }
    try {
      this.channel.send?.(frame);
    } catch (error) {
      console.warn("[PlayerSession] client packet send failed", error);
    }
    return true;
  }

  private flushClient(tick: number): void {
    const player = this.player;
    if (!player || !this.isBinaryChannelOpen()) return;
    if (this.getBufferedAmount() >= NetworkConstants.OUTBOUND_WS_BUFFER_CRITICAL_BYTES) {
      this.closeBackpressuredWebSocket("critical_buffered_amount");
      return;
    }

    const location = player.getLocation();
    const current = {
      x: location.getX(),
      y: location.getY(),
      level: location.getZ(),
    };
    const musicRegion = ((current.x >> 6) << 8) | (current.y >> 6);
    if (musicRegion !== this.lastGroundItemRegion) {
      this.lastGroundItemRegion = musicRegion;
      require("../game/entity/impl/grounditem/ItemOnGroundManager")
        .ItemOnGroundManager.onRegionChange(player);
    }
    if (musicRegion !== this.lastMusicRegion) {
      this.lastMusicRegion = musicRegion;
      const track = Music.forRegion(musicRegion);
      if (track !== undefined && track !== this.lastMusicTrack) {
        this.lastMusicTrack = track;
        this.sendClientPacket(encodePlaySong(track));
      }
    }
    let playerSync: Buffer;
    if (!this.playerSyncState) {
      this.sceneBaseX = Math.max(0, (current.x - 48) & ~7);
      this.sceneBaseY = Math.max(0, (current.y - 48) & ~7);
      playerSync = encodeInitialPlayerSync(
        player.getIndex(), current.x, current.y, current.level, tick
      );
      this.playerSyncState = createPlayerSyncState(player.getIndex(), current);
    } else {
      const localX = current.x - this.sceneBaseX;
      const localY = current.y - this.sceneBaseY;
      if (localX < 16 || localX >= 88) this.sceneBaseX = Math.max(0, (current.x - 48) & ~7);
      if (localY < 16 || localY >= 88) this.sceneBaseY = Math.max(0, (current.y - 48) & ~7);
      const views: PlayerView[] = [player, ...player.getLocalPlayers()].map((target) =>
        this.createPlayerView(target)
      );
      playerSync = encodePlayerSync(
        player.getIndex(),
        this.sceneBaseX,
        this.sceneBaseY,
        tick,
        views,
        this.playerSyncState
      );
    }

    const npcViews: NpcView[] = player.getLocalNpcs().map((npc) => {
      const location = npc.getLocation();
      const face = npc.getFace()?.getDirection?.();
      return {
        ...this.createActorUpdates(npc, npc.getDefinition().getHitpoints(), false),
        interactionIndex: this.interactionIndex(npc.getInteractingMobile()),
        index: npc.getIndex(),
        typeId: npc.getId(),
        x: location.getX(),
        y: location.getY(),
        level: location.getZ(),
        rotation: this.clientDirection(face),
        walkDirection: this.clientDirection(npc.getWalkingDirection()),
        runDirection: this.clientDirection(npc.getRunningDirection()),
      };
    });
    const localForceMovement = player.getForceMovement();
    const npcLocal = localForceMovement
      ? {
          x: localForceMovement.getStart().getX() + localForceMovement.getEnd().getX(),
          y: localForceMovement.getStart().getY() + localForceMovement.getEnd().getY(),
          level: current.level,
        }
      : current;
    const npcSync = encodeNpcSync(tick, npcLocal, npcViews, this.npcSyncState);

    try {
      this.channel.send?.(encodeTick(tick, Date.now()));
      this.channel.send?.(playerSync);
      this.channel.send?.(npcSync);
    } catch (error) {
      console.warn("[PlayerSession] client sync failed", error);
    }
  }

  private createPlayerView(player: Player): PlayerView {
    const location = player.getLocation();
    const dirty = player.getUpdateFlag().flagged(Flag.APPEARANCE);
    const cached = this.appearanceCache.get(player.getIndex());
    let payload = cached?.player === player && !dirty ? cached.payload : undefined;
    if (!payload) {
      const look = player.getAppearance().getLook();
      const equipment = player.getEquipment().getItems();
      const skillAnimation = player.getSkillAnimation();
      const weapon = equipment[3]?.getDefinition?.();
      const animations = skillAnimation > 0
        ? new Array(7).fill(skillAnimation)
        : [
            weapon?.getStandAnim?.() ?? 808,
            823,
            weapon?.getWalkAnim?.() ?? 819,
            820,
            821,
            822,
            weapon?.getRunAnim?.() ?? 824,
          ];
      payload = encodePlayerAppearance(
        {
          gender: look[Appearance.GENDER] ?? 0,
          colors: [
            look[Appearance.HAIR_COLOUR],
            look[Appearance.TORSO_COLOUR],
            look[Appearance.LEG_COLOUR],
            look[Appearance.FEET_COLOUR],
            look[Appearance.SKIN_COLOUR],
          ].map((value) => value ?? 0),
          kits: [
            look[Appearance.HEAD],
            look[Appearance.BEARD],
            look[Appearance.CHEST],
            look[Appearance.ARMS],
            look[Appearance.HANDS],
            look[Appearance.LEGS],
            look[Appearance.FEET],
          ].map((value) => value ?? -1),
          equip: equipment.map((item) => item?.getId?.() ?? -1),
          equipQty: equipment.map((item) => item?.getAmount?.() ?? 0),
        },
        player.getUsername(),
        player.getSkillManager().getCombatLevel(),
        player.getSkillManager().getTotalLevel(),
        animations
      );
      this.appearanceCache.set(player.getIndex(), { player, payload });
    }
    const updates = this.createActorUpdates(
      player,
      player.getSkillManager().getMaxLevel(Skill.HITPOINTS),
      player === this.player
    );
    const positionToFace = player.getPositionToFace();
    const forceMovement = player.getForceMovement();
    const forceMovementDirty = player.getUpdateFlag().flagged(Flag.FORCED_MOVEMENT);
    if (forceMovementDirty && forceMovement && !updates.animation && forceMovement.getAnimation() > 0) {
      updates.animation = { id: forceMovement.getAnimation(), delay: 0 };
    }
    return {
      ...updates,
      // Always resolve the current interacting target (like npcViews below), instead of
      // only when Flag.ENTITY_INTERACTION fired this tick - otherwise a player who becomes
      // newly visible mid-fight (e.g. walks into view of an already-engaged pair) never
      // receives who their target is facing, since the flag already fired on an earlier
      // tick they weren't watching.
      interactionIndex: this.interactionIndex(player.getInteractingMobile()),
      index: player.getIndex(),
      x: location.getX(),
      y: location.getY(),
      level: location.getZ(),
      appearance: payload,
      appearanceDirty: dirty,
      faceDirection: player.getUpdateFlag().flagged(Flag.FACE_POSITION) && positionToFace
        ? this.faceDirection(location, positionToFace)
        : undefined,
      forcedMovement: forceMovementDirty && forceMovement
        ? {
            startDeltaX: forceMovement.getStart().getX() - location.getX(),
            startDeltaY: forceMovement.getStart().getY() - location.getY(),
            endDeltaX: forceMovement.getEnd().getX(),
            endDeltaY: forceMovement.getEnd().getY(),
            startCycleOffset: forceMovement.getSpeed(),
            endCycleOffset: forceMovement.getReverseSpeed(),
            direction: [1024, 1536, 0, 512][forceMovement.getDirection()] ?? forceMovement.getDirection(),
          }
        : undefined,
      forcedMovementEnd: forceMovement
        ? {
            x: forceMovement.getStart().getX() + forceMovement.getEnd().getX(),
            y: forceMovement.getStart().getY() + forceMovement.getEnd().getY(),
            level: location.getZ(),
          }
        : undefined,
    };
  }

  private createActorUpdates(actor: any, maxHitpoints: number, mine: boolean): ActorUpdateView {
    const flags = actor.getUpdateFlag();
    const hits = [];
    if (flags.flagged(Flag.SINGLE_HIT) && actor.getPrimaryHit()) hits.push(actor.getPrimaryHit());
    if (flags.flagged(Flag.DOUBLE_HIT) && actor.getSecondaryHit()) hits.push(actor.getSecondaryHit());
    const interaction = actor.getInteractingMobile();
    const animation = actor.getAnimation();
    const graphic = actor.getGraphic();
    return {
      forcedChat: flags.flagged(Flag.FORCED_CHAT) && actor.getForcedChat() != null
        ? actor.getForcedChat()
        : undefined,
      interactionIndex: flags.flagged(Flag.ENTITY_INTERACTION)
        ? this.interactionIndex(interaction)
        : undefined,
      animation: flags.flagged(Flag.ANIMATION) && animation
        ? { id: animation.getId(), delay: animation.getDelay() }
        : undefined,
      graphic: flags.flagged(Flag.GRAPHIC) && graphic
        ? { id: graphic.getId(), height: graphic.getHeight(), delay: graphic.getDelay() }
        : undefined,
      hits: hits.length > 0
        ? hits.map((hit: any) => ({
            type: this.hitsplatType(hit.getHitmask(), mine),
            damage: hit.getDamage(),
          }))
        : undefined,
      health: hits.length > 0
        ? { current: actor.getHitpoints(), max: maxHitpoints }
        : undefined,
    };
  }

  private hitsplatType(mask: HitMask, mine: boolean): number {
    if (mask === HitMask.BLUE) return mine ? 12 : 13;
    if (mask === HitMask.GREEN) return mine ? 65 : 66;
    if (mask === HitMask.YELLOW) return mine ? 22 : 23;
    return mine ? 16 : 17;
  }

  private interactionIndex(target: any): number {
    return target == null ? -1 : target.getIndex() + (target.isPlayer() ? 0x8000 : 0);
  }

  private faceDirection(from: any, to: any): number {
    const dx = from.getX() - to.getX();
    const dy = from.getY() - to.getY();
    return dx === 0 && dy === 0 ? 0 : (Math.atan2(dx, dy) * (1024 / Math.PI)) & 2047;
  }

  private clientDirection(direction: { getX(): number; getY(): number } | null | undefined): number {
    if (!direction) return -1;
    const x = direction.getX();
    const y = direction.getY();
    if (x === 0 && y === 0) return -1;
    return [0, 1, 2, 3, -1, 4, 5, 6, 7][(y + 1) * 3 + x + 1] ?? -1;
  }

  private isBinaryChannelOpen(): boolean {
    const isOpen = this.channel.isOpen;
    if (typeof isOpen === "function") {
      return isOpen.call(this.channel);
    }
    if (typeof isOpen === "boolean") {
      return isOpen;
    }
    if (typeof this.channel.readyState === "number") {
      return this.channel.readyState === 1;
    }
    return true;
  }

  private getBufferedAmount(): number {
    const amount = this.channel.bufferedAmount;
    return typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ? amount
      : 0;
  }

  private closeBackpressuredWebSocket(reason: string): void {
    this.logBackpressure(reason);
    try {
      if (typeof this.channel.close === "function") {
        this.channel.close(WS_CLOSE_BACKPRESSURE, "backpressure");
        return;
      }
      this.channel.disconnect?.();
    } catch (err) {
      console.error("[PlayerSession] failed to close backpressured websocket", err);
    }
  }

  private logBackpressure(reason: string): void {
    const now = Date.now();
    if (now - this.lastBackpressureLogAt < OUTBOUND_BACKPRESSURE_LOG_COOLDOWN_MS) {
      return;
    }
    this.lastBackpressureLogAt = now;
    console.warn("[PlayerSession] outbound_backpressure", {
      reason,
      player: this.player?.getUsername?.() ?? "unknown",
      bufferedAmount: this.getBufferedAmount(),
    });
  }
}
