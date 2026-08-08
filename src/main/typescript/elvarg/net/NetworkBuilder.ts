import { createServer } from "http";
import { WebSocketServer } from "ws";
import { GameConstants } from "../game/GameConstants";
import { World } from "../game/World";
import { Player } from "../game/entity/impl/player/Player";
import { Appearance } from "../game/model/Appearance";
import { Flag } from "../game/model/Flag";
import { Location } from "../game/model/Location";
import { PlayerRights } from "../game/model/rights/PlayerRights";
import { PluginManager } from "../plugins/PluginManager";
import { Misc } from "../util/Misc";
import { WebSocketBinaryChannel } from "./BinaryChannel";
import { PlayerSession } from "./PlayerSession";
import { CachePipeline } from "../game/cache/CachePipeline";
import { MapRegionReplacementManager } from "../game/collision/MapRegionReplacementManager";
import {
  decodeClientPackets,
  encodeDefaultAnimations,
  encodeGameframeBootstrap,
  encodeHandshake,
  encodeLoginResponse,
  encodeLogoutResponse,
  encodeWelcome,
  PlayerAppearance,
} from "./protocol/ClientProtocol";
import { ObjectActionPacketListener } from "./packet/impl/ObjectActionPacketListener";
import { NPCOptionPacketListener } from "./packet/impl/NPCOptionPacketListener";
import { ChatPacketListener } from "./packet/impl/ChatPacketListener";

const OBJECT_ACTIONS = new ObjectActionPacketListener();
const NPC_ACTIONS = new NPCOptionPacketListener();

type PendingLogin = {
  username: string;
  passwordHash: string;
  save: any | null;
};

export class NetworkBuilder {
  public initialize(port: number): WebSocketServer {
    const http = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      if (request.url === "/regions") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ regions: MapRegionReplacementManager.getRegionIds() }));
        return;
      }
      const match = /^\/regions\/(\d+)\.pack$/.exec(request.url ?? "");
      const pack = match ? MapRegionReplacementManager.getRegionPack(Number(match[1])) : null;
      if (!pack) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Length", pack.length);
      response.end(pack);
    });
    const server = new WebSocketServer({ server: http, perMessageDeflate: false, maxPayload: 4096 });
    server.on("connection", (socket) => new ClientConnection(new WebSocketBinaryChannel(socket)));
    server.on("listening", () => console.info(`[network] client websocket listening on ${port}`));
    server.on("error", (error) => console.error("[network] websocket error", error));
    http.listen(port);
    return server;
  }
}

class ClientConnection {
  private static readonly pendingNames = new Set<string>();
  private pending?: PendingLogin;
  private reservedName?: string;
  private player?: Player;
  private closed = false;
  private input = Promise.resolve();

  constructor(private readonly channel: WebSocketBinaryChannel) {
    channel.onData((frame) => {
      this.input = this.input.then(() => this.handle(frame)).catch((error) => {
        console.warn("[network] client packet rejected", error);
      });
    });
    channel.onError((error) => {
      console.warn("[network] websocket client error", error.message);
      this.cleanup("socket_error");
    });
    channel.onClose(() => this.cleanup("socket_close"));
    this.send(encodeWelcome(GameConstants.GAME_ENGINE_PROCESSING_CYCLE_RATE, Date.now()));
  }

  private async handle(frame: Buffer): Promise<void> {
    let packets;
    try {
      packets = decodeClientPackets(frame);
    } catch (error) {
      console.warn("[network] rejected malformed client packet", (error as Error).message);
      return;
    }

    for (const packet of packets) {
      switch (packet.type) {
        case "move":
          this.walk(packet.worldX, packet.worldY, packet.modifierFlags);
          continue;
        case "npc_option":
          if (this.player) NPC_ACTIONS.executeOption(this.player, packet.index, packet.clickType);
          continue;
        case "object_option":
          if (this.player) OBJECT_ACTIONS.executeAction(
            this.player, packet.id, packet.x, packet.y, packet.clickType, packet.action
          );
          continue;
        case "chat":
          if (this.player && packet.messageType === "public") {
            ChatPacketListener.handleText(this.player, packet.text);
          }
          continue;
        case "raw":
          continue;
        case "face":
        case "hello":
        case "ping":
          continue;
        case "login":
          await this.login(packet.username, packet.password, packet.revision);
          continue;
        case "handshake":
          this.enterWorld();
          continue;
        case "logout":
          this.send(encodeLogoutResponse());
          this.cleanup("logout");
          this.channel.close(1000, "logout");
          return;
      }
    }
  }

