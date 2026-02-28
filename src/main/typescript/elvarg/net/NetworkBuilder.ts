import { randomInt } from "crypto";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { Misc } from "../util/Misc";
import { NetworkConstants } from "./NetworkConstants";
import { LoginResponses } from "./login/LoginResponses";
import { IsaacRandom } from "./security/IsaacRandom";
import { PacketType } from "./packet/PacketType";
import { Player } from "../game/entity/impl/player/Player";
import { Location } from "../game/model/Location";
import { PacketConstants } from "./packet/PacketConstants";
import { Packet } from "./packet/Packet";
import { PlayerSession } from "./PlayerSession";
import { Appearance as GameAppearance } from "../game/model/Appearance";
import { PACKET_GUIDE } from "./PacketGuide";
import { PacketLogger } from "./PacketLogger";
import { NOPPacketListener } from "./packet/impl/NOPPacketListener";
import { Flag } from "../game/model/Flag";
import { World } from "../game/World";
import { PluginManager } from "../plugins/PluginManager";
import { GameConstants } from "../game/GameConstants";
import { DonatorRights } from "../game/model/rights/DonatorRights";
import { PlayerRights } from "../game/model/rights/PlayerRights";
import { Skill } from "../game/model/Skill";
import { ItemOnGroundManager } from "../game/entity/impl/grounditem/ItemOnGroundManager";
import { ObjectManager } from "../game/entity/impl/object/ObjectManager";
import {
  getExpectedOutboundPacketSize,
  getExpectedOutboundPacketType,
} from "./OutboundPacketProfile";
import { getInboundPacketSizeOrUndefined } from "./InboundPacketProfile";

type LoginStage = "HANDSHAKE" | "LOGIN" | "ESTABLISHED";

type Appearance = { gender: number; looks: number[]; colors: number[] };
type PlayerState = {
  username: string;
  index: number;
  location: { x: number; y: number; plane: number };
  appearance: Appearance;
};
type NpcState = { index: number; id: number; location: { x: number; y: number; plane: number } };

// Match Java server defaults (see Appearance#set)
const DEFAULT_LOOKS = [3, 14, 18, 26, 34, 38, 42]; // head, beard, chest, arms, hands, legs, feet
const DEFAULT_COLORS = [2, 14, 5, 4, 0]; // hair, torso, legs, feet, skin
const ALLOWED_COLORS: Array<[number, number]> = [
  [0, 11],
  [0, 15],
  [0, 15],
  [0, 5],
  [0, 7],
];
const FEMALE_LOOK_RANGES: Array<[number, number]> = [
  [45, 54], // head
  [-1, -1], // jaw
  [56, 60], // torso
  [61, 65], // arms
  [67, 68], // hands
  [70, 77], // legs
  [79, 80], // feet
];
const MALE_LOOK_RANGES: Array<[number, number]> = [
  [0, 8], // head
  [10, 17], // jaw
  [18, 25], // torso
  [26, 31], // arms
  [33, 34], // hands
  [36, 40], // legs
  [42, 43], // feet
];
const NPC_BITS = GameConstants.NPC_BITS;

class LoginSession {
  private stage: LoginStage = "HANDSHAKE";
  private serverSeeds: [number, number] | null = null;
  private encryptor: IsaacRandom | null = null;
  private decryptor: IsaacRandom | null = null;
  private player: PlayerState | null = null;
  private gamePlayer: Player | null = null;
  private recvBuffer: Buffer = Buffer.alloc(0);
  private disconnectedCleanupDone = false;
  private recentPacketEvents: Array<{
    direction: "IN" | "OUT";
    opcode: number;
    payloadLength: number;
    label?: string;
    preview?: string;
    timestamp: string;
  }> = [];
  private recentKeepAliveCount = 0;
  private recentKeepAliveAt: string | null = null;
  private pendingInboundPacket: {
    opcode: number;
    encOpcode: number;
    rand: number;
    size: number | null;
    lengthBytes: 0 | 1 | 2;
    headerSize: number;
  } | null = null;

  constructor(private socket: WebSocket) {
    this.log("connection_open", {
      remote: (this.socket as any)?._socket?.remoteAddress ?? "unknown",
    });
    socket.on("message", (data) => {
      try {
        this.onMessage(data);
      } catch (err) {
        this.log("message_handler_error", {
          err: (err as Error)?.message ?? String(err),
          stack: (err as Error)?.stack,
        });
      }
    });
    socket.on("error", (err) => {
      this.log("socket_error", { err: err?.message ?? err });
      this.cleanupDisconnected("socket_error");
      this.socket.close();
    });
    socket.on("close", (code, reason) => {
      this.cleanupDisconnected("socket_close");
      const stack = new Error().stack;
      this.log("connection_closed", {
        code,
        reason: reason instanceof Buffer ? reason.toString("utf8") : reason,
        stage: this.stage,
        stack,
      });
    });
  }

  private onMessage(rawData: RawData) {
    const buffer = Buffer.isBuffer(rawData)
      ? rawData
      : Buffer.from(rawData as ArrayBuffer);

    if (this.stage === "HANDSHAKE") {
      this.handleHandshake(buffer);
      return;
    }
    if (this.stage === "LOGIN") {
      this.handleLogin(buffer);
      return;
    }
    if (this.stage === "ESTABLISHED") {
      this.handleGamePacket(buffer);
    }
  }

