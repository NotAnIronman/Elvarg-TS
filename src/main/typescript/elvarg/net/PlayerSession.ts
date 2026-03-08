// import { Player } from '../game/entity/impl/player/Player';
// import { World } from '../game/World';
import { PacketDecoder } from "./codec/PacketDecoder";
import { PacketEncoder } from "./codec/PacketEncoder";
import { LoginDetailsMessage } from "./login/LoginDetailsMessage";
import { LoginResponsePacket } from "./login/LoginResponsePacket";
import { LoginResponses } from "./login/LoginResponses";
import { Packet } from "./packet/Packet";
import { PacketBuilder } from "./packet/PacketBuilder";
import { PacketConstants } from "./packet/PacketConstants";
import { Misc } from "../util/Misc";
import { NetworkConstants } from "./NetworkConstants";
// import { PlayerRights } from '../game/model/rights/PlayerRights';
import { Server, Socket } from "socket.io";
import { PacketType } from "./packet/PacketType";
import { IsaacRandom } from "./security/IsaacRandom";
import {
  getExpectedOutboundPacketSize,
  getExpectedOutboundPacketType,
} from "./OutboundPacketProfile";
import type { Player } from "../game/entity/impl/player/Player";
import { GameConstants } from "../game/GameConstants";
import { FastDeque } from "../util/FastDeque";

const PACKET_OUT_LOGGING_ENABLED = process.env.PACKET_OUT_LOGGING === "1";

export interface OutboundPacketMeta {
  opcode: number;
  encOpcode: number;
  payloadLength: number;
  packetType: PacketType;
  payloadPreview?: string;
}

export class PlayerSession {
  private packetsQueue: FastDeque<Packet> = new FastDeque<Packet>();
  private lastPacketOpcodeQueue: number[] = [];
  private channel: Socket;
  private encryptor?: IsaacRandom;
  private outboundPacketObserver?: (meta: OutboundPacketMeta) => void;
  private shouldLogPacketOut?: () => boolean;
  private player?: Player;

  constructor(
    channel: any,
    outboundPacketObserver?: (meta: OutboundPacketMeta) => void,
    shouldLogPacketOut?: () => boolean
  ) {
    this.channel = channel;
    this.outboundPacketObserver = outboundPacketObserver;
    this.shouldLogPacketOut = shouldLogPacketOut;
    // this.player = new Player(this);
  }

  public async finalizeLogin(msg: LoginDetailsMessage) {
    // let response = await LoginResponses.evaluate(this.player, msg);

    // this.player.setLongUsername(Misc.stringToLong(this.player.getUsername()));

    // this.channel.emit("login_response", new LoginResponsePacket(response, this.player.getRights()));

    // if (response != LoginResponses.LOGIN_SUCCESSFUL) {
    //     this.channel.disconnect();
    //     return;
    // }

    // Replace decoder/encoder to packets
    this.channel.removeAllListeners("packet");
    this.channel.on("packet", (data: any) => {
      const packetDecoder = new PacketDecoder(msg.getDecryptor());
      const packet = packetDecoder.onConnection(data);
      this.queuePacket(packet);
    });

    // Queue the login
    // if (!World.getAddPlayerQueue().includes(this.player)) {
    //     World.getAddPlayerQueue().push(this.player);
    // }
  }

  public queuePacket(msg: Packet) {
    if (PacketConstants.PACKETS[msg.getOpcode()] == null) {
      return;
    }

    let total_size = this.packetsQueue.length;
    if (total_size >= NetworkConstants.PACKET_PROCESS_LIMIT) {
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
    for (let i = 0; i < NetworkConstants.PACKET_PROCESS_LIMIT; i++) {
      let packet = this.packetsQueue.shift();
      if (packet == null) {
        continue;
      }
      if (this.lastPacketOpcodeQueue.length > 4) {
        this.lastPacketOpcodeQueue.shift();
      }
      this.lastPacketOpcodeQueue.push(packet.getOpcode());
      try {
        // PacketConstants.PACKETS[packet.getOpcode()].execute(this.player, packet);
      } catch (e) {
        console.log("processedPackets: " + this.lastPacketOpcodeQueue);
        console.error(e);
      } finally {
        packet.getBuffer();
      }
    }
  }

  public write(builder: PacketBuilder) {
    const chan: any = this.channel;
    // ws path
    if (chan && typeof chan.send === "function") {
      // ws.OPEN = 1; skip sends for closed/closing sockets to avoid hard crashes.
      if (typeof chan.readyState === "number" && chan.readyState !== 1) {
        return;
      }
      try {
        const packet = builder.toPacket();
        const opcode = packet.getOpcode();
        if (!Number.isInteger(opcode) || opcode < 0 || opcode > 255) {
          console.warn(
            `[PlayerSession.write] dropping packet with invalid opcode=${opcode}`
          );
          return;
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
          return;
        }
        if (expectedPacketType != null && expectedPacketType !== packet.getType()) {
          console.warn(
            `[PlayerSession.write] correcting packet type opcode=${opcode} expected=${expectedPacketType} actual=${packet.getType()}`
          );
        }
        const encOpcode =
          this.encryptor != null ? (opcode + this.encryptor.nextInt()) & 0xff : opcode;
        const payloadPreview = payload
          .subarray(0, Math.min(16, payload.length))
          .toString("hex");
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
        // Log outgoing packets to help diagnose client desyncs.
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
        let header: Buffer;
        switch (packetType) {
          case PacketType.VARIABLE:
          case PacketType.VARIABLE_BYTE:
            if (payload.length > 0xff) {
              console.error(
                `[PlayerSession.write] dropping oversized variable packet opcode=${opcode} len=${payload.length}`
              );
              return;
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
        chan.send(Buffer.concat([header, payload]));
      } catch (err) {
        // Ground-item/global updates can target stale sessions; never let this crash the server loop.
        console.error("[PlayerSession.write] websocket send failed", err);
      }
      return;
    }

    // socket.io fallback
    if (!this.channel.connected) {
      return;
    }
    try {
      const packet = builder.toPacket();
      this.channel.emit("packet", packet);
    } catch (ex) {
      console.error(ex);
    }
  }

  public flush() {
    const chan: any = this.channel;
    if (chan && typeof chan.send === "function") {
      // WebSocket path does not need explicit flush; keep connection open.
      return;
    }
    if (!this.channel.connected) {
      return;
    }
    try {
      this.channel.disconnect();
    } catch {
      // best effort
    }
  }

  // public getPlayer(): Player {
  //     return this.player;
  // }

  public setPlayer(player: Player) {
    this.player = player;
  }

  public getChannel(): Socket {
    return this.channel;
  }

  public setEncryptor(enc: IsaacRandom) {
    this.encryptor = enc;
  }
}