  private async login(rawUsername: string, password: string, revision: number): Promise<void> {
    this.releasePendingName();
    const protocolName = Misc.formatNameForProtocol(rawUsername.trim());
    const username = Misc.formatText(protocolName);
    const key = protocolName.toLowerCase();

    if (revision !== CachePipeline.getActive().revision) {
      this.failLogin(6, "Please close the client and reload to update.");
      return;
    }
    if (
      protocolName.length < 1 ||
      protocolName.length > 12 ||
      !Misc.isValidName(protocolName) ||
      password.length < 1 ||
      password.length > 64
    ) {
      this.failLogin(3, "Invalid username or password.");
      return;
    }
    if (
      World.getPlayers().isFull() ||
      World.getPlayerByName(username) ||
      World.getAddPlayerQueue().some((player) => player.getUsername().toLowerCase() === username.toLowerCase()) ||
      ClientConnection.pendingNames.has(key)
    ) {
      this.failLogin(World.getPlayers().isFull() ? 2 : 5, World.getPlayers().isFull()
        ? "This world is full."
        : "Your account is already logged in.");
      return;
    }
    ClientConnection.pendingNames.add(key);
    this.reservedName = key;

    let save: any | null = null;
    try {
      save = GameConstants.PLAYER_PERSISTENCE.load(username);
    } catch (error) {
      console.error(`[login] failed to load ${username}`, error);
      this.releasePendingName();
      this.failLogin(8, "The login server is busy.");
      return;
    }

    let passwordHash = "";
    try {
      if (save) {
        const stored = String(save.getPasswordHashWithSalt?.() ?? "");
        let valid = stored === password;
        if (!valid && stored.includes(":")) {
          try {
            valid = await GameConstants.PLAYER_PERSISTENCE.checkPassword(password, save);
          } catch {
            valid = false;
          }
        }
        if (stored && !valid) {
          this.releasePendingName();
          this.failLogin(3, "Invalid username or password.");
          return;
        }
        passwordHash = valid && stored.includes(":")
          ? stored
          : await GameConstants.PLAYER_PERSISTENCE.encryptPassword(password);
      } else {
        passwordHash = await GameConstants.PLAYER_PERSISTENCE.encryptPassword(password);
      }
    } catch (error) {
      console.error(`[login] failed to authenticate ${username}`, error);
      this.releasePendingName();
      this.failLogin(8, "The login server is busy.");
      return;
    }

    this.pending = { username, passwordHash, save };
    this.send(encodeLoginResponse(true, -1, "", username));
    console.info(`[login] accepted ${username} from ${this.channel.remoteAddress}`);
  }

  private enterWorld(): void {
    if (!this.pending || this.player) return;
    const pending = this.pending;
    const session = new PlayerSession(this.channel);
    session.useClientProtocol();
    const player = new Player(session, GameConstants.DEFAULT_LOCATION.clone());
    session.setPlayer(player);
    player.setUsername(pending.username);
    player.setLongUsername(Misc.stringToLongBigInt(pending.username));
    player.setHostAddress(this.channel.remoteAddress);
    if (pending.save) pending.save.applyToPlayer(player);
    player.setPasswordHashWithSalt(pending.passwordHash);
    player.setLastKnownRegion(player.getLocation().clone());
    player.setRegionHeight(player.getLocation().getZ());
    player.getUpdateFlag().flag(Flag.APPEARANCE);

    if (!World.getPlayers().add(player)) {
      this.failLogin(2, "This world is full.");
      this.channel.close(1013, "world full");
      return;
    }
    this.player = player;
    this.releasePendingName();
    World.refreshActiveRegions();
    PluginManager.emitPlayerLogin({ player, username: player.getUsername() });
    this.send(
      encodeHandshake(
        player.getIndex(),
        player.getUsername(),
        PlayerRights.hasAdminRights(player),
        this.getPlayerAppearance(player)
      )
    );
    this.send(encodeDefaultAnimations());
    for (const packet of encodeGameframeBootstrap(player.getUsername())) this.send(packet);
  }

  private walk(x: number, y: number, modifierFlags: number): void {
    const player = this.player;
    if (!player) return;
    const run = modifierFlags === 2 ||
      ((modifierFlags & 1) !== 0 ? !player.isRunningReturn() : player.isRunningReturn());
    player.setRunning(run);
    player.getMovementQueue().requestWalk(
      new Location(x, y, player.getLocation().getZ())
    );
  }

  private getPlayerAppearance(player: Player): PlayerAppearance {
    const look = player.getAppearance().getLook();
    const displayEquipment = player.getEquipment().getItems();
    return {
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
      equip: displayEquipment.map((item) => item?.getId?.() ?? -1),
    };
  }

  private failLogin(code: number, message: string): void {
    this.send(encodeLoginResponse(false, code, message));
  }

  private send(packet: Buffer): void {
    if (this.channel.isOpen()) this.channel.send(packet);
  }

  private releasePendingName(): void {
    if (this.reservedName) ClientConnection.pendingNames.delete(this.reservedName);
    this.reservedName = undefined;
    this.pending = undefined;
  }

  private cleanup(source: string): void {
    if (this.closed) return;
    this.closed = true;
    this.releasePendingName();
    if (!this.player) return;
    if (!World.getRemovePlayerQueue().includes(this.player)) {
      World.getRemovePlayerQueue().push(this.player);
    }
    PluginManager.emitPlayerDisconnect({
      player: this.player,
      username: this.player.getUsername(),
      source,
    });
  }
}
