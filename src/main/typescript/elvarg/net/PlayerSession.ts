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
import { FastDeque } from "../util/FastDeque";
import { PluginManager } from "../plugins/PluginManager";
import { NOPPacketListener } from "./packet/impl/NOPPacketListener";

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

  public flush() {
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
