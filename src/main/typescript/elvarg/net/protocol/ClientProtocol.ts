import { BitWriter } from "./BitWriter";
import { CLIENT_PACKET_LENGTHS as CLIENT_PACKET_LENGTHS } from "./ClientPackets";
import { CLIENT_PACKET_LENGTHS as NATIVE_CLIENT_PACKET_LENGTHS } from "./NativeClientPackets";
import { SERVER_PACKET_LENGTHS, ServerPacketId } from "./ServerPackets";

export const enum ClientPacket {
  NPC_OPTION_2 = 12,
  MOVE_GAMECLICK = 16,
  OBJECT_OPTION_2 = 28,
  NPC_OPTION_3 = 34,
  OBJECT_OPTION_4 = 38,
  OBJECT_OPTION_3 = 42,
  OBJECT_OPTION_5 = 51,
  NPC_OPTION_5 = 57,
  NPC_OPTION_4 = 70,
  NPC_OPTION_1 = 76,
  OBJECT_OPTION_1 = 96,
  CHAT = 190,
  HELLO = 200,
  PING = 201,
  HANDSHAKE = 202,
  LOGOUT = 203,
  LOGIN = 204,
  FACE = 211,
  LOC_INTERACT = 231,
}

export const enum ServerPacket {
  WELCOME = 0,
  TICK = 1,
  HANDSHAKE = 2,
  LOGIN_RESPONSE = 3,
  LOGOUT_RESPONSE = 4,
  PLAYER_SYNC = 20,
  NPC_INFO = 21,
  ANIM = 22,
  WIDGET_SET_ROOT = 102,
  WIDGET_OPEN_SUB = 103,
  WIDGET_RUN_SCRIPT = 110,
  SOUND = 131,
  PLAY_JINGLE = 132,
  PLAY_SONG = 133,
  RUN_CLIENT_SCRIPT = 170,
}

export type PlayerAppearance = {
  gender: number;
  colors: number[];
  kits: number[];
  equip: number[];
};

export type Tile = { x: number; y: number; level: number };

export type HitsplatView = { type: number; damage: number; delay?: number };
export type HealthView = { current: number; max: number };
export type AnimationView = { id: number; delay: number };
export type GraphicView = { id: number; height: number; delay: number };
export type ForcedMovementView = {
  startDeltaX: number;
  startDeltaY: number;
  endDeltaX: number;
  endDeltaY: number;
  startCycleOffset: number;
  endCycleOffset: number;
  direction: number;
};

export type ActorUpdateView = {
  forcedChat?: string;
  interactionIndex?: number;
  animation?: AnimationView;
  graphic?: GraphicView;
  hits?: HitsplatView[];
  health?: HealthView;
};

export type PlayerView = Tile & ActorUpdateView & {
  index: number;
  appearance: Buffer;
  appearanceDirty?: boolean;
  faceDirection?: number;
  forcedMovement?: ForcedMovementView;
  forcedMovementEnd?: Tile;
};

export type PlayerSyncState = {
  flags: Uint8Array;
  active: number[];
  empty: number[];
  regions: Int32Array;
  lastTiles: Map<number, Tile>;
  movementTypes: Map<number, 1 | 2>;
};

export type NpcView = Tile & ActorUpdateView & {
  index: number;
  typeId: number;
  rotation: number;
  walkDirection: number;
  runDirection: number;
};

export type NpcSyncState = {
  indices: number[];
  lastTiles: Map<number, Tile>;
  typeIds: Map<number, number>;
  interactionIndices: Map<number, number>;
};

export type ProjectileView = {
  projectileId: number;
  source: Tile;
  target: Tile;
  sourceHeight: number;
  endHeight: number;
  slope: number;
  startPos: number;
  startCycleOffset: number;
  endCycleOffset: number;
  targetActor?: { kind: "player" | "npc"; index: number };
};

export type ClientMessage =
  | { type: "move"; worldX: number; worldY: number; modifierFlags: number }
  | { type: "npc_option"; index: number; clickType: number }
  | { type: "object_option"; id: number; x: number; y: number; clickType?: number; action?: string }
  | { type: "chat"; text: string; messageType: "public" | "game" }
  | { type: "raw"; opcode: number; payload: Buffer }
  | { type: "face" }
  | { type: "hello" }
  | { type: "ping" }
  | { type: "logout" }
  | { type: "login"; username: string; password: string; revision: number }
  | { type: "handshake"; name: string };

class Reader {
  private offset = 0;

  constructor(private readonly data: Buffer) {}

  public byte(): number {
    if (this.offset >= this.data.length) throw new Error("Unexpected end of packet");
    return this.data[this.offset++];
  }

