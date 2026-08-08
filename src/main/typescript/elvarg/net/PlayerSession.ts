import { LoginDetailsMessage } from "./login/LoginDetailsMessage";
import { Packet } from "./packet/Packet";
import { PacketBuilder } from "./packet/PacketBuilder";
import { PacketConstants } from "./packet/PacketConstants";
import { NetworkConstants } from "./NetworkConstants";
import { PacketType } from "./packet/PacketType";
import { IsaacRandom } from "./security/IsaacRandom";
import {
  getExpectedOutboundPacketSize,
  getExpectedOutboundPacketType,
} from "./OutboundPacketProfile";
import type { Player } from "../game/entity/impl/player/Player";
import { GameConstants } from "../game/GameConstants";
import { Appearance } from "../game/model/Appearance";
import { Flag } from "../game/model/Flag";
import { FastDeque } from "../util/FastDeque";
import { PluginManager } from "../plugins/PluginManager";
import { NOPPacketListener } from "./packet/impl/NOPPacketListener";
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

const PACKET_OUT_LOGGING_ENABLED = process.env.PACKET_OUT_LOGGING === "1";
const ESTABLISHED_STAGE = "ESTABLISHED";
const NOP_PACKET_LISTENER = new NOPPacketListener();
const OUTBOUND_BACKPRESSURE_LOG_COOLDOWN_MS = 5000;
const WS_CLOSE_BACKPRESSURE = 1013;

export interface OutboundPacketMeta {
  opcode: number;
  encOpcode: number;
  payloadLength: number;
  packetType: PacketType;
  payloadPreview?: string;
}

export class PlayerSession {
  private packetsQueue: FastDeque<Packet> = new FastDeque<Packet>();
  private outboundFrames: Array<{ opcode: number; frame: Buffer }> = [];
  private outboundFrameBytes = 0;
  private outboundSocketPackets: Packet[] = [];
  private lastPacketOpcodeQueue: number[] = [];
  private channel: SessionChannel;
  private encryptor?: IsaacRandom;
  private outboundBatchingEnabled = false;
  private outboundPacketObserver?: (meta: OutboundPacketMeta) => void;
  private shouldLogPacketOut?: () => boolean;
  private player?: Player;
  private lastBackpressureLogAt = 0;
  private droppedOutboundFrames = 0;
  private clientProtocol = false;
  private sceneBaseX = -1;
  private sceneBaseY = -1;
  private playerSyncState?: PlayerSyncState;
  private npcSyncState: NpcSyncState = createNpcSyncState();
  private appearanceCache = new Map<number, { player: Player; payload: Buffer }>();
  private lastMusicRegion = -1;
  private lastMusicTrack = -1;

  constructor(
    channel: SessionChannel,
    outboundPacketObserver?: (meta: OutboundPacketMeta) => void,
    shouldLogPacketOut?: () => boolean
  ) {
    this.channel = channel;
    this.outboundPacketObserver = outboundPacketObserver;
    this.shouldLogPacketOut = shouldLogPacketOut;
    // this.player = new Player(this);
  }

  public async finalizeLogin(msg: LoginDetailsMessage) {
    this.channel.removeAllListeners?.("packet");
    this.channel.on?.("packet", (_data: unknown) => {
      // Legacy socket.io login path is not used by the WebSocket server bootstrap.
    });
  }

  public queuePacket(msg: Packet) {
    if (!msg) {
      return;
    }

    if (this.packetsQueue.length >= NetworkConstants.PACKET_QUEUE_LIMIT) {
      return;
    }

    if (
      msg.getOpcode() == PacketConstants.EQUIP_ITEM_OPCODE ||
      msg.getOpcode() == PacketConstants.SPECIAL_ATTACK_OPCODE
    ) {
      this.packetsQueue.unshift(msg);
      return;
    }

    this.packetsQueue.push(msg);
  }

  public processPackets() {
    const player = this.player;
    if (!player) {
      this.packetsQueue.clear();
      return;
    }

    for (let i = 0; i < NetworkConstants.PACKET_PROCESS_LIMIT; i++) {
      const packet = this.packetsQueue.shift();
      if (packet == null) {
        break;
      }
      if (this.lastPacketOpcodeQueue.length > 4) {
        this.lastPacketOpcodeQueue.shift();
      }
      this.lastPacketOpcodeQueue.push(packet.getOpcode());

      const opcode = packet.getOpcode();
      const exec =
        PluginManager.getPacketListener(opcode) ??
        PacketConstants.PACKETS.get(opcode) ??
        NOP_PACKET_LISTENER;

      try {
        const hookPacket = new Packet(opcode, packet.getBuffer());
        PluginManager.emitPacketReceived({
          opcode,
          packet: hookPacket,
          player,
          stage: ESTABLISHED_STAGE,
        });
        exec.execute(player, packet);
      } catch (e) {
        console.log("processedPackets: " + this.lastPacketOpcodeQueue);
        console.error(e);
      } finally {
        packet.getBuffer();
      }
    }
  }

  public write(builder: PacketBuilder) {
    // Legacy Elvarg frames are not valid on the primary client connection. New packet
    // encoders replace these incrementally as the server port progresses.
    if (this.clientProtocol) return;
    const isBinaryTransport = this.isBinaryTransport();
    const outbound = this.buildOutboundPacket(builder, isBinaryTransport);
    if (!outbound) {
      return;
    }

    if (!this.outboundBatchingEnabled) {
      this.writeImmediately(outbound);
      return;
    }

    if (isBinaryTransport) {
      this.queueWebSocketFrame(outbound.packet.getOpcode(), outbound.encodedFrame as Buffer);
      return;
    }

    if (!this.channel.connected || typeof this.channel.emit !== "function") {
      return;
    }

    this.outboundSocketPackets.push(outbound.packet);
  }

  public flush(tick = 0) {
    if (this.clientProtocol) {
      this.flushClient(tick);
      return;
    }
    if (this.isBinaryTransport()) {
      if (!this.isBinaryChannelOpen()) {
        this.clearWebSocketQueue();
        return;
      }
      if (this.getBufferedAmount() >= NetworkConstants.OUTBOUND_WS_BUFFER_CRITICAL_BYTES) {
        this.closeBackpressuredWebSocket("critical_buffered_amount");
        return;
      }

      let sent = 0;
      while (
        this.outboundFrames.length > 0 &&
        sent < NetworkConstants.OUTBOUND_WS_MAX_FRAMES_PER_FLUSH &&
        this.getBufferedAmount() < NetworkConstants.OUTBOUND_WS_BUFFER_HIGH_WATER_BYTES
      ) {
        const queued = this.outboundFrames.shift();
        if (!queued) {
          continue;
        }
        this.outboundFrameBytes = Math.max(
          0,
          this.outboundFrameBytes - queued.frame.length
        );
        try {
          this.channel.send?.(queued.frame);
          sent++;
        } catch (err) {
          // Ground-item/global updates can target stale sessions; never let this crash the server loop.
          console.error("[PlayerSession.flush] websocket send failed", err);
          break;
        }
      }

      if (this.outboundFrames.length > 0) {
        this.logBackpressure("flush_deferred");
      }
      return;
    }

    if (!this.channel.connected || typeof this.channel.emit !== "function") {
      this.outboundSocketPackets.length = 0;
      return;
    }

    while (this.outboundSocketPackets.length > 0) {
      const packet = this.outboundSocketPackets.shift();
      if (!packet) {
        continue;
      }
      try {
        this.channel.emit("packet", packet);
      } catch (ex) {
        console.error(ex);
        break;
      }
    }
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

  public setEncryptor(enc: IsaacRandom) {
    this.encryptor = enc;
  }

  public enableOutboundBatching(): void {
    this.outboundBatchingEnabled = true;
  }

  public useClientProtocol(): void {
    this.clientProtocol = true;
    this.sceneBaseX = -1;
    this.sceneBaseY = -1;
    this.playerSyncState = undefined;
    this.npcSyncState = createNpcSyncState();
    this.appearanceCache.clear();
    this.lastMusicRegion = -1;
    this.lastMusicTrack = -1;
    this.clearWebSocketQueue();
  }

  public sendClientPacket(frame: Buffer): boolean {
    if (!this.clientProtocol) return false;
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

  private isBinaryTransport(): boolean {
    return this.channel.binaryTransport === true && typeof this.channel.send === "function";
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

  private isWebSocketBackpressured(): boolean {
    return (
      this.getBufferedAmount() >= NetworkConstants.OUTBOUND_WS_BUFFER_HIGH_WATER_BYTES ||
      this.outboundFrameBytes >= NetworkConstants.OUTBOUND_WS_QUEUE_HIGH_WATER_BYTES ||
      this.outboundFrames.length >= NetworkConstants.OUTBOUND_WS_QUEUE_MAX_FRAMES
    );
  }

  private queueWebSocketFrame(opcode: number, frame: Buffer): void {
    if (!frame) {
      return;
    }

    if (this.isWebSocketBackpressured()) {
      this.logBackpressure("enqueue_backpressure");
      if (
        this.getBufferedAmount() >= NetworkConstants.OUTBOUND_WS_BUFFER_CRITICAL_BYTES ||
        this.outboundFrames.length >= NetworkConstants.OUTBOUND_WS_QUEUE_MAX_FRAMES ||
        this.outboundFrameBytes + frame.length >
          NetworkConstants.OUTBOUND_WS_QUEUE_HIGH_WATER_BYTES
      ) {
        this.closeBackpressuredWebSocket("queue_capacity_exceeded");
        return;
      }
    }

    if (
      this.outboundFrames.length >= NetworkConstants.OUTBOUND_WS_QUEUE_MAX_FRAMES ||
      this.outboundFrameBytes + frame.length >
        NetworkConstants.OUTBOUND_WS_QUEUE_HIGH_WATER_BYTES
    ) {
      this.closeBackpressuredWebSocket("queue_full");
      return;
    }

    this.outboundFrames.push({ opcode, frame });
    this.outboundFrameBytes += frame.length;
  }

  private clearWebSocketQueue(): void {
    this.outboundFrames.length = 0;
    this.outboundFrameBytes = 0;
  }

  private closeBackpressuredWebSocket(reason: string): void {
    this.logBackpressure(reason);
    this.clearWebSocketQueue();
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
      queuedFrames: this.outboundFrames.length,
      queuedBytes: this.outboundFrameBytes,
      droppedTotal: this.droppedOutboundFrames,
    });
  }

  private buildOutboundPacket(
    builder: PacketBuilder,
    encodeForBinaryTransport: boolean
  ): { packet: Packet; encodedFrame: Buffer | null } | null {
    try {
      const packet = builder.toPacket();
      const opcode = packet.getOpcode();
      if (!Number.isInteger(opcode) || opcode < 0 || opcode > 255) {
        console.warn(
          `[PlayerSession.write] dropping packet with invalid opcode=${opcode}`
        );
        return null;
      }

      const payload = packet.getBuffer();
      const expectedPacketType = getExpectedOutboundPacketType(opcode);
      const expectedPacketSize = getExpectedOutboundPacketSize(opcode);
      const packetType = expectedPacketType ?? packet.getType();
      if (
        expectedPacketSize != null &&
        expectedPacketSize >= 0 &&
        payload.length !== expectedPacketSize
      ) {
        console.error(
          `[PlayerSession.write] dropping malformed fixed packet opcode=${opcode} expectedLen=${expectedPacketSize} actualLen=${payload.length}`
        );
        return null;
      }
      if (expectedPacketType != null && expectedPacketType !== packet.getType()) {
        console.warn(
          `[PlayerSession.write] correcting packet type opcode=${opcode} expected=${expectedPacketType} actual=${packet.getType()}`
        );
      }

      const encodedFrame = encodeForBinaryTransport
        ? this.encodePacket(opcode, payload, packetType)
        : null;
      if (encodeForBinaryTransport && !encodedFrame) {
        return null;
      }

      const payloadPreview = payload
        .subarray(0, Math.min(16, payload.length))
        .toString("hex");
      const encOpcode = encodedFrame?.readUInt8(0) ?? opcode;
      if (this.outboundPacketObserver) {
        try {
          this.outboundPacketObserver({
            opcode,
            encOpcode,
            payloadLength: payload.length,
            packetType,
            payloadPreview,
          });
        } catch {
          // Never fail packet writes because of debug observers.
        }
      }
      if (
        PACKET_OUT_LOGGING_ENABLED &&
        GameConstants.SERVER_LOG_WRITES_ENABLED &&
        (!this.shouldLogPacketOut || this.shouldLogPacketOut())
      ) {
        try {
          console.log(
            `${new Date().toISOString()} [packet.out] opcode=${opcode} enc=${encOpcode} type=${packetType} len=${payload.length} player=${this.player?.getUsername?.() ?? "unknown"}`
          );
        } catch {
          // best-effort logging; never throw here
        }
      }

      return { packet, encodedFrame };
    } catch (err) {
      console.error("[PlayerSession.write] failed to queue outbound packet", err);
      return null;
    }
  }

  private encodePacket(
    opcode: number,
    payload: Buffer,
    packetType: PacketType
  ): Buffer | null {
    const encOpcode =
      this.encryptor != null ? (opcode + this.encryptor.nextInt()) & 0xff : opcode;

    let header: Buffer;
    switch (packetType) {
      case PacketType.VARIABLE:
      case PacketType.VARIABLE_BYTE:
        if (payload.length > 0xff) {
          console.error(
            `[PlayerSession.write] dropping oversized variable packet opcode=${opcode} len=${payload.length}`
          );
          return null;
        }
        header = Buffer.alloc(2);
        header.writeUInt8(encOpcode, 0);
        header.writeUInt8(payload.length, 1);
        break;
      case PacketType.VARIABLE_SHORT:
        header = Buffer.alloc(3);
        header.writeUInt8(encOpcode, 0);
        header.writeUInt16BE(payload.length, 1);
        break;
      default:
        header = Buffer.from([encOpcode]);
    }

    return Buffer.concat([header, payload]);
  }

  private writeImmediately(outbound: {
    packet: Packet;
    encodedFrame: Buffer | null;
  }): void {
    if (this.isBinaryTransport()) {
      if (!this.isBinaryChannelOpen()) {
        return;
      }
      if (!outbound.encodedFrame) {
        return;
      }
      if (this.getBufferedAmount() >= NetworkConstants.OUTBOUND_WS_BUFFER_CRITICAL_BYTES) {
        this.closeBackpressuredWebSocket("immediate_send_skipped");
        return;
      }
      try {
        this.channel.send?.(outbound.encodedFrame);
      } catch (err) {
        console.error("[PlayerSession.write] websocket send failed", err);
      }
      return;
    }

    if (!this.channel.connected || typeof this.channel.emit !== "function") {
      return;
    }
    try {
      this.channel.emit("packet", outbound.packet);
    } catch (err) {
      console.error(err);
    }
  }
}
