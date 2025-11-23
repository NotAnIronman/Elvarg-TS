"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PacketDecoder = void 0;
const Packet_1 = require("../packet/Packet");
const NetworkConstants_1 = require("../NetworkConstants");
class PacketDecoder {
    constructor(random, io) {
        this.io = io;
        this.random = random;
        this.opcode = -1;
        this.size = -1;
    }
    onConnection(socket) {
        let session = socket.data[NetworkConstants_1.NetworkConstants.SESSION_KEY];
        if (session == null || session.getPlayer() == null) {
            return;
        }
        socket.on('packet', (data) => {
            let opcode = this.opcode;
            let size = this.size;
            if (opcode == -1) {
                if (data.length >= 1) {
                    opcode = data[0];
                    opcode = opcode - this.random.nextInt() & 0xFF;
                    size = PacketDecoder.PACKET_SIZES[opcode];
                    this.opcode = opcode;
                    this.size = size;
                }
                else {
                    return;
                }
            }
            if (size == -1) {
                if (data.length >= 2) {
                    size = data[1] & 0xFF;
                    this.size = size;
                }
                else {
                    return;
                }
            }
            if (data.length >= size) {
                let packetData = data.slice(0, size);
                this.opcode = -1;
                this.size = -1;
                let packet = new Packet_1.Packet(opcode, Buffer.from(packetData));
                this.io.emit('packet', packet); // broadcast packet to all connected sockets
            }
        });
    }
}
exports.PacketDecoder = PacketDecoder;
PacketDecoder.PACKET_SIZES = [
// ...
];
//# sourceMappingURL=PacketDecoder.js.map