  public short(): number {
    if (this.offset + 2 > this.data.length) throw new Error("Unexpected end of packet");
    const value = this.data.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  public shortAdd(): number {
    const low = (this.byte() - 128) & 0xff;
    return (this.byte() << 8) | low;
  }

  public shortAddLE(): number {
    const high = this.byte();
    return (high << 8) | ((this.byte() - 128) & 0xff);
  }

  public shortLE(): number {
    const low = this.byte();
    return low | (this.byte() << 8);
  }

  public byteAdd(): number {
    return (this.byte() - 128) & 0xff;
  }

  public byteSub(): number {
    return (128 - this.byte()) & 0xff;
  }

  public byteNeg(): number {
    return (-this.byte()) & 0xff;
  }

  public int(): number {
    if (this.offset + 4 > this.data.length) throw new Error("Unexpected end of packet");
    const value = this.data.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  public string(): string {
    const end = this.data.indexOf(0, this.offset);
    if (end === -1) throw new Error("Unterminated packet string");
    const value = this.data.toString("latin1", this.offset, end);
    this.offset = end + 1;
    return value;
  }

  public get remaining(): number {
    return this.data.length - this.offset;
  }
}

function clientPacketLength(opcode: number): number | undefined {
  return CLIENT_PACKET_LENGTHS[opcode as keyof typeof CLIENT_PACKET_LENGTHS]
    ?? NATIVE_CLIENT_PACKET_LENGTHS[opcode];
}

export function decodeClientPackets(frame: Buffer): ClientMessage[] {
  const messages: ClientMessage[] = [];
  let offset = 0;
  while (offset < frame.length) {
    const opcode = frame[offset];
    const expected = clientPacketLength(opcode);
    if (expected === undefined) throw new Error(`Unsupported client opcode ${opcode}`);
    const header = expected === -2 ? 3 : expected === -1 ? 2 : 1;
    if (offset + header > frame.length) throw new Error(`Truncated client opcode ${opcode}`);
    const length = expected === -2
      ? frame.readUInt16BE(offset + 1)
      : expected === -1
        ? frame[offset + 1]
        : expected;
    const end = offset + header + length;
    if (end > frame.length) throw new Error(`Truncated client opcode ${opcode}`);
    messages.push(decodeClientPacket(frame.subarray(offset, end)));
    offset = end;
  }
  return messages;
}

export function decodeClientPacket(frame: Buffer): ClientMessage {
  const reader = new Reader(frame);
  const opcode = reader.byte();
  const variable = clientPacketLength(opcode);
  if (variable === undefined) throw new Error(`Unsupported client opcode ${opcode}`);
  const length = variable === -2 ? reader.short() : variable === -1 ? reader.byte() : variable;
  if (reader.remaining !== length) {
    throw new Error(`Invalid client packet length for opcode ${opcode}: expected ${length}, got ${reader.remaining}`);
  }

  switch (opcode) {
    case ClientPacket.NPC_OPTION_1:
      reader.byte();
      return { type: "npc_option", index: reader.shortAddLE(), clickType: 1 };
    case ClientPacket.NPC_OPTION_2: {
      const index = reader.shortAddLE();
      reader.byte();
      return { type: "npc_option", index, clickType: 2 };
    }
    case ClientPacket.NPC_OPTION_3: {
      const index = reader.shortAdd();
      reader.byteNeg();
      return { type: "npc_option", index, clickType: 3 };
    }
    case ClientPacket.NPC_OPTION_4:
      reader.byteNeg();
      return { type: "npc_option", index: reader.shortLE(), clickType: 4 };
    case ClientPacket.NPC_OPTION_5:
      reader.byteAdd();
      return { type: "npc_option", index: reader.shortLE(), clickType: 5 };
    case ClientPacket.OBJECT_OPTION_1: {
      const x = reader.shortAdd();
      const y = reader.shortLE();
      reader.byteNeg();
      return { type: "object_option", id: reader.shortAddLE(), x, y, clickType: 1 };
    }
    case ClientPacket.OBJECT_OPTION_2: {
      const x = reader.shortAddLE();
      const y = reader.shortAddLE();
      reader.byteSub();
      return { type: "object_option", id: reader.short(), x, y, clickType: 2 };
    }
    case ClientPacket.OBJECT_OPTION_3: {
      const y = reader.shortLE();
      const id = reader.shortLE();
      const x = reader.shortAddLE();
      reader.byteSub();
      return { type: "object_option", id, x, y, clickType: 3 };
    }
    case ClientPacket.OBJECT_OPTION_4: {
      const x = reader.shortAdd();
      const id = reader.shortLE();
      const y = reader.shortAdd();
      reader.byteNeg();
      return { type: "object_option", id, x, y, clickType: 4 };
    }
    case ClientPacket.OBJECT_OPTION_5: {
      const x = reader.short();
      reader.byteAdd();
      const y = reader.shortAdd();
      return { type: "object_option", id: reader.shortAdd(), x, y, clickType: 5 };
    }
    case ClientPacket.MOVE_GAMECLICK: {
      const worldY = reader.shortAddLE();
      const modifierFlags = reader.byteNeg();
      const worldX = reader.shortAddLE();
      reader.shortAdd(); // target loc id; zero for walk-here
      return { type: "move", worldX, worldY, modifierFlags };
    }
    case ClientPacket.FACE: {
      if (reader.byte()) reader.short();
      if (reader.byte()) {
        reader.short();
        reader.short();
      }
      return { type: "face" };
    }
    case ClientPacket.LOC_INTERACT: {
      const id = reader.short();
      const x = reader.short();
      const y = reader.short();
      reader.byte();
      const action = reader.string() || undefined;
      const clickType = reader.byte() || undefined;
      return { type: "object_option", id, x, y, clickType, action };
    }
    case ClientPacket.CHAT:
      return {
        type: "chat",
        messageType: reader.byte() === 1 ? "game" : "public",
        text: reader.string(),
      };
    case ClientPacket.HELLO:
      reader.string();
      reader.string();
      return { type: "hello" };
    case ClientPacket.PING:
      reader.int();
      return { type: "ping" };
    case ClientPacket.LOGOUT:
      return { type: "logout" };
    case ClientPacket.LOGIN:
      return {
        type: "login",
        username: reader.string(),
        password: reader.string(),
        revision: reader.int(),
      };
    case ClientPacket.HANDSHAKE: {
      const name = reader.string();
      const hasAppearance = reader.byte() !== 0;
      if (hasAppearance) {
        reader.byte();
        for (let i = reader.byte(); i > 0; i--) reader.byte();
        for (let i = reader.byte(); i > 0; i--) reader.short();
        for (let i = reader.byte(); i > 0; i--) reader.short();
      }
      if (reader.remaining > 0) reader.byte();
      return { type: "handshake", name };
    }
    default:
      return { type: "raw", opcode, payload: frame.subarray(frame.length - length) };
  }
}

export function encodeServerPacket(opcode: ServerPacketId, payload: Buffer): Buffer {
  const expected = SERVER_PACKET_LENGTHS[opcode];
  if (expected === undefined) throw new Error(`Unsupported server opcode ${opcode}`);
  if (expected >= 0) {
    if (payload.length !== expected) {
      throw new Error(`Invalid server packet length for opcode ${opcode}: expected ${expected}, got ${payload.length}`);
    }
    return Buffer.concat([Buffer.from([opcode]), payload]);
  }
  if (expected === -1) {
    if (payload.length > 255) throw new Error(`Server packet ${opcode} exceeds byte length`);
    return Buffer.concat([Buffer.from([opcode, payload.length]), payload]);
  }
  if (payload.length > 65535) throw new Error(`Server packet ${opcode} exceeds short length`);
  return Buffer.concat([Buffer.from([opcode, payload.length >> 8, payload.length & 0xff]), payload]);
}

function packet(opcode: ServerPacket, payload: Buffer, lengthBytes: 0 | 1 | 2 = 1): Buffer {
  if (lengthBytes === 0) return Buffer.concat([Buffer.from([opcode]), payload]);
  if (lengthBytes === 1) {
    if (payload.length > 255) throw new Error(`client packet ${opcode} exceeds byte length`);
    return Buffer.concat([Buffer.from([opcode, payload.length]), payload]);
  }
  if (payload.length > 65535) throw new Error(`client packet ${opcode} exceeds short length`);
  return Buffer.concat([
    Buffer.from([opcode, payload.length >> 8, payload.length & 0xff]),
    payload,
  ]);
}

function string(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, "latin1"), Buffer.from([0])]);
}