  private handleHandshake(buffer: Buffer) {
    this.log("handshake_received", { length: buffer.length, opcode: buffer[0] });
    if (
      buffer.length < 1 ||
      buffer.readUInt8(0) !== NetworkConstants.LOGIN_REQUEST_OPCODE
    ) {
      this.sendResponse(LoginResponses.LOGIN_BAD_SESSION_ID, true, "bad_login_request_opcode");
      return;
    }

    this.serverSeeds = [randomInt(0, 0x7fffffff), randomInt(0, 0x7fffffff)];
    const response = Buffer.alloc(9);
    response.writeUInt8(0, 0);
    response.writeInt32BE(this.serverSeeds[0], 1);
    response.writeInt32BE(this.serverSeeds[1], 5);
    this.socket.send(response);
    this.stage = "LOGIN";
    this.log("handshake_sent", { seeds: this.serverSeeds });
  }

  private handleLogin(buffer: Buffer) {
    if (!this.serverSeeds) {
      this.sendResponse(LoginResponses.LOGIN_BAD_SESSION_ID, true, "missing_server_seeds");
      return;
    }

    let offset = 0;
    if (buffer.length < 5) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "login_buffer_too_small");
      return;
    }

    const connectionType = buffer.readUInt8(offset++);
    if (
      connectionType !== NetworkConstants.NEW_CONNECTION_OPCODE &&
      connectionType !== NetworkConstants.RECONNECTION_OPCODE
    ) {
      this.sendResponse(LoginResponses.LOGIN_BAD_SESSION_ID, true, "bad_connection_type");
      return;
    }

    const encryptedLoginBlockSize = buffer.readUInt8(offset++);
    if (encryptedLoginBlockSize !== buffer.length - 2) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "encrypted_block_size_mismatch");
      return;
    }

    const magicId = buffer.readUInt8(offset++);
    if (magicId !== 0xff) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "bad_magic");
      return;
    }

    const memoryFlag = buffer.readUInt8(offset++);
    if (memoryFlag !== 0 && memoryFlag !== 1) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "bad_memory_flag");
      return;
    }

    const rsaBlockLength = buffer.readUInt8(offset++);
    if (rsaBlockLength > buffer.length - offset) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "rsa_length_too_big");
      return;
    }

    const rsaBytes = buffer.subarray(offset, offset + rsaBlockLength);
    if (rsaBytes.length !== rsaBlockLength) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "rsa_length_mismatch");
      return;
    }

    this.log("rsa_payload", { rsaLength: rsaBlockLength, rsaBytesHex: rsaBytes.toString("hex") });
    const decrypted = this.decryptRsa(rsaBytes);
    if (!decrypted) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "rsa_decrypt_failed");
      return;
    }

    this.log("rsa_decrypted_raw", {
      decryptedHex: decrypted.toString("hex"),
      decryptedLength: decrypted.length,
    });

    const parsed =
      this.parseLoginPayload(decrypted) ?? this.parseLoginPayload(rsaBytes, "raw");
    if (!parsed) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "login_parse_failed");
      return;
    }

    const { securityId, seed0, seed1, seed2, seed3, usernameRaw, password } = parsed;

    this.log("rsa_decrypted", {
      decryptedHex: decrypted.toString("hex"),
      securityId,
      decryptedLength: decrypted.length,
      parsedWith: parsed.parsedFrom,
      seed0,
      seed1,
      seed2,
      seed3,
    });

    if (securityId !== 10 && securityId !== 11) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "bad_security_id");
      return;
    }
    if (
      seed2 !== this.serverSeeds[0] ||
      seed3 !== this.serverSeeds[1]
    ) {
      this.sendResponse(LoginResponses.LOGIN_BAD_SESSION_ID, true, "server_seed_mismatch");
      return;
    }

    const seed = [seed0, seed1, seed2, seed3];
    this.decryptor = new IsaacRandom(seed.slice());
    const encSeed = seed.map((s) => s + 50);
    this.encryptor = new IsaacRandom(encSeed);

    const username = Misc.formatText(usernameRaw.toLowerCase());
    if (
      username.length < 3 ||
      username.length > 30 ||
      password.length < 3 ||
      password.length > 30 ||
      !Misc.isValidName(username)
    ) {
      this.sendResponse(LoginResponses.INVALID_CREDENTIALS_COMBINATION, true, "bad_lengths");
      return;
    }

    this.log("login_success", {
      username,
      securityId,
      seed0,
      seed1,
      seed2,
      seed3,
      passwordLength: password.length,
    });

    const player: PlayerState = {
      username,
      index: 1,
      location: { x: 3089, y: 3524, plane: 0 },
      appearance: this.defaultAppearance(),
    };
    this.player = player;

    // Build game-layer player for packet listeners.
    const session = new PlayerSession(
      this.socket as any,
      (meta) => {
        const label = PACKET_GUIDE[meta.opcode]?.name;
        this.recordRecentPacket(
          "OUT",
          meta.opcode,
          meta.payloadLength,
          label,
          undefined,
          meta.payloadPreview
        );
        PacketLogger.logOutgoing({
          direction: "OUT",
          opcode: meta.opcode,
          stage: this.stage,
          label,
          player: this.player?.username,
          payloadLength: meta.payloadLength,
          payloadPreview: meta.payloadPreview,
        });
      },
      () => this.gamePlayer?.getRights?.() === PlayerRights.DEVELOPER
    );
    if (this.encryptor) {
      session.setEncryptor(this.encryptor);
    }
    const gamePlayer = new Player(session, new Location(player.location.x, player.location.y, player.location.plane));
    session.setPlayer(gamePlayer);
    gamePlayer.setUsername(username);
    gamePlayer.setLongUsername(Misc.stringToLongBigInt(username));
    gamePlayer.setHostAddress((this.socket as any)?._socket?.remoteAddress ?? "");
    const loadedPlayerSave = this.loadPersistedPlayer(gamePlayer, password);
    if (!loadedPlayerSave) {
      gamePlayer.setPasswordHashWithSalt(password);
    }
    this.syncStateFromGamePlayer(player, gamePlayer);
    gamePlayer.setLastKnownRegion(new Location(player.location.x, player.location.y, player.location.plane));
    gamePlayer.setRegionHeight(player.location.plane);
    this.gamePlayer = gamePlayer;
    gamePlayer.getUpdateFlag().flag(Flag.APPEARANCE);
    World.getAddPlayerQueue().push(gamePlayer);
    World.getPlayers().forEach((existing) => {
      if (existing && existing !== gamePlayer) {
        existing.getUpdateFlag().flag(Flag.APPEARANCE);
      }
    });

    // Plain login response
    this.socket.send(
      Buffer.from([
        LoginResponses.LOGIN_SUCCESSFUL,
        this.gamePlayer.getRights().getId() & 0xff,
      ])
    );
    // Encrypted initial packets
    this.sendInitialPackets(player);
    this.sendInitialNpcs(player);
    PluginManager.emitPlayerLogin({
      player: gamePlayer,
      username: gamePlayer.getUsername(),
    });
    this.stage = "ESTABLISHED";
  }

  private loadPersistedPlayer(gamePlayer: Player, loginPassword: string): boolean {
    const persistence = GameConstants.PLAYER_PERSISTENCE;
    if (!persistence) {
      return false;
    }
    let playerSave = null as any;
    try {
      playerSave = persistence.load(gamePlayer.getUsername());
    } catch (err) {
      this.log("persistence_load_failed", {
        username: gamePlayer.getUsername(),
        err: (err as Error)?.message ?? String(err),
      });
      return false;
    }

    if (!playerSave) {
      return false;
    }

    try {
      playerSave.applyToPlayer(gamePlayer);
      this.log("persistence_loaded", {
        username: gamePlayer.getUsername(),
        rightsId: gamePlayer.getRights()?.getId?.() ?? null,
      });
      return true;
    } catch (err) {
      this.log("persistence_apply_failed", {
        username: gamePlayer.getUsername(),
        err: (err as Error)?.message ?? String(err),
      });
      gamePlayer.setPasswordHashWithSalt(loginPassword);
      return false;
    }
  }

  private syncStateFromGamePlayer(player: PlayerState, gamePlayer: Player): void {
    const location = gamePlayer.getLocation();
    player.location = {
      x: location.getX(),
      y: location.getY(),
      plane: location.getZ(),
    };

    const look = gamePlayer.getAppearance().getLook();
    player.appearance = this.normalizeAppearance(
      look[GameAppearance.GENDER] ?? 0,
      [
        look[GameAppearance.HEAD] ?? DEFAULT_LOOKS[0],
        look[GameAppearance.BEARD] ?? DEFAULT_LOOKS[1],
        look[GameAppearance.CHEST] ?? DEFAULT_LOOKS[2],
        look[GameAppearance.ARMS] ?? DEFAULT_LOOKS[3],
        look[GameAppearance.HANDS] ?? DEFAULT_LOOKS[4],
        look[GameAppearance.LEGS] ?? DEFAULT_LOOKS[5],
        look[GameAppearance.FEET] ?? DEFAULT_LOOKS[6],
      ],
      [
        look[GameAppearance.HAIR_COLOUR] ?? DEFAULT_COLORS[0],
        look[GameAppearance.TORSO_COLOUR] ?? DEFAULT_COLORS[1],
        look[GameAppearance.LEG_COLOUR] ?? DEFAULT_COLORS[2],
        look[GameAppearance.FEET_COLOUR] ?? DEFAULT_COLORS[3],
        look[GameAppearance.SKIN_COLOUR] ?? DEFAULT_COLORS[4],
      ]
    );
  }

  private parseLoginPayload(
    buffer: Buffer,
    origin: "decrypted" | "raw" = "decrypted"
  ):
    | {
        securityId: number;
        seed0: number;
        seed1: number;
        seed2: number;
        seed3: number;
        uid: number;
        usernameRaw: string;
        password: string;
        parsedFrom: "decrypted" | "raw";
      }
    | null {
    // Java layout (LoginDecoder): [sid][long clientSeed][long seedReceived][int uid][username][password]
    const minLen = 1 + 8 + 8 + 4;
    if (buffer.length < minLen) {
      this.log("login_parse_too_short", { origin, length: buffer.length, bufferHex: buffer.toString("hex") });
      return null;
    }
    let offset = 0;
    const securityId = buffer.readUInt8(offset++);

    const clientSeedHigh = buffer.readInt32BE(offset);
    offset += 4;
    const clientSeedLow = buffer.readInt32BE(offset);
    offset += 4;
    const seedReceivedHigh = buffer.readInt32BE(offset);
    offset += 4;
    const seedReceivedLow = buffer.readInt32BE(offset);
    offset += 4;

    const uid = buffer.readInt32BE(offset);
    offset += 4;

    const usernameResult = this.readString(buffer, offset);
    if (!usernameResult) {
      this.log("login_parse_username_missing", { origin, offset, bufferHex: buffer.toString("hex") });
      return null;
    }
    const passwordResult = this.readString(buffer, usernameResult.next);
    if (!passwordResult) {
      this.log("login_parse_password_missing", { origin, next: usernameResult.next });
      return null;
    }

    return {
      securityId,
      seed0: clientSeedHigh,
      seed1: clientSeedLow,
      seed2: seedReceivedHigh,
      seed3: seedReceivedLow,
      uid,
      usernameRaw: usernameResult.value,
      password: passwordResult.value,
      parsedFrom: origin,
    };
  }

  private encodePacket(opcode: number, payload: Buffer, type: PacketType = PacketType.FIXED): Buffer {
    const encOpcode =
      this.encryptor != null ? (opcode + this.encryptor.nextInt()) & 0xff : opcode;

    let header: Buffer;
    switch (type) {
      case PacketType.VARIABLE:
      case PacketType.VARIABLE_BYTE:
        if (payload.length > 0xff) {
          throw new Error(
            `Variable packet payload too large for opcode=${opcode} len=${payload.length}`
          );
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

  private sendPacket(opcode: number, payload: Buffer, type: PacketType = PacketType.FIXED, label?: string) {
    const expectedPacketType = getExpectedOutboundPacketType(opcode);
    const expectedPacketSize = getExpectedOutboundPacketSize(opcode);
    if (
      expectedPacketSize != null &&
      expectedPacketSize >= 0 &&
      payload.length !== expectedPacketSize
    ) {
      this.log("send_packet_drop_bad_length", {
        opcode,
        label: label ?? PACKET_GUIDE[opcode]?.name,
        expectedLength: expectedPacketSize,
        actualLength: payload.length,
      });
      return;
    }
    if (expectedPacketType != null && expectedPacketType !== type) {
      this.log("send_packet_type_corrected", {
        opcode,
        label: label ?? PACKET_GUIDE[opcode]?.name,
        expectedType: expectedPacketType,
        actualType: type,
      });
      type = expectedPacketType;
    }
    const guide = PACKET_GUIDE[opcode];
    this.log("send_packet", {
      opcode,
      label: label ?? guide?.name,
      payloadLength: payload.length,
      payloadHex: payload.toString("hex"),
    });
    this.recordRecentPacket("OUT", opcode, payload.length, label ?? guide?.name, payload);
    PacketLogger.logOutgoing({
      direction: "OUT",
      opcode,
      stage: this.stage,
      label: label ?? guide?.name,
      player: this.player?.username,
      payloadLength: payload.length,
      payloadPreview: payload.subarray(0, Math.min(16, payload.length)).toString("hex"),
    });
    try {
      this.socket.send(this.encodePacket(opcode, payload, type));
    } catch (err) {
      this.log("send_packet_error", {
        opcode,
        label: label ?? guide?.name,
        payloadLength: payload.length,
        type,
        err: (err as Error)?.message ?? String(err),
        stack: (err as Error)?.stack,
      });
      // Avoid crashing the session on malformed payloads; drop the packet.
    }
  }

  private recordRecentPacket(
    direction: "IN" | "OUT",
    opcode: number,
    payloadLength: number,
    label?: string,
    payload?: Buffer,
    previewFromMeta?: string
  ) {
    const timestamp = new Date().toISOString();
    if (direction === "IN" && opcode === 0) {
      this.recentKeepAliveCount++;
      this.recentKeepAliveAt = timestamp;
      return;
    }
    const preview =
      previewFromMeta ??
      (payload && payload.length
        ? payload.subarray(0, Math.min(12, payload.length)).toString("hex")
        : undefined);
    this.recentPacketEvents.push({
      direction,
      opcode,
      payloadLength,
      label,
      preview,
      timestamp,
    });
    if (this.recentPacketEvents.length > 24) {
      this.recentPacketEvents.shift();
    }
  }

  private sendInitialPackets(player: PlayerState) {
    const { location, appearance, username, index } = player;
    // Match Java PacketSender#sendMapRegion semantics:
    // wire values are location.getRegionX()+6 where getRegionX() is (x>>3)-6 => (x>>3).
    const regionX = location.x >> 3;
    const regionY = location.y >> 3;
    const localX = location.x - ((regionX - 6) << 3);
    const localY = location.y - ((regionY - 6) << 3);

    // Map region (73)
    const mapPayload = Buffer.alloc(4);
    mapPayload.writeUInt8(((regionX >> 8) & 0xff) >>> 0, 0);
    mapPayload.writeUInt8((((regionX & 0xff) + 128) & 0xff) >>> 0, 1); // ValueType.A on low byte
    mapPayload.writeUInt8(((regionY >> 8) & 0xff) >>> 0, 2);
    mapPayload.writeUInt8((regionY & 0xff) >>> 0, 3);
    this.sendPacket(73, mapPayload, PacketType.FIXED, "map_region");

    // Force a clean regional sync on login.
    // The web client can otherwise keep stale spawned-object state from a prior
    // session until the next explicit region-change handshake occurs.
    if (this.gamePlayer) {
      this.gamePlayer.getPacketSender().deleteRegionalSpawns();
      ItemOnGroundManager.onRegionChange(this.gamePlayer);
      ObjectManager.onRegionChange(this.gamePlayer);
    }

    const updateBuf = this.buildPlayerUpdate(
      localX,
      localY,
      location.plane,
      username,
      appearance,
      "teleport"
    );
    this.sendPacket(81, updateBuf, PacketType.VARIABLE_SHORT, "player_update");

    // Details (249)
    const details = Buffer.alloc(3);
    details.writeUInt8(((1 + 128) & 0xff) >>> 0, 0);
    details.writeUInt8(((index >> 8) & 0xff) >>> 0, 1);
    details.writeUInt8((index & 0xff) >>> 0, 2);
    this.sendPacket(249, details, PacketType.FIXED, "player_details");

    // Tabs (71)
    const tabs = [
      2423, 3917, 31000, 3213, 1644, 5608, 1151, 37128, 5065, 5715, 2449, 42500,
      147, 32000,
    ];
    tabs.forEach((intf, tab) => {
      if (intf < 0) return;
      const buf = Buffer.alloc(3);
      buf.writeUInt8(((intf >> 8) & 0xff) >>> 0, 0);
      buf.writeUInt8((intf & 0xff) >>> 0, 1);
      buf.writeUInt8((((tab & 0xff) + 128) & 0xff) >>> 0, 2);
      this.sendPacket(71, buf, PacketType.FIXED, `tab_${tab}`);
    });

    // Run status/energy (113/110)
    this.sendPacket(113, Buffer.from([0]), PacketType.FIXED, "run_status");
    this.sendPacket(110, Buffer.from([100]), PacketType.FIXED, "run_energy");

    // Map state (99) unlocked
    this.sendPacket(99, Buffer.from([0]), PacketType.FIXED, "map_state");

    // Clear any lingering interfaces/overlays (219 handles per Java)
    this.sendPacket(219, Buffer.alloc(0), PacketType.FIXED, "interface_removal");

    // Prayer unlock configs (36)
    this.sendConfig(709, 0);
    this.sendConfig(711, 0);
    this.sendConfig(713, 0);
    this.sendConfig(172, 1); // auto-retaliate on

    // Clear interfaces (219) similar to Java's sendInterfaceRemoval on login
    this.sendPacket(219, Buffer.alloc(0), PacketType.FIXED, "interface_removal");

    // Send persisted container contents immediately on login.
    // If we send empty containers here, the client can visually override loaded state
    // and make persistence appear broken until a later refresh packet arrives.
    const inventoryItems = this.gamePlayer?.getInventory?.()?.getItems?.();
    const equipmentItems = this.gamePlayer?.getEquipment?.()?.getItems?.();
    this.sendItemContainer(3214, 28, inventoryItems); // inventory
    this.sendItemContainer(1688, 14, equipmentItems); // equipment

    // Send skill states on login so client stat widgets initialize from server state.
    // Without this, the client can show 0/0 until some later gameplay update mutates a skill.
    const packetSender = this.gamePlayer?.getPacketSender?.();
    const skillManager = this.gamePlayer?.getSkillManager?.();
    if (packetSender && skillManager) {
      for (const skill of Skill.values()) {
        packetSender.sendSkill(skill);
      }
      packetSender.sendTotalExp(skillManager.getTotalExp());
    } else {
      const totalExp = Buffer.alloc(8);
      this.sendPacket(108, totalExp, PacketType.FIXED, "total_exp");
    }

    // Welcome message (253)
    const msg = Buffer.from(`Welcome to RSPS.APP.\n`, "ascii");
    this.sendPacket(253, msg, PacketType.VARIABLE, "welcome_msg");

    // Rights (127)
    this.sendPacket(
      127,
      Buffer.from([
        this.gamePlayer?.getRights()?.getId?.() ?? 0,
        DonatorRights.getId(this.gamePlayer?.getDonatorRights?.()),
      ]),
      PacketType.FIXED,
      "rights"
    );

    // Interaction options (104)
    const writeInteraction = (option: string, slot: number, top: boolean) => {
      const slotC = (-slot) & 0xff; // ValueType.C
      const topA = ((top ? 1 : 0) + 128) & 0xff; // ValueType.A
      return Buffer.from([slotC, topA, ...Buffer.from(option + "\n", "ascii")]);
    };
    const follow = writeInteraction("Follow", 3, false);
    const trade = writeInteraction("Trade With", 4, false);
    this.sendPacket(104, follow, PacketType.VARIABLE, "follow_option");
    this.sendPacket(104, trade, PacketType.VARIABLE, "trade_option");

  }

  private buildPlayerUpdate(
    x: number,
    y: number,
    plane: number,
    username: string,
    appearance: Appearance,
    movement: "teleport" | "none"
  ): Buffer {
    const bits: number[] = [];
    let bitPos = 0;
    const putBits = (numBits: number, value: number) => {
      const masked = value & ((1 << numBits) - 1);
      for (let i = numBits - 1; i >= 0; i--) {
        const bit = (masked >> i) & 1;
        const bytePos = bitPos >> 3;
        if (bits[bytePos] === undefined) bits[bytePos] = 0;
        bits[bytePos] |= bit << (7 - (bitPos & 7));
        bitPos++;
      }
    };

    // Local movement/update indicator
    putBits(1, 1); // update required
    if (movement === "teleport") {
      putBits(2, 3); // teleport
      putBits(2, plane & 0x3);
      putBits(1, 1); // reset queue
      putBits(1, 1); // update block appended
      putBits(7, y & 0x7f);
      putBits(7, x & 0x7f);
    } else {
      putBits(2, 0); // no movement, just an update block
    }

    // No other players
    putBits(8, 0);
    // sentinel
    putBits(11, 2047);

    const pad = (8 - (bitPos & 7)) & 7;
    if (pad > 0) {
      putBits(pad, 0);
    }
    const bitBytes = Math.ceil(bitPos / 8);
    const bitBuf = Buffer.alloc(bitBytes);
    for (let i = 0; i < bitBytes; i++) bitBuf[i] = bits[i] ?? 0;

    const appearanceBlock = this.buildAppearanceBlock(username, appearance);
    const mask = Buffer.from([0x10]); // appearance flag only
    // Java uses ValueType.C for length (negated byte)
    const lenByte = (-appearanceBlock.length) & 0xff;
    const updateBlock = Buffer.concat([mask, Buffer.from([lenByte]), appearanceBlock]);

    return Buffer.concat([bitBuf, updateBlock]);
  }

  private buildAppearanceBlock(username: string, appearance: Appearance): Buffer {
    const bytes: number[] = [];
    const putByte = (v: number) => bytes.push(v & 0xff);
    const putShort = (v: number) => {
      bytes.push((v >> 8) & 0xff, v & 0xff);
    };
    const putLong = (v: bigint) => {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64BE(v);
      bytes.push(...buf);
    };

    const look = {
      head: appearance.looks[0],
      jaw: appearance.looks[1],
      torso: appearance.looks[2],
      arms: appearance.looks[3],
      hands: appearance.looks[4],
      legs: appearance.looks[5],
      feet: appearance.looks[6],
    };

    // Gender and icons
    putByte(appearance.gender); // 0 male, 1 female
    const headIcon = this.gamePlayer?.getAppearance?.()?.getHeadHint?.() ?? -1;
    const skullIcon =
      this.gamePlayer?.isSkulled?.() && this.gamePlayer?.getSkullType?.()
        ? this.gamePlayer.getSkullType().getIconId()
        : -1;
    putByte(headIcon); // prayer/head icon
    putByte(skullIcon); // skull icon
    putByte(0); // hint/arrow

    // Equipment/looks (mirror Java ordering; empty slots use a single 0 byte)
    putByte(0); // head slot empty
    putByte(0); // cape
    putByte(0); // amulet
    putByte(0); // weapon
    putShort(0x100 + look.torso); // body
    putByte(0); // shield
    putShort(0x100 + look.arms); // arms
    putShort(0x100 + look.legs); // legs
    putShort(0x100 + look.head); // head
    putShort(0x100 + look.hands); // hands
    putShort(0x100 + look.feet); // feet
    if (appearance.gender === 0 && look.jaw > 0) {
      putShort(0x100 + look.jaw); // beard
    } else {
      putByte(0);
    }

    // Colors (hair, torso, legs, feet, skin)
    appearance.colors.forEach((c) => putByte(c & 0xff));

    // Animations: mirror PlayerUpdating#updateAppearance defaults.
    const skillAnim = this.gamePlayer?.getSkillAnimation?.() ?? 0;
    if (skillAnim > 0) {
      for (let i = 0; i < 7; i++) {
        putShort(skillAnim);
      }
    } else {
      const weaponDef = this.gamePlayer
        ?.getEquipment?.()
        ?.getItems?.()
        ?.[3]
        ?.getDefinition?.();
      putShort(weaponDef?.getStandAnim?.() ?? 808);
      putShort(0x337); // turn
      putShort(weaponDef?.getWalkAnim?.() ?? 819);
      putShort(0x334); // turn 180
      putShort(0x335); // turn 90 cw
      putShort(0x336); // turn 90 ccw
      putShort(weaponDef?.getRunAnim?.() ?? 824);
    }

    // Name as long
    putLong(Misc.stringToLongBigInt(username));
    // Combat level
    putByte(this.gamePlayer?.getSkillManager?.()?.getCombatLevel?.() ?? 3);
    // Rights (PLAYER_RIGHTS ordinal)
    putByte(this.gamePlayer?.getRights()?.getId?.() ?? 0);
    // Loyalty title (empty string, terminator only)
    putByte(0);

    return Buffer.from(bytes);
  }

  private startKeepAlive() {
    // The client already sends opcode 0 idle packets. Sending server opcode 0 here
    // is non-Java parity and can trigger client-side disconnects.
  }

  private sendConfig(id: number, state: number) {
    const buf = Buffer.alloc(3);
    // ValueType.A on state for exact match? use little-endian short then state byte
    buf.writeUInt16LE(id & 0xffff, 0);
    buf.writeUInt8(state & 0xff, 2);
    this.sendPacket(36, buf, PacketType.FIXED, `config_${id}`);
  }

  private sendItemContainer(interfaceId: number, capacity: number, items?: any[]) {
    const entries: Buffer[] = [];
    for (let i = 0; i < capacity; i++) {
      const item = items?.[i];
      const id = item?.getId?.() ?? -1;
      const amount = item?.getAmount?.() ?? 0;
      if (id > 0 && amount > 0) {
        const entry = Buffer.alloc(6);
        entry.writeInt32BE(amount, 0);
        entry.writeUInt16BE((id + 1) & 0xffff, 4);
        entries.push(entry);
        continue;
      }
      const empty = Buffer.alloc(4);
      empty.writeInt32BE(-1, 0);
      entries.push(empty);
    }
    const header = Buffer.alloc(6);
    header.writeInt32BE(interfaceId, 0);
    header.writeUInt16BE(capacity, 4);
    const payload = Buffer.concat([header, ...entries]);
    this.sendPacket(53, payload, PacketType.VARIABLE_SHORT, `item_container_${interfaceId}`);
  }

  private decryptRsa(payload: Buffer): Buffer | null {
    try {
      const modulus = NetworkConstants.RSA_MODULUS;
      const exponent = NetworkConstants.RSA_EXPONENT;
      const unsignedInt = BigInt("0x" + payload.toString("hex"));
      const base = unsignedInt % modulus;
      const plainInt = LoginSession.modPow(base, exponent, modulus);
      let plainHex = plainInt.toString(16);
      if (plainHex.length % 2 === 1) plainHex = "0" + plainHex;
      if ((parseInt(plainHex.slice(0, 2), 16) & 0x80) !== 0) {
        plainHex = "00" + plainHex;
      }
      return Buffer.from(plainHex, "hex");
    } catch (err) {
      console.error("RSA decrypt failed:", err);
      return null;
    }
  }

  private readString(data: Buffer, start: number): { value: string; next: number } | null {
    const terminatorIndex = data.indexOf(10, start);
    if (terminatorIndex === -1) return null;
    return { value: data.toString("utf8", start, terminatorIndex), next: terminatorIndex + 1 };
  }

  private sendResponse(response: number, closeAfter: boolean, reason?: string) {
    this.log("login_response", { response, reason, stage: this.stage });
    this.socket.send(Buffer.from([response]));
    if (closeAfter) this.socket.close();
  }

  private cleanupDisconnected(source: string) {
    if (this.disconnectedCleanupDone) {
      return;
    }
    this.disconnectedCleanupDone = true;

    const player = this.gamePlayer;
    if (!player) {
      return;
    }

    const addQueue = World.getAddPlayerQueue();
    const addIndex = addQueue.indexOf(player);
    if (addIndex !== -1) {
      addQueue.splice(addIndex, 1);
    }

    const removeQueue = World.getRemovePlayerQueue();
    let queuedForRemoval = false;
    if (!removeQueue.includes(player)) {
      removeQueue.push(player);
      queuedForRemoval = true;
    }

    this.log("disconnect_cleanup", {
      source,
      username: player.getUsername(),
      wasInAddQueue: addIndex !== -1,
      queuedForRemoval,
      registered: player.isRegistered(),
      recentKeepAliveCount: this.recentKeepAliveCount,
      recentKeepAliveAt: this.recentKeepAliveAt,
      recentPackets: this.recentPacketEvents.slice(),
    });
    PluginManager.emitPlayerDisconnect({
      player,
      username: player.getUsername(),
      source,
    });
  }

  private log(event: string, data?: Record<string, unknown>) {
    const meta = data ? JSON.stringify(data) : "";
    console.log(`[login_session] ${event} ${meta}`);
  }

  private static modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = 1n;
    let b = base % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) result = (result * b) % mod;
      e >>= 1n;
      b = (b * b) % mod;
    }
    return result;
  }

  private defaultAppearance(): Appearance {
    return {
      gender: 0,
      looks: [...DEFAULT_LOOKS],
      colors: [...DEFAULT_COLORS],
    };
  }

  private normalizeAppearance(
    gender: number,
    looks: number[],
    colors: number[]
  ): Appearance {
    const lookRanges = gender === 0 ? MALE_LOOK_RANGES : FEMALE_LOOK_RANGES;
    const normalizedLooks = lookRanges.map(([min, max], idx) => {
      const value = looks[idx] ?? DEFAULT_LOOKS[idx];
      const clamped = Math.min(max, Math.max(min, value));
      return clamped < 0 ? 0 : clamped;
    });
    const normalizedColors = ALLOWED_COLORS.map(([min, max], idx) => {
      const value = colors[idx] ?? DEFAULT_COLORS[idx];
      return Math.min(max, Math.max(min, value));
    });
    return {
      gender: gender === 1 ? 1 : 0,
      looks: normalizedLooks,
      colors: normalizedColors,
    };
  }

  private handleGamePacket(buffer: Buffer) {
    if (!this.decryptor) {
      this.log("game_packet_without_decryptor", { length: buffer.length });
      return;
    }
    if (buffer.length === 0) {
      return;
    }
    // Accumulate and decode multiple packets from this frame using the Java PACKET_SIZES table.
    let data = Buffer.concat([this.recvBuffer, buffer]);
    let offset = 0;
    while (true) {
      let opcode: number;
      let encOpcode: number;
      let rand: number;
      let size: number | null;
      let lengthBytes: 0 | 1 | 2;
      let headerSize: number;

      if (this.pendingInboundPacket) {
        ({ opcode, encOpcode, rand, size, lengthBytes, headerSize } = this.pendingInboundPacket);
        this.pendingInboundPacket = null;
      } else {
        if (data.length - offset < 1) {
          break;
        }
        encOpcode = data.readUInt8(offset++);
        rand = this.decryptor.nextInt() & 0xff;
        opcode = (encOpcode - rand) & 0xff;
        headerSize = 1;
        const mappedSize = getInboundPacketSizeOrUndefined(opcode);
        if (mappedSize === undefined) {
          this.log("packet_unknown_size", { opcode, encOpcode, rand });
          continue;
        }
        if (mappedSize === -1) {
          size = null;
          lengthBytes = 1;
        } else if (mappedSize === -2) {
          size = null;
          lengthBytes = 2;
        } else {
          size = mappedSize;
          lengthBytes = 0;
        }
      }

      if (lengthBytes === 1) {
        if (data.length - offset < 1) {
          this.pendingInboundPacket = { opcode, encOpcode, rand, size: null, lengthBytes, headerSize };
          break;
        }
        size = data.readUInt8(offset++);
        headerSize += 1;
        lengthBytes = 0;
      } else if (lengthBytes === 2) {
        if (data.length - offset < 2) {
          this.pendingInboundPacket = { opcode, encOpcode, rand, size: null, lengthBytes, headerSize };
          break;
        }
        size = data.readUInt16BE(offset);
        offset += 2;
        headerSize += 2;
        lengthBytes = 0;
      }

      if (size == null) {
        this.pendingInboundPacket = { opcode, encOpcode, rand, size, lengthBytes, headerSize };
        break;
      }
      if (data.length - offset < size) {
        this.pendingInboundPacket = { opcode, encOpcode, rand, size, lengthBytes, headerSize };
        break;
      }

      const payload = data.subarray(offset, offset + size);
      offset += size;

      const isIdleKeepAlive = opcode === 0 && size === 0;
      if (!isIdleKeepAlive) {
        this.log("packet_received", {
          opcode,
          encOpcode,
          rand,
          sizeUsed: size,
          payloadLength: payload.length,
          payloadPreview: payload.subarray(0, Math.min(16, payload.length)).toString("hex"),
        });
      }
      this.recordRecentPacket(
        "IN",
        opcode,
        payload.length,
        PACKET_GUIDE[opcode]?.name,
        payload
      );
      if (!isIdleKeepAlive) {
        PacketLogger.logIncoming({
          direction: "IN",
          opcode,
          stage: this.stage,
          label: PACKET_GUIDE[opcode]?.name,
          player: this.player?.username,
          encOpcode,
          rand,
          payloadLength: payload.length,
          payloadPreview: payload.subarray(0, Math.min(16, payload.length)).toString("hex"),
        });
      }
      if (payload.length === 0 && !isIdleKeepAlive) {
        this.log("packet_empty_payload", {
          opcode,
          expectedSize: size,
          stage: this.stage,
        });
      }

      const hookPacket = new Packet(opcode, payload);
      PluginManager.emitPacketReceived({
        opcode,
        packet: hookPacket,
        player: this.gamePlayer,
        stage: this.stage,
      });

      const exec =
        PluginManager.getPacketListener(opcode) ??
        PacketConstants.PACKETS.get(opcode) ??
        new NOPPacketListener();
      if (exec && this.gamePlayer) {
        if (typeof (exec as any).execute !== "function") {
          this.log("packet_listener_missing_execute", { opcode, listener: exec.constructor?.name });
          continue;
        }
        try {
          const packet = new Packet(opcode, payload);
          exec.execute(this.gamePlayer, packet);
          continue;
        } catch (err) {
          this.log("packet_listener_error", { opcode, err: (err as Error)?.message ?? String(err) });
          continue;
        }
      }

      switch (opcode) {
        case PacketConstants.PLAYER_INACTIVE_OPCODE:
          // Client idle keepalive; consume without echo for Java parity.
          continue;
        case 11:
          this.handleAppearanceChange(payload);
          continue;
        case PacketConstants.FINALIZED_MAP_REGION_OPCODE:
          // Let the server know the client finished loading; no-op for now.
          continue;
        case PacketConstants.CHANGE_MAP_REGION_OPCODE:
          // Client is requesting a region change; acknowledge by resetting placement so next update teleports.
          if (this.gamePlayer) {
            this.gamePlayer.setNeedsPlacement(true);
          }
          continue;
        default:
          this.log("unhandled_packet", { opcode, payloadLength: payload.length });
      }
    }
    this.recvBuffer = data.subarray(offset);
  }

  private handleAppearanceChange(payload: Buffer) {
    if (!this.player) {
      this.log("appearance_change_no_player");
      return;
    }
    if (payload.length < 13) {
      this.log("appearance_change_too_short", { length: payload.length });
      return;
    }
    let offset = 0;
    const gender = payload.readUInt8(offset++);
    const looks: number[] = [];
    for (let i = 0; i < 7; i++) {
      looks.push(payload.readUInt8(offset++));
    }
    const colors: number[] = [];
    for (let i = 0; i < 5; i++) {
      colors.push(payload.readUInt8(offset++));
    }

    this.player.appearance = this.normalizeAppearance(gender, looks, colors);
    if (this.gamePlayer) {
      const app = this.gamePlayer.getAppearance();
      app.setLook(GameAppearance.GENDER, this.player.appearance.gender);
      app.setLook(GameAppearance.HEAD, this.player.appearance.looks[0]);
      app.setLook(GameAppearance.BEARD, this.player.appearance.looks[1]);
      app.setLook(GameAppearance.CHEST, this.player.appearance.looks[2]);
      app.setLook(GameAppearance.ARMS, this.player.appearance.looks[3]);
      app.setLook(GameAppearance.HANDS, this.player.appearance.looks[4]);
      app.setLook(GameAppearance.LEGS, this.player.appearance.looks[5]);
      app.setLook(GameAppearance.FEET, this.player.appearance.looks[6]);
      app.setLook(GameAppearance.HAIR_COLOUR, this.player.appearance.colors[0]);
      app.setLook(GameAppearance.TORSO_COLOUR, this.player.appearance.colors[1]);
      app.setLook(GameAppearance.LEG_COLOUR, this.player.appearance.colors[2]);
      app.setLook(GameAppearance.FEET_COLOUR, this.player.appearance.colors[3]);
      app.setLook(GameAppearance.SKIN_COLOUR, this.player.appearance.colors[4]);
    }
    this.log("appearance_change_applied", {
      gender: this.player.appearance.gender,
      looks: this.player.appearance.looks,
      colors: this.player.appearance.colors,
    });

    const updateBuf = this.buildPlayerUpdate(
      0,
      0,
      this.player.location.plane,
      this.player.username,
      this.player.appearance,
      "none"
    );
    this.sendPacket(81, updateBuf, PacketType.VARIABLE_SHORT, "player_update_appearance");
  }

  private sendInitialNpcs(player: PlayerState) {
    // TODO: Send real NPC additions once bit-packing matches the Java server/client expectations.
    const payload = this.buildNpcUpdate(player, []);
    this.sendPacket(65, payload, PacketType.VARIABLE_SHORT, "npc_update");
  }

  private buildNpcUpdate(player: PlayerState, npcs: NpcState[]): Buffer {
    if (npcs.length === 0) {
      // Only the 8-bit local npc count (0), no sentinel when there are no updates.
      return Buffer.from([0]);
    }
    const bits: number[] = [];
    let bitPos = 0;
    const putBits = (numBits: number, value: number) => {
      const masked = value & ((1 << numBits) - 1);
      for (let i = numBits - 1; i >= 0; i--) {
        const bit = (masked >> i) & 1;
        const bytePos = bitPos >> 3;
        if (bits[bytePos] === undefined) bits[bytePos] = 0;
        bits[bytePos] |= bit << (7 - (bitPos & 7));
        bitPos++;
      }
    };

    // No existing local NPCs yet
    putBits(8, 0);

    for (const npc of npcs) {
      const dx = npc.location.x - player.location.x;
      const dy = npc.location.y - player.location.y;
      putBits(14, npc.index & 0x3fff);
      putBits(5, dy & 0x1f);
      putBits(5, dx & 0x1f);
      putBits(1, 0); // discard walking queue
      putBits(3, 0); // facing direction index
      putBits(NPC_BITS, npc.id & ((1 << NPC_BITS) - 1));
      putBits(1, 0); // no update mask
    }

    // Align to next byte
    const pad = (8 - (bitPos & 7)) & 7;
    if (pad > 0) {
      putBits(pad, 0);
    }

    const byteLen = Math.ceil(bitPos / 8);
    const buf = Buffer.alloc(byteLen);
    for (let i = 0; i < byteLen; i++) buf[i] = bits[i] ?? 0;
    return buf;
  }
}

export class NetworkBuilder {
  public initialize(port: number): void {
    const wss = new WebSocketServer({ port, host: "127.0.0.1" });
    wss.on("connection", (socket) => new LoginSession(socket));
    console.log(`WebSocket login server started on port ${port}`);
  }
}
