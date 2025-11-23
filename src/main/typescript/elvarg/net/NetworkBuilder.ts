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
const NPC_BITS = 14;

class LoginSession {
  private stage: LoginStage = "HANDSHAKE";
  private serverSeeds: [number, number] | null = null;
  private encryptor: IsaacRandom | null = null;
  private decryptor: IsaacRandom | null = null;
  private player: PlayerState | null = null;
  private gamePlayer: Player | null = null;

  constructor(private socket: WebSocket) {
    this.log("connection_open", {
      remote: (this.socket as any)?._socket?.remoteAddress ?? "unknown",
    });
    socket.on("message", (data) => this.onMessage(data));
    socket.on("error", (err) => {
      this.log("socket_error", { err: err?.message ?? err });
      this.socket.close();
    });
    socket.on("close", () => {
      this.log("connection_closed");
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

    const { securityId, clientSeed, seedReceived, serverSeed1, serverSeed2, usernameRaw, password } =
      parsed;

    this.log("rsa_decrypted", {
      decryptedHex: decrypted.toString("hex"),
      securityId,
      decryptedLength: decrypted.length,
      parsedWith: parsed.parsedFrom,
    });

    if (securityId !== 10 && securityId !== 11) {
      this.sendResponse(LoginResponses.LOGIN_REJECT_SESSION, true, "bad_security_id");
      return;
    }
    if (
      serverSeed1 !== this.serverSeeds[0] ||
      serverSeed2 !== this.serverSeeds[1]
    ) {
      this.sendResponse(LoginResponses.LOGIN_BAD_SESSION_ID, true, "server_seed_mismatch");
      return;
    }

    const seed = [clientSeed, seedReceived, serverSeed1, serverSeed2];
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
      clientSeed,
      seedReceived,
      serverSeed1,
      serverSeed2,
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
    const session = new PlayerSession(this.socket as any);
    if (this.encryptor) {
      session.setEncryptor(this.encryptor);
    }
    const gamePlayer = new Player(session, new Location(player.location.x, player.location.y, player.location.plane));
    gamePlayer.setUsername(username);
    gamePlayer.setLongUsername(Misc.stringToLong(username));
    gamePlayer.setHostAddress((this.socket as any)?._socket?.remoteAddress ?? "");
    this.gamePlayer = gamePlayer;

    // Plain login response
    this.socket.send(Buffer.from([LoginResponses.LOGIN_SUCCESSFUL, 0]));
    // Encrypted initial packets
    this.sendInitialPackets(player);
    this.sendInitialNpcs(player);
    this.stage = "ESTABLISHED";
  }

  private parseLoginPayload(buffer: Buffer, origin: "decrypted" | "raw" = "decrypted"):
    | {
        securityId: number;
        clientSeed: number;
        seedReceived: number;
        serverSeed1: number;
        serverSeed2: number;
        uid: number;
        usernameRaw: string;
        password: string;
        parsedFrom: "decrypted" | "raw";
      }
    | null {
    const minLen = 1 + 4 * 5;
    let startCandidate = -1;
    const searchLimit = Math.max(0, buffer.length - minLen);
    for (let i = 0; i <= searchLimit; i++) {
      const sid = buffer.readUInt8(i);
      if (sid === 10 || sid === 11) {
        startCandidate = i;
        break;
      }
    }
    if (startCandidate === -1) {
      this.log("login_parse_no_sid", { origin, bufferHex: buffer.toString("hex") });
      return null;
    }

    let offset = startCandidate + 1;
    const clientSeed = buffer.readInt32BE(offset);
    offset += 4;
    const seedReceived = buffer.readInt32BE(offset);
    offset += 4;
    const serverSeed1 = buffer.readInt32BE(offset);
    offset += 4;
    const serverSeed2 = buffer.readInt32BE(offset);
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
      securityId: buffer.readUInt8(startCandidate),
      clientSeed,
      seedReceived,
      serverSeed1,
      serverSeed2,
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
    this.log("send_packet", {
      opcode,
      label,
      payloadLength: payload.length,
      payloadHex: payload.toString("hex"),
    });
    this.socket.send(this.encodePacket(opcode, payload, type));
  }

  private sendInitialPackets(player: PlayerState) {
    const { location, appearance, username, index } = player;
    const regionX = location.x >> 3;
    const regionY = location.y >> 3;
    const localX = location.x - ((regionX - 6) << 3);
    const localY = location.y - ((regionY - 6) << 3);

    // Map region (73)
    const mapPayload = Buffer.alloc(4);
    mapPayload.writeUInt8((regionX >> 8) & 0xff, 0);
    mapPayload.writeUInt8(((regionX & 0xff) + 128) & 0xff, 1); // ValueType.A on low byte
    mapPayload.writeUInt8((regionY >> 8) & 0xff, 2);
    mapPayload.writeUInt8(regionY & 0xff, 3);
    this.sendPacket(73, mapPayload, PacketType.FIXED, "map_region");

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
    details.writeUInt8((1 + 128) & 0xff, 0);
    details.writeUInt8((index >> 8) & 0xff, 1);
    details.writeUInt8(index & 0xff, 2);
    this.sendPacket(249, details, PacketType.FIXED, "player_details");

    // Tabs (71)
    const tabs = [
      2423, 3917, 31000, 3213, 1644, 5608, -1, 37128, 5065, 5715, 2449, 42500,
      147, 32000,
    ];
    tabs.forEach((intf, tab) => {
      if (intf < 0) return;
      const buf = Buffer.alloc(3);
      buf.writeUInt8((intf >> 8) & 0xff, 0);
      buf.writeUInt8(intf & 0xff, 1);
      buf.writeUInt8(((tab & 0xff) + 128) & 0xff, 2);
      this.sendPacket(71, buf, PacketType.FIXED, `tab_${tab}`);
    });

    // Run status/energy (113/110)
    this.sendPacket(113, Buffer.from([0]), PacketType.FIXED, "run_status");
    this.sendPacket(110, Buffer.from([100]), PacketType.FIXED, "run_energy");

    // Welcome message (253)
    const msg = Buffer.from(`Welcome to RSPS.APP.\n`, "ascii");
    this.sendPacket(253, msg, PacketType.VARIABLE, "welcome_msg");

    // Rights (127)
    this.sendPacket(127, Buffer.from([0, 0]), PacketType.FIXED, "rights");

    // Interaction options (104)
    const follow = Buffer.from([0, ...Buffer.from("Follow\0", "ascii")]);
    const trade = Buffer.from([0, ...Buffer.from("Trade With\0", "ascii")]);
    this.sendPacket(104, follow, PacketType.VARIABLE, "follow_option");
    this.sendPacket(104, trade, PacketType.VARIABLE, "trade_option");

    // Gameframe interface (97)
    const interfaceBuf = Buffer.alloc(2);
    interfaceBuf.writeUInt16BE(548);
    this.sendPacket(97, interfaceBuf, PacketType.FIXED, "gameframe");
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
    const mask = Buffer.from([0x10, (-appearanceBlock.length) & 0xff]);
    const updateBlock = Buffer.concat([mask, appearanceBlock]);

    return Buffer.concat([bitBuf, updateBlock]);
  }

  private buildAppearanceBlock(username: string, appearance: Appearance): Buffer {
    const bytes: number[] = [];
    const putByte = (v: number) => bytes.push(v & 0xff);
    const putShort = (v: number) => {
      bytes.push((v >> 8) & 0xff, v & 0xff);
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
    putByte(appearance.gender);
    putByte(0xff); // head icon (none)
    putByte(0xff); // skull icon (none)
    putByte(0); // hint icon

    // Equipment / appearance slots (match java server ordering)
    putByte(0); // head slot empty
    putByte(0); // cape
    putByte(0); // amulet
    putByte(0); // weapon
    putShort(0x100 + look.torso); // body
    putByte(0); // shield
    putShort(0x100 + look.arms);
    putShort(0x100 + look.legs);
    putShort(0x100 + look.head);
    putShort(0x100 + look.hands);
    putShort(0x100 + look.feet);
    if (appearance.gender === 0 && look.jaw > 0) {
      putShort(0x100 + look.jaw);
    } else {
      putByte(0);
    }

    // Colors
    appearance.colors.forEach((c) => putByte(c & 0xff));

    // Default animations (unarmed)
    putShort(808);
    putShort(823);
    putShort(819);
    putShort(820);
    putShort(821);
    putShort(822);
    putShort(824);

    const nameLong = Misc.stringToLong(username);
    const nameBuf = Buffer.alloc(8);
    nameBuf.writeBigUInt64BE(BigInt(nameLong));
    bytes.push(...nameBuf);

    putByte(3); // combat level
    putByte(0); // rights

    return Buffer.from(bytes);
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
    if (buffer.length < 1) {
      this.log("game_packet_empty");
      return;
    }
    const opcode = (buffer.readUInt8(0) - (this.decryptor.nextInt() & 0xff)) & 0xff;
    const payload = buffer.subarray(1);
    // Try packet listener map first.
    const exec = PacketConstants.PACKETS.get(opcode);
    if (exec && this.gamePlayer) {
      try {
        const packet = new Packet(opcode, payload);
        exec.execute(this.gamePlayer, packet);
        return;
      } catch (err) {
        this.log("packet_listener_error", { opcode, err: (err as Error)?.message ?? String(err) });
      }
    }

    switch (opcode) {
      case 11:
        this.handleAppearanceChange(payload);
        break;
      default:
        this.log("unhandled_packet", { opcode, payloadLength: payload.length });
    }
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
    // Minimal demo NPCs around the player so the client can render something
    const base = player.location;
    const npcs: NpcState[] = [
      { index: 1, id: 1, location: { x: base.x + 3, y: base.y + 1, plane: base.plane } }, // Man
      { index: 2, id: 2, location: { x: base.x - 2, y: base.y + 2, plane: base.plane } }, // Woman
    ];
    const payload = this.buildNpcUpdate(player, npcs);
    this.sendPacket(65, payload, PacketType.VARIABLE_SHORT, "npc_update");
  }

  private buildNpcUpdate(player: PlayerState, npcs: NpcState[]): Buffer {
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
      putBits(NPC_BITS, npc.id & 0x3fff);
      putBits(1, 0); // no update mask
    }

    // sentinel
    putBits(14, 16383);

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