export function encodeChatMessage(
  messageType: "game" | "public" | "private_in" | "private_out" | "channel" | "clan" | "trade" | "server",
  text: string,
  from = "",
  prefix = "",
  playerId = -1
): Buffer {
  const type = ["game", "public", "private_in", "private_out", "channel", "clan", "trade", "server"]
    .indexOf(messageType);
  const id = Buffer.alloc(2);
  id.writeUInt16BE(playerId & 0xffff);
  return encodeServerPacket(ServerPacketId.CHAT_MESSAGE, Buffer.concat([
    string(text), Buffer.from([type]), string(from), string(prefix), id,
  ]));
}

function scriptArgs(args: (number | string)[]): Buffer {
  const parts: Buffer[] = [Buffer.from([args.length])];
  for (const arg of args) {
    if (typeof arg === "number") {
      const value = Buffer.alloc(5);
      value[0] = 1;
      value.writeInt32BE(arg | 0, 1);
      parts.push(value);
    } else {
      parts.push(Buffer.from([0]), string(arg));
    }
  }
  return Buffer.concat(parts);
}

function encodeOpenSub(root: number, child: number, group: number, postScript?: number): Buffer {
  const fixed = Buffer.alloc(12);
  fixed.writeInt32BE((root << 16) | child, 0);
  fixed.writeUInt16BE(group, 4);
  fixed[6] = 1;
  if (postScript === undefined) return packet(ServerPacket.WIDGET_OPEN_SUB, fixed, 2);
  fixed[11] = 1;
  const script = Buffer.alloc(5);
  script.writeInt32BE(postScript, 0);
  return packet(ServerPacket.WIDGET_OPEN_SUB, Buffer.concat([fixed, script]), 2);
}

export function encodeGameframeBootstrap(playerName: string): Buffer[] {
  const root = 161;
  const mounts = [
    [96, 162], [9, 163], [22, 160], [7, 122], [6, 651, 5929],
    [76, 593], [77, 320], [78, 629], [79, 149], [80, 387], [81, 541],
    [82, 218], [83, 7], [84, 109], [85, 429], [86, 182], [87, 116],
    [88, 216], [89, 239],
  ];
  const cameraScript = Buffer.concat([Buffer.alloc(2), scriptArgs([])]);
  cameraScript.writeUInt16BE(626, 0);
  const rootPayload = Buffer.alloc(2);
  rootPayload.writeUInt16BE(root);
  const loginScript = Buffer.concat([Buffer.alloc(4), scriptArgs([0, 0, playerName, playerName]), Buffer.alloc(4)]);
  loginScript.writeInt32BE(876, 0);
  return [
    packet(ServerPacket.RUN_CLIENT_SCRIPT, cameraScript, 2),
    packet(ServerPacket.WIDGET_SET_ROOT, rootPayload, 0),
    ...mounts.map(([child, group, postScript]) => encodeOpenSub(root, child, group, postScript)),
    packet(ServerPacket.WIDGET_RUN_SCRIPT, loginScript, 2),
  ];
}

export function encodeWelcome(tickMs: number, serverTime: number): Buffer {
  const payload = Buffer.alloc(8);
  payload.writeInt32BE(tickMs | 0, 0);
  payload.writeInt32BE(serverTime | 0, 4);
  return packet(ServerPacket.WELCOME, payload, 0);
}

export function encodeTick(tick: number, serverTime: number): Buffer {
  const payload = Buffer.alloc(8);
  payload.writeInt32BE(tick | 0, 0);
  payload.writeInt32BE(serverTime | 0, 4);
  return packet(ServerPacket.TICK, payload, 0);
}

export function encodeSound(
  soundId: number,
  options: {
    x?: number;
    y?: number;
    level?: number;
    loops?: number;
    delay?: number;
    radius?: number;
    attenuation?: number;
  } = {}
): Buffer {
  const positioned = options.x !== undefined;
  const payload = Buffer.alloc(positioned ? 13 : 7);
  let offset = 0;
  payload.writeUInt16BE(soundId & 0xffff, offset);
  offset += 2;
  payload[offset++] = positioned ? 1 : 0;
  if (positioned) {
    payload.writeUInt16BE(options.x! & 0xffff, offset);
    payload.writeUInt16BE((options.y ?? 0) & 0xffff, offset + 2);
    payload[offset + 4] = (options.level ?? 0) & 0xff;
    offset += 5;
  }
  payload[offset++] = Math.max(1, options.loops ?? 1) & 0xff;
  payload.writeUInt16BE(Math.max(0, options.delay ?? 0) & 0xffff, offset);
  offset += 2;
  payload[offset++] = Math.max(0, Math.min(31, options.radius ?? 0));
  payload[offset] = Math.max(0, Math.min(31, options.attenuation ?? 0));
  return packet(ServerPacket.SOUND, payload);
}

