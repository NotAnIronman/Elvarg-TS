import { Packet } from '../packet/Packet';
import { IsaacRandom } from '../security/IsaacRandom'
import { NetworkConstants } from '../NetworkConstants'
import { Server, Socket } from 'socket.io';

export class PacketDecoder {
    private readonly random: IsaacRandom;
    private opcode: number;
    private size: number;
    private static readonly PACKET_SIZES = [
        0, 0, 6, 1, -1, -1, 2, 4, 4, 4, // 0
        4, 13, -1, -1, 8, 0, 6, 2, 2, 0, // 10
        0, 2, 0, 6, 0, 12, 0, 0, 0, 0, // 20
        9, 0, 0, 0, 0, 8, 4, 0, 0, 2, // 30
        2, 6, 0, 8, 0, -1, 0, 0, 0, 1, // 40
        0, 0, 0, 12, 0, 0, 0, 8, 0, 0, // 50
        -1, 8, 0, 0, 0, 0, 0, 0, 0, 0, // 60
        6, 0, 2, 2, 8, 6, 0, -1, 0, 6, // 70
        -1, 0, 0, 0, 0, 1, 4, 6, 0, 0, // 80
        0, 0, 0, 0, 0, 3, 0, 0, -1, 0, // 90
        0, 13, 0, -1, -1, 0, 0, 0, 0, 0, // 100
        0, 0, 0, 0, 0, 0, 0, 8, 0, 0, // 110
        1, 0, 6, 0, 0, 0, -1, 0, 2, 8, // 120
        0, 4, 6, 8, 0, 8, 0, 0, 6, 2, // 130
        0, 0, 0, 0, 0, 8, 0, 0, 0, 0, // 140
        0, 0, 1, 2, 0, 2, 6, 0, 0, 0, // 150
        0, 0, 0, 0, 5, -1, 5, 0, 0, 0, // 160
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 170
        0, 8, 0, 2, 4, 4, 5, 6, 8, 1, // 180
        0, 0, 12, 0, 0, 0, 0, 0, 0, 0, // 190
        2, 0, 0, 0, 2, 0, 0, 0, 4, 0, // 200
        4, 0, 0, 0, 9, 8, 8, 0, 10, 0, // 210
        0, 0, 3, 2, 0, 0, -1, 0, 6, 1, // 220
        1, 0, 0, 0, 6, 6, 6, 8, 1, 1, // 230
        0, 4, 0, 0, 0, 0, -1, 0, -1, 4, // 240
        0, 0, 6, 6, 0, 0 // 250
    ];

    constructor(random: IsaacRandom, private io?: Server) {
        this.random = random;
        this.opcode = -1;
        this.size = -1;
    }

    public onConnection(socket: Socket): Packet {
        let session = socket.data[NetworkConstants.SESSION_KEY];
        if (session == null || session.getPlayer() == null) {
            return;
        }

        socket.on('packet', (data: Uint8Array) => {
            let opcode = this.opcode;
            let size = this.size;

            if (opcode == -1) {
                if (data.length >= 1) {
                    opcode = data[0];
                    opcode = opcode - this.random.nextInt() & 0xFF;
                    size = PacketDecoder.PACKET_SIZES[opcode];
                    if (size === undefined) {
                        this.opcode = -1;
                        this.size = -1;
                        return;
                    }
                    this.opcode = opcode;
                    this.size = size;
                } else {
                    return;
                }
            }

            if (size == -1) {
                if (data.length >= 2) {
                    size = data[1] & 0xFF;
                    this.size = size;
                } else {
                    return;
                }
            } else if (size == -2) {
                if (data.length >= 3) {
                    size = ((data[1] & 0xFF) << 8) | (data[2] & 0xFF);
                    this.size = size;
                } else {
                    return;
                }
            }

            if (data.length >= size) {
                let packetData = data.slice(0, size);
                this.opcode = -1;
                this.size = -1;
                let packet = new Packet(opcode, Buffer.from(packetData));
                this.io.emit('packet', packet); // broadcast packet to all connected sockets
            }
        });
    }
}
