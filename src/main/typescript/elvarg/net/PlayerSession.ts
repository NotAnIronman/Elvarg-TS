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
  connected?: boolean;
  disconnect?: () => void;
  emit?: (event: string, payload: Packet) => void;
  on?: (event: string, handler: (data: unknown) => void) => void;
  readyState?: number;
  removeAllListeners?: (event?: string) => void;
  send?: (payload: Buffer) => void;
};

const PACKET_OUT_LOGGING_ENABLED = process.env.PACKET_OUT_LOGGING === "1";
const ESTABLISHED_STAGE = "ESTABLISHED";
const NOP_PACKET_LISTENER = new NOPPacketListener();

export interface OutboundPacketMeta {
  opcode: number;
  encOpcode: number;
  payloadLength: number;
  packetType: PacketType;
  payloadPreview?: string;
}

export class PlayerSession {
  private packetsQueue: FastDeque<Packet> = new FastDeque<Packet>();
  private outboundFrames: Buffer[] = [];
  private outboundSocketPackets: Packet[] = [];
  private lastPacketOpcodeQueue: number[] = [];
  private channel: SessionChannel;
  private encryptor?: IsaacRandom;
  private outboundBatchingEnabled = false;
  private outboundPacketObserver?: (meta: OutboundPacketMeta) => void;
  private shouldLogPacketOut?: () => boolean;
  private player?: Player;

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
    const isWebSocket = this.isWebSocketChannel();
    const outbound = this.buildOutboundPacket(builder, isWebSocket);
    if (!outbound) {
      return;
    }

    if (!this.outboundBatchingEnabled) {
      this.writeImmediately(outbound);
      return;
    }

    if (isWebSocket) {
      this.outboundFrames.push(outbound.encodedFrame as Buffer);
      return;
    }

    if (!this.channel.connected || typeof this.channel.emit !== "function") {
      return;
    }

    this.outboundSocketPackets.push(outbound.packet);
  }

  public flush() {
    if (this.isWebSocketChannel()) {
      if (typeof this.channel.readyState === "number" && this.channel.readyState !== 1) {
        this.outboundFrames.length = 0;
        return;
      }
      while (this.outboundFrames.length > 0) {
        const payload = this.outboundFrames.shift();
        if (!payload) {
          continue;
        }
        try {
          this.channel.send?.(payload);
        } catch (err) {
          // Ground-item/global updates can target stale sessions; never let this crash the server loop.
          console.error("[PlayerSession.flush] websocket send failed", err);
          break;
        }
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

  private isWebSocketChannel(): boolean {
    return (
      typeof this.channel.readyState === "number" &&
      typeof this.channel.send === "function"
    );
  }

  private buildOutboundPacket(
    builder: PacketBuilder,
    encodeForWebSocket: boolean
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

      const encodedFrame = encodeForWebSocket
        ? this.encodePacket(opcode, payload, packetType)
        : null;
      if (encodeForWebSocket && !encodedFrame) {
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
    if (this.isWebSocketChannel()) {
      if (typeof this.channel.readyState === "number" && this.channel.readyState !== 1) {
        return;
      }
      if (!outbound.encodedFrame) {
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
