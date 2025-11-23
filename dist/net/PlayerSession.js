"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerSession = void 0;
// import { Player } from '../game/entity/impl/player/Player';
// import { World } from '../game/World';
const PacketDecoder_1 = require("./codec/PacketDecoder");
const PacketConstants_1 = require("./packet/PacketConstants");
const NetworkConstants_1 = require("./NetworkConstants");
const PacketType_1 = require("./packet/PacketType");
class PlayerSession {
    // public player: Player;
    constructor(channel) {
        this.packetsQueue = [];
        this.lastPacketOpcodeQueue = [];
        this.channel = channel;
        // this.player = new Player(this);
    }
    async finalizeLogin(msg) {
        // let response = await LoginResponses.evaluate(this.player, msg);
        // this.player.setLongUsername(Misc.stringToLong(this.player.getUsername()));
        // this.channel.emit("login_response", new LoginResponsePacket(response, this.player.getRights()));
        // if (response != LoginResponses.LOGIN_SUCCESSFUL) {
        //     this.channel.disconnect();
        //     return;
        // }
        // Replace decoder/encoder to packets
        this.channel.removeAllListeners("packet");
        this.channel.on("packet", (data) => {
            const packetDecoder = new PacketDecoder_1.PacketDecoder(msg.getDecryptor());
            const packet = packetDecoder.onConnection(data);
            this.queuePacket(packet);
        });
        // Queue the login
        // if (!World.getAddPlayerQueue().includes(this.player)) {
        //     World.getAddPlayerQueue().push(this.player);
        // }
    }
    queuePacket(msg) {
        if (PacketConstants_1.PacketConstants.PACKETS[msg.getOpcode()] == null) {
            return;
        }
        let total_size = this.packetsQueue.length;
        if (total_size >= NetworkConstants_1.NetworkConstants.PACKET_PROCESS_LIMIT) {
            return;
        }
        if (msg.getOpcode() == PacketConstants_1.PacketConstants.EQUIP_ITEM_OPCODE ||
            msg.getOpcode() == PacketConstants_1.PacketConstants.SPECIAL_ATTACK_OPCODE) {
            this.packetsQueue.unshift(msg);
            return;
        }
        this.packetsQueue.push(msg);
    }
    processPackets() {
        for (let i = 0; i < NetworkConstants_1.NetworkConstants.PACKET_PROCESS_LIMIT; i++) {
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
            }
            catch (e) {
                console.log("processedPackets: " + this.lastPacketOpcodeQueue);
                console.error(e);
            }
            finally {
                packet.getBuffer();
            }
        }
    }
    write(builder) {
        const chan = this.channel;
        // ws path
        if (chan && typeof chan.send === "function") {
            const packet = builder.toPacket();
            const opcode = packet.getOpcode();
            const payload = packet.getBuffer();
            const encOpcode = this.encryptor != null ? (opcode + this.encryptor.nextInt()) & 0xff : opcode;
            let header;
            switch (packet.getType()) {
                case PacketType_1.PacketType.VARIABLE:
                    header = Buffer.alloc(2);
                    header.writeUInt8(encOpcode, 0);
                    header.writeUInt8(payload.length, 1);
                    break;
                case PacketType_1.PacketType.VARIABLE_SHORT:
                    header = Buffer.alloc(3);
                    header.writeUInt8(encOpcode, 0);
                    header.writeUInt16BE(payload.length, 1);
                    break;
                default:
                    header = Buffer.from([encOpcode]);
            }
            chan.send(Buffer.concat([header, payload]));
            return;
        }
        // socket.io fallback
        if (!this.channel.connected) {
            return;
        }
        try {
            const packet = builder.toPacket();
            this.channel.emit("packet", packet);
        }
        catch (ex) {
            console.error(ex);
        }
    }
    flush() {
        const chan = this.channel;
        if (chan && typeof chan.send === "function") {
            try {
                chan.close();
            }
            catch {
                // ignore
            }
            return;
        }
        if (!this.channel.connected) {
            return;
        }
        this.channel.disconnect();
    }
    // public getPlayer(): Player {
    //     return this.player;
    // }
    // public setPlayer(player: Player) {
    //     this.player = player;
    // }
    getChannel() {
        return this.channel;
    }
    setEncryptor(enc) {
        this.encryptor = enc;
    }
}
exports.PlayerSession = PlayerSession;
//# sourceMappingURL=PlayerSession.js.map