export function encodePlayJingle(jingleId: number, delay = 0): Buffer {
  const payload = Buffer.alloc(5);
  const value = Math.max(0, Math.min(0xffffff, delay));
  payload.writeUInt16BE(jingleId & 0xffff, 0);
  payload[2] = value >> 16;
  payload[3] = value;
  payload[4] = value >> 8;
  return packet(ServerPacket.PLAY_JINGLE, payload, 0);
}

export function encodePlaySong(trackId: number): Buffer {
  const payload = Buffer.alloc(10);
  payload.writeUInt16BE(trackId & 0xffff, 0);
  payload.writeUInt16BE(100, 4);
  payload.writeUInt16BE(100, 6);
  return packet(ServerPacket.PLAY_SONG, payload, 0);
}

export function encodeLoginResponse(
  success: boolean,
  errorCode = -1,
  error = "",
  displayName = ""
): Buffer {
  const fixed = Buffer.alloc(5);
  fixed[0] = success ? 1 : 0;
  fixed.writeInt32BE(errorCode, 1);
  return packet(
    ServerPacket.LOGIN_RESPONSE,
    Buffer.concat([fixed, string(error), string(displayName)])
  );
}

export function encodeHandshake(
  id: number,
  name: string,
  isAdmin: boolean,
  appearance?: PlayerAppearance
): Buffer {
  const idBuffer = Buffer.alloc(4);
  idBuffer.writeInt32BE(id, 0);
  const appearanceParts: Buffer[] = [Buffer.from([appearance ? 1 : 0])];
  if (appearance) {
    appearanceParts.push(Buffer.from([appearance.gender & 0xff]));
    for (const values of [appearance.colors, appearance.kits, appearance.equip]) {
      appearanceParts.push(Buffer.from([values.length & 0xff]));
      if (values === appearance.colors) {
        appearanceParts.push(Buffer.from(values.map((value) => value & 0xff)));
      } else {
        const shorts = Buffer.alloc(values.length * 2);
        values.forEach((value, index) => shorts.writeUInt16BE(value & 0xffff, index * 2));
        appearanceParts.push(shorts);
      }
    }
  }
  return packet(
    ServerPacket.HANDSHAKE,
    Buffer.concat([
      idBuffer,
      string(name),
      ...appearanceParts,
      Buffer.from([0]),
      string(""),
      Buffer.from([isAdmin ? 1 : 0]),
    ])
  );
}

export function encodeInitialPlayerSync(
  localIndex: number,
  tileX: number,
  tileY: number,
  level: number,
  loopCycle: number
): Buffer {
  const writer = new BitWriter();
  writer.writeBits(1, 1); // local player has movement
  writer.writeBits(1, 0); // no update block; appearance arrived in handshake
  writer.writeBits(2, 3); // teleport
  writer.writeBits(1, 1); // absolute displacement from initial 0,0
  writer.writeBits(
    30,
    (((level & 3) << 28) | ((tileX & 0x3fff) << 14) | (tileY & 0x3fff)) >>> 0
  );
  writer.alignToByte();
  // Passes two and three contain no matching indices. Pass four skips every
  // empty player slot after the first one.
  writer.alignToByte();
  writer.alignToByte();
  writer.writeBits(1, 0);
  writer.writeBits(2, 3);
  writer.writeBits(11, 2045);
  const sync = writer.toBuffer();

  const baseX = Math.max(0, (tileX - 48) & ~7);
  const baseY = Math.max(0, (tileY - 48) & ~7);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(baseX, 0);
  header.writeUInt16BE(baseY, 2);
  header.writeUInt16BE(localIndex, 4);
  header.writeInt32BE(loopCycle | 0, 6);
  header.writeUInt16BE(sync.length, 10);
  return packet(ServerPacket.PLAYER_SYNC, Buffer.concat([header, sync]), 2);
}

const RUN_DIRECTIONS = [
  "-2,-2", "-1,-2", "0,-2", "1,-2", "2,-2", "-2,-1", "2,-1", "-2,0",
  "2,0", "-2,1", "2,1", "-2,2", "-1,2", "0,2", "1,2", "2,2",
];

export function createPlayerSyncState(
  localIndex: number,
  tile: Tile
): PlayerSyncState {
  const flags = new Uint8Array(2048);
  const empty: number[] = [];
  for (let index = 1; index < 2048; index++) {
    if (index === localIndex) continue;
    flags[index] = 1; // mirrors the empty-slot skip in the initial sync packet
    empty.push(index);
  }
  return {
    flags,
    active: [localIndex],
    empty,
    regions: new Int32Array(2048),
    lastTiles: new Map([[localIndex, { ...tile }]]),
    movementTypes: new Map([[localIndex, 1]]),
  };
}

export function createNpcSyncState(): NpcSyncState {
  return { indices: [], lastTiles: new Map(), typeIds: new Map(), interactionIndices: new Map() };
}

export function encodePlayerAppearance(
  appearance: PlayerAppearance,
  name: string,
  combatLevel: number,
  skillLevel: number,
  animations: number[]
): Buffer {
  const bytes: number[] = [];
  const byte = (value: number) => bytes.push(value & 0xff);
  const short = (value: number) => {
    bytes.push((value >>> 8) & 0xff, value & 0xff);
  };
  const int = (value: number) => {
    bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  };
  const text = (value: string) => {
    bytes.push(...Buffer.from(value, "latin1"), 0);
  };
  const itemSlots: Record<number, number> = {
    0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 7, 9: 9, 10: 10,
  };
  const kitSlots: Record<number, number> = {
    4: 2, 6: 3, 7: 5, 8: 0, 9: 4, 10: 6, 11: 1,
  };
  const equipmentSlot = (wireSlot: number): number => {
    const itemSlot = itemSlots[wireSlot];
    const itemId = itemSlot === undefined ? -1 : appearance.equip[itemSlot] ?? -1;
    if (itemId >= 0) return itemId + 512;
    const kitSlot = kitSlots[wireSlot];
    const kitId = kitSlot === undefined ? -1 : appearance.kits[kitSlot] ?? -1;
    return kitId >= 0 ? kitId + 256 : 0;
  };

  byte(appearance.gender);
  byte(-1); // skull
  byte(-1); // prayer icon
  for (let copy = 0; copy < 2; copy++) {
    for (let slot = 0; slot < 12; slot++) {
      const value = equipmentSlot(slot);
      if (value === 0) byte(0);
      else short(value);
    }
  }
  for (let index = 0; index < 5; index++) byte(appearance.colors[index] ?? 0);
  for (let index = 0; index < 7; index++) short(animations[index] ?? 0xffff);
  text(name);
  byte(combatLevel);
  short(skillLevel);
  byte(0); // visible
  short(0); // no colour/texture overrides
  text("");
  text("");
  text("");
  byte(0);
  int(0); // ammo quantity; inventory sync will own this later
  int(appearance.equip[13] ?? -1);
  return Buffer.from(bytes);
}

function writeSkipCount(writer: BitWriter, count: number): void {
  if (count === 0) writer.writeBits(2, 0);
  else if (count < 32) {
    writer.writeBits(2, 1);
    writer.writeBits(5, count);
  } else if (count < 256) {
    writer.writeBits(2, 2);
    writer.writeBits(8, count);
  } else {
    writer.writeBits(2, 3);
    writer.writeBits(11, count);
  }
}

const PLAYER_MASK = {
  FORCED_CHAT: 0x01,
  FACE_DIR: 0x02,
  APPEARANCE: 0x04,
  ANIMATION: 0x08,
  HIT: 0x20,
  FACE_ENTITY: 0x40,
  FORCE_MOVEMENT: 0x400,
  MOVEMENT_TYPE: 0x1000,
  SPOT_ANIM: 0x10000,
} as const;

const NPC_MASK = {
  FACE_ENTITY: 0x08,
  ANIMATION: 0x10,
  HIT: 0x20,
  FORCED_CHAT: 0x40,
  SPOT_ANIM: 0x20000,
} as const;

function writeMask(bytes: number[], rawMask: number): void {
  const third = (rawMask & 0xffff0000) !== 0;
  const second = third || (rawMask & 0xff00) !== 0;
  const mask = third ? rawMask | 0x4000 : rawMask;
  bytes.push((mask & 0xff) | (second ? 0x80 : 0));
  if (second) bytes.push((mask >>> 8) & 0xff);
  if (third) bytes.push((mask >>> 16) & 0xff);
}

function byteA(bytes: number[], value: number): void {
  bytes.push((value + 128) & 0xff);
}

function byteC(bytes: number[], value: number): void {
  bytes.push((-value) & 0xff);
}

function byteS(bytes: number[], value: number): void {
  bytes.push((128 - value) & 0xff);
}

function shortBE(bytes: number[], value: number): void {
  bytes.push((value >>> 8) & 0xff, value & 0xff);
}

function shortLE(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function shortBEA(bytes: number[], value: number): void {
  bytes.push((value >>> 8) & 0xff, (value + 128) & 0xff);
}

function shortLEA(bytes: number[], value: number): void {
  bytes.push((value + 128) & 0xff, (value >>> 8) & 0xff);
}

function intME(bytes: number[], value: number): void {
  bytes.push((value >>> 8) & 0xff, value & 0xff, (value >>> 24) & 0xff, (value >>> 16) & 0xff);
}

function smart(bytes: number[], value: number): void {
  const safe = Math.max(0, Math.min(32767, value | 0));
  if (safe < 128) bytes.push(safe);
  else shortBE(bytes, safe + 32768);
}

function writeText(bytes: number[], value: string): void {
  bytes.push(...Buffer.from(value, "latin1"), 0);
}

function scaledHealth(health: HealthView): number {
  if (health.current <= 0 || health.max <= 0) return 0;
  return Math.max(1, Math.min(30, Math.floor((health.current * 30) / health.max)));
}

function writeHits(bytes: number[], view: ActorUpdateView, npc: boolean): void {
  const hits = view.hits?.slice(0, 255) ?? [];
  if (npc) byteS(bytes, hits.length);
  else byteC(bytes, hits.length);
  for (const hit of hits) {
    smart(bytes, hit.type);
    smart(bytes, hit.damage);
    smart(bytes, hit.delay ?? 0);
  }
  const health = view.health;
  const count = health ? 1 : 0;
  if (npc) byteA(bytes, count);
  else byteC(bytes, count);
  if (health) {
    smart(bytes, 0);
    smart(bytes, 0);
    smart(bytes, 0);
    const value = scaledHealth(health);
    if (npc) byteC(bytes, value);
    else bytes.push(value);
  }
}

function playerUpdateMask(
  view: PlayerView,
  writeMovementType: boolean,
  writeAppearance: boolean
): number {
  return (view.forcedChat !== undefined ? PLAYER_MASK.FORCED_CHAT : 0) |
    (view.faceDirection !== undefined ? PLAYER_MASK.FACE_DIR : 0) |
    (writeAppearance ? PLAYER_MASK.APPEARANCE : 0) |
    (view.animation ? PLAYER_MASK.ANIMATION : 0) |
    (view.hits ? PLAYER_MASK.HIT : 0) |
    (view.interactionIndex !== undefined ? PLAYER_MASK.FACE_ENTITY : 0) |
    (view.forcedMovement ? PLAYER_MASK.FORCE_MOVEMENT : 0) |
    (writeMovementType ? PLAYER_MASK.MOVEMENT_TYPE : 0) |
    (view.graphic ? PLAYER_MASK.SPOT_ANIM : 0);
}

function npcUpdateMask(view: NpcView, writeInteraction: boolean): number {
  return (writeInteraction ? NPC_MASK.FACE_ENTITY : 0) |
    (view.animation ? NPC_MASK.ANIMATION : 0) |
    (view.hits ? NPC_MASK.HIT : 0) |
    (view.forcedChat !== undefined ? NPC_MASK.FORCED_CHAT : 0) |
    (view.graphic ? NPC_MASK.SPOT_ANIM : 0);
}

function writePlayerUpdateBlock(
  view: PlayerView,
  writeMovementType: boolean,
  movementType: 1 | 2 | undefined,
  writeAppearance: boolean
): Buffer {
  const bytes: number[] = [];
  const mask = playerUpdateMask(view, writeMovementType, writeAppearance);
  writeMask(bytes, mask);
  if (view.forcedChat !== undefined) writeText(bytes, view.forcedChat);
  if (view.faceDirection !== undefined) shortLE(bytes, view.faceDirection & 2047);
  if (view.interactionIndex !== undefined) {
    const target = view.interactionIndex < 0 ? 0xffffff : view.interactionIndex & 0xffffff;
    shortBE(bytes, target & 0xffff);
    bytes.push((target >>> 16) & 0xff);
  }
  if (view.animation) {
    shortLEA(bytes, view.animation.id < 0 ? 0xffff : view.animation.id);
    bytes.push(view.animation.delay & 0xff);
  }
  if (view.hits) writeHits(bytes, view, false);
  if (writeMovementType) byteC(bytes, movementType ?? 0);
  if (writeAppearance) {
    const length = Math.min(255, view.appearance.length);
    byteC(bytes, length);
    bytes.push(...view.appearance.subarray(0, length));
  }
  if (view.forcedMovement) {
    const movement = view.forcedMovement;
    byteS(bytes, movement.startDeltaX);
    bytes.push(movement.startDeltaY & 0xff, movement.endDeltaX & 0xff);
    byteA(bytes, movement.endDeltaY);
    shortBEA(bytes, movement.startCycleOffset);
    shortBE(bytes, movement.endCycleOffset);
    shortLEA(bytes, movement.direction & 2047);
  }
  if (view.graphic) {
    byteA(bytes, 1);
    bytes.push(0);
    shortBE(bytes, view.graphic.id < 0 ? 0xffff : view.graphic.id);
    intME(bytes, ((view.graphic.height & 0xffff) << 16) | (view.graphic.delay & 0xffff));
  }
  return Buffer.from(bytes);
}

function writeNpcUpdateBlock(view: NpcView, writeInteraction: boolean): Buffer {
  const bytes: number[] = [];
  const mask = npcUpdateMask(view, writeInteraction);
  writeMask(bytes, mask);
  if (writeInteraction) {
    const target = (view.interactionIndex ?? -1) < 0 ? 0xffffff : view.interactionIndex! & 0xffffff;
    shortLEA(bytes, target);
    byteA(bytes, target >>> 16);
  }
  if (view.hits) writeHits(bytes, view, true);
  if (view.forcedChat !== undefined) writeText(bytes, view.forcedChat);
  if (view.graphic) {
    bytes.push(1);
    byteA(bytes, 0);
    shortLE(bytes, view.graphic.id < 0 ? 0xffff : view.graphic.id);
    intME(bytes, ((view.graphic.height & 0xffff) << 16) | (view.graphic.delay & 0xffff));
  }
  if (view.animation) {
    shortBE(bytes, view.animation.id < 0 ? 0xffff : view.animation.id);
    bytes.push(view.animation.delay & 0xff);
  }
  return Buffer.from(bytes);
}

export function encodePlayerSync(
  localIndex: number,
  baseX: number,
  baseY: number,
  loopCycle: number,
  views: PlayerView[],
  state: PlayerSyncState
): Buffer {
  const writer = new BitWriter();
  const viewByIndex = new Map<number, PlayerView>();
  for (const view of views) {
    if (view.index > 0 && view.index < 2048 && !viewByIndex.has(view.index)) {
      viewByIndex.set(view.index, view);
    }
  }
  const localView = viewByIndex.get(localIndex);
  if (!localView) throw new Error("player sync is missing its local player");

  const activeNow = new Set(viewByIndex.keys());
  const previous = new Set(state.active);
  const spawned = new Set<number>();
  for (const index of activeNow) if (!previous.has(index)) spawned.add(index);
  const updateBlocks: Buffer[] = [];

  const movement = (index: number) => {
    const view = viewByIndex.get(index);
    const from = state.lastTiles.get(index);
    if (!view || !from) return { changed: !!view, dx: 0, dy: 0, planeDelta: 0, movementType: undefined };
    const tile = view.forcedMovementEnd && !view.forcedMovement ? view.forcedMovementEnd : view;
    const dx = tile.x - from.x;
    const dy = tile.y - from.y;
    const planeDelta = (tile.level - from.level) & 3;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    const movementType = planeDelta === 0 && distance > 0 && distance <= 2
      ? (distance === 2 ? 2 : 1) as 1 | 2
      : undefined;
    return { changed: dx !== 0 || dy !== 0 || planeDelta !== 0, dx, dy, planeDelta, movementType };
  };
  const needsBlock = (index: number): boolean => {
    const view = viewByIndex.get(index);
    if (!view) return false;
    const nextType = movement(index).movementType;
    const writeMovementType = nextType !== undefined && state.movementTypes.get(index) !== nextType;
    return playerUpdateMask(view, writeMovementType, view.appearanceDirty === true) !== 0;
  };
  const shouldUpdatePlayer = (index: number): boolean =>
    !viewByIndex.has(index) || movement(index).changed || needsBlock(index);

  const appendUpdateBlock = (index: number, forceAppearance = false): void => {
    const view = viewByIndex.get(index);
    if (!view) return;
    const nextType = movement(index).movementType;
    const writeMovementType = nextType !== undefined && state.movementTypes.get(index) !== nextType;
    const writeAppearance = forceAppearance || view.appearanceDirty === true;
    updateBlocks.push(writePlayerUpdateBlock(view, writeMovementType, nextType, writeAppearance));
  };

  const writePlayerUpdate = (index: number): void => {
    const view = viewByIndex.get(index);
    const move = movement(index);
    const block = !!view && needsBlock(index);
    writer.writeBits(1, block ? 1 : 0);
    if (!view) {
      writer.writeBits(2, 0);
      writer.writeBits(1, 0);
      const last = state.lastTiles.get(index);
      if (last) state.regions[index] = ((last.level & 3) << 28) |
        (((last.x >>> 13) & 0xff) << 14) | ((last.y >>> 13) & 0xff);
      return;
    }
    if (!move.changed) writer.writeBits(2, 0);
    else if (move.planeDelta === 0 && Math.max(Math.abs(move.dx), Math.abs(move.dy)) === 1) {
      const direction = [0, 1, 2, 3, -1, 4, 5, 6, 7][(move.dy + 1) * 3 + move.dx + 1];
      writer.writeBits(2, 1);
      writer.writeBits(3, direction);
    } else {
      const runDirection = move.planeDelta === 0 ? RUN_DIRECTIONS.indexOf(`${move.dx},${move.dy}`) : -1;
      if (runDirection >= 0) {
        writer.writeBits(2, 2);
        writer.writeBits(4, runDirection);
      } else {
        writer.writeBits(2, 3);
        if (move.dx >= -16 && move.dx <= 15 && move.dy >= -16 && move.dy <= 15) {
          writer.writeBits(1, 0);
          writer.writeBits(12, (move.planeDelta << 10) | ((move.dx & 0x1f) << 5) | (move.dy & 0x1f));
        } else {
          writer.writeBits(1, 1);
          writer.writeBits(30, ((move.planeDelta << 28) |
            ((move.dx & 0x3fff) << 14) | (move.dy & 0x3fff)) >>> 0);
        }
      }
    }
    if (block) appendUpdateBlock(index);
  };

  const writeExternalUpdate = (index: number): void => {
    const view = viewByIndex.get(index)!;
    const packedRegion = ((view.level & 3) << 28) |
      (((view.x >>> 13) & 0xff) << 14) | ((view.y >>> 13) & 0xff);
    writer.writeBits(2, 0);
    writer.writeBits(1, state.regions[index] === packedRegion ? 0 : 1);
    if (state.regions[index] !== packedRegion) {
      const current = state.regions[index];
      const planeDelta = ((packedRegion >>> 28) - (current >>> 28)) & 3;
      const dx = (((packedRegion >>> 14) & 0xff) - ((current >>> 14) & 0xff)) & 0xff;
      const dy = ((packedRegion & 0xff) - (current & 0xff)) & 0xff;
      writer.writeBits(2, 3);
      writer.writeBits(18, (planeDelta << 16) | (dx << 8) | dy);
      state.regions[index] = packedRegion;
    }
    writer.writeBits(13, view.x & 0x1fff);
    writer.writeBits(13, view.y & 0x1fff);
    writer.writeBits(1, 0); // no world view
    writer.writeBits(1, 1); // appearance follows
    appendUpdateBlock(index, true);
  };

  const writePass = (
    indices: number[],
    wantBit: 0 | 1,
    shouldUpdate: (index: number) => boolean,
    writeUpdate: (index: number) => void,
    markUpdated: boolean
  ): void => {
    let skip = 0;
    for (let offset = 0; offset < indices.length; offset++) {
      const index = indices[offset];
      if ((state.flags[index] & 1) !== wantBit) continue;
      if (skip > 0) {
        skip--;
        state.flags[index] |= 2;
        continue;
      }
      if (shouldUpdate(index)) {
        writer.writeBits(1, 1);
        writeUpdate(index);
        if (markUpdated) state.flags[index] |= 2;
        continue;
      }
      let run = 0;
      for (let next = offset + 1; next < indices.length && run < 2047; next++) {
        const nextIndex = indices[next];
        if ((state.flags[nextIndex] & 1) !== wantBit) continue;
        if (shouldUpdate(nextIndex)) break;
        run++;
      }
      writer.writeBits(1, 0);
      writeSkipCount(writer, run);
      state.flags[index] |= 2;
      skip = run;
    }
  };

  writePass(state.active, 0, shouldUpdatePlayer, writePlayerUpdate, false);
  writer.alignToByte();
  writePass(state.active, 1, shouldUpdatePlayer, writePlayerUpdate, false);
  writer.alignToByte();
  writePass(state.empty, 1, (index) => spawned.has(index), writeExternalUpdate, true);
  writer.alignToByte();
  writePass(state.empty, 0, (index) => spawned.has(index), writeExternalUpdate, true);

  for (let index = 1; index < 2048; index++) state.flags[index] >>>= 1;
  state.active = Array.from(activeNow).sort((a, b) => a - b);
  state.empty = [];
  for (let index = 1; index < 2048; index++) if (!activeNow.has(index)) state.empty.push(index);
  for (const [index] of state.lastTiles) if (!activeNow.has(index)) state.lastTiles.delete(index);
  for (const view of viewByIndex.values()) {
    const nextType = movement(view.index).movementType;
    const tile = view.forcedMovementEnd ?? view;
    state.lastTiles.set(view.index, { x: tile.x, y: tile.y, level: tile.level });
    if (nextType !== undefined) state.movementTypes.set(view.index, nextType);
  }

  const sync = Buffer.concat([writer.toBuffer(), ...updateBlocks]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(baseX, 0);
  header.writeUInt16BE(baseY, 2);
  header.writeUInt16BE(localIndex, 4);
  header.writeInt32BE(loopCycle | 0, 6);
  header.writeUInt16BE(sync.length, 10);
  return packet(ServerPacket.PLAYER_SYNC, Buffer.concat([header, sync]), 2);
}

export function encodeNpcSync(
  loopCycle: number,
  local: Tile,
  views: NpcView[],
  state: NpcSyncState
): Buffer {
  const writer = new BitWriter();
  const desired = new Map<number, NpcView>();
  for (const view of views) {
    if (view.index >= 0 && view.index < 0xffff && !desired.has(view.index)) desired.set(view.index, view);
  }
  const nextIndices: number[] = [];
  const readd = new Set<number>();
  const updateBlocks: Buffer[] = [];
  writer.writeBits(8, Math.min(255, state.indices.length));

  for (const index of state.indices.slice(0, 255)) {
    const view = desired.get(index);
    const last = state.lastTiles.get(index);
    if (!view || !last || view.level !== local.level || state.typeIds.get(index) !== view.typeId) {
      writer.writeBits(1, 1);
      writer.writeBits(2, 3);
      if (view) readd.add(index);
      continue;
    }
    const writeInteraction = state.interactionIndices.get(index) !== (view.interactionIndex ?? -1);
    const block = npcUpdateMask(view, writeInteraction) !== 0;
    if (view.runDirection >= 0 && view.walkDirection >= 0) {
      writer.writeBits(1, 1);
      writer.writeBits(2, 2);
      writer.writeBits(1, 1);
      writer.writeBits(3, view.walkDirection);
      writer.writeBits(3, view.runDirection);
      writer.writeBits(1, block ? 1 : 0);
      nextIndices.push(index);
    } else if (view.walkDirection >= 0) {
      writer.writeBits(1, 1);
      writer.writeBits(2, 1);
      writer.writeBits(3, view.walkDirection);
      writer.writeBits(1, block ? 1 : 0);
      nextIndices.push(index);
    } else if (view.x === last.x && view.y === last.y) {
      if (block) {
        writer.writeBits(1, 1);
        writer.writeBits(2, 0);
      } else {
        writer.writeBits(1, 0);
      }
      nextIndices.push(index);
    } else {
      writer.writeBits(1, 1);
      writer.writeBits(2, 3);
      readd.add(index);
    }
    if (block && nextIndices[nextIndices.length - 1] === index) {
      updateBlocks.push(writeNpcUpdateBlock(view, writeInteraction));
    }
  }

  const nextSet = new Set(nextIndices);
  const additions = Array.from(desired.values()).filter((view) => !nextSet.has(view.index));
  const large = additions.some((view) => {
    const dx = view.x - local.x;
    const dy = view.y - local.y;
    return dx < -16 || dx > 15 || dy < -16 || dy > 15;
  });
  const signed = (value: number, bits: number) => (value < 0 ? value + (1 << bits) : value) & ((1 << bits) - 1);
  for (const view of additions) {
    if (nextIndices.length >= 255 || view.level !== local.level) break;
    writer.writeBits(16, view.index);
    const writeInteraction = (view.interactionIndex ?? -1) >= 0;
    const block = npcUpdateMask(view, writeInteraction) !== 0;
    writer.writeBits(1, block ? 1 : 0);
    writer.writeBits(1, 0); // no world view
    writer.writeBits(1, readd.has(view.index) ? 1 : 0);
    writer.writeBits(large ? 8 : 5, signed(view.y - local.y, large ? 8 : 5));
    writer.writeBits(large ? 8 : 5, signed(view.x - local.x, large ? 8 : 5));
    writer.writeBits(3, view.rotation & 7);
    writer.writeBits(14, view.typeId & 0x3fff);
    nextIndices.push(view.index);
    nextSet.add(view.index);
    if (block) updateBlocks.push(writeNpcUpdateBlock(view, writeInteraction));
  }
  writer.writeBits(16, 0xffff);

  state.indices = nextIndices;
  state.lastTiles.clear();
  state.typeIds.clear();
  state.interactionIndices.clear();
  for (const index of nextIndices) {
    const view = desired.get(index);
    if (view) {
      state.lastTiles.set(index, { x: view.x, y: view.y, level: view.level });
      state.typeIds.set(index, view.typeId);
      state.interactionIndices.set(index, view.interactionIndex ?? -1);
    }
  }
  const sync = Buffer.concat([writer.toBuffer(), ...updateBlocks]);
  const header = Buffer.alloc(7);
  header.writeInt32BE(loopCycle | 0, 0);
  header[4] = large ? 1 : 0;
  header.writeUInt16BE(sync.length, 5);
  return packet(ServerPacket.NPC_INFO, Buffer.concat([header, sync]), 2);
}

export function encodeProjectiles(projectiles: ProjectileView[]): Buffer {
  const payload = Buffer.alloc(2 + projectiles.length * 29);
  payload.writeUInt16BE(projectiles.length, 0);
  let offset = 2;
  for (const projectile of projectiles) {
    payload.writeUInt16BE(projectile.projectileId & 0xffff, offset);
    payload.writeUInt16BE(projectile.source.x & 0xffff, offset + 2);
    payload.writeUInt16BE(projectile.source.y & 0xffff, offset + 4);
    payload[offset + 6] = projectile.source.level & 0xff;
    payload.writeUInt16BE(projectile.sourceHeight & 0xffff, offset + 7);
    payload.writeUInt16BE(projectile.target.x & 0xffff, offset + 9);
    payload.writeUInt16BE(projectile.target.y & 0xffff, offset + 11);
    payload[offset + 13] = projectile.target.level & 0xff;
    payload.writeUInt16BE(projectile.endHeight & 0xffff, offset + 14);
    payload[offset + 16] = projectile.slope & 0xff;
    payload.writeUInt16BE(projectile.startPos & 0xffff, offset + 17);
    payload.writeUInt16BE(projectile.startCycleOffset & 0xffff, offset + 19);
    payload.writeUInt16BE(projectile.endCycleOffset & 0xffff, offset + 21);
    payload[offset + 23] = 0;
    payload.writeUInt16BE(0, offset + 24);
    payload[offset + 26] = projectile.targetActor?.kind === "player" ? 1
      : projectile.targetActor?.kind === "npc" ? 2 : 0;
    payload.writeUInt16BE(projectile.targetActor?.index ?? 0, offset + 27);
    offset += 29;
  }
  return encodeServerPacket(ServerPacketId.PROJECTILES, payload);
}

export function encodeDefaultAnimations(): Buffer {
  const ids = [808, 819, 820, 821, 822, 824, 824, 824, 824, 823, 823];
  const payload = Buffer.alloc(ids.length * 2);
  ids.forEach((id, index) => payload.writeInt16BE(id, index * 2));
  return packet(ServerPacket.ANIM, payload, 0);
}

export function encodeLogoutResponse(reason = ""): Buffer {
  return packet(ServerPacket.LOGOUT_RESPONSE, Buffer.concat([Buffer.from([1]), string(reason)]));
}
