"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Packet = void 0;
const PacketType_1 = require("./PacketType");
const ValueType_1 = require("./ValueType");
const stringbuilder_1 = require("stringbuilder");
class Packet {
    constructor(opcode, arg2, arg3) {
        this.offset = 0;
        this.opcode = opcode;
        if (arg3 !== undefined) {
            this.type = arg2;
            this.buffer = arg3;
        }
        else {
            this.type = PacketType_1.PacketType.FIXED;
            this.buffer = arg2;
        }
    }
    getOpcode() {
        return this.opcode;
    }
    getBuffer() {
        return this.buffer;
    }
    getSize() {
        return this.buffer.length;
    }
    getLength() {
        return this.buffer.length;
    }
    readByte() {
        const b = this.buffer.readUInt8(this.offset);
        this.offset++;
        return b;
    }
    readByteA() {
        return this.readByte() - 128;
    }
    readByteC() {
        return -this.readByte();
    }
    readByteS() {
        return 128 - this.readByte();
    }
    readUnsignedByteS() {
        return this.readByteS() & 0xff;
    }
    // public readBytes(bytes: number[]): Packet {
    //     this.buffer.readBytes(bytes);
    //     return this;
    // }
    readBytes(amount) {
        let bytes = new Array(amount);
        for (let i = 0; i < amount; i++) {
            bytes[i] = this.readByte();
        }
        return bytes;
    }
    readBytesA(amount) {
        if (amount < 0)
            throw new Error("The byte array amount cannot have a negative value!");
        let bytes = new Array(amount);
        for (let i = 0; i < amount; i++) {
            bytes[i] = this.readByte() + 128;
        }
        return bytes;
    }
    readReversedBytesA(amount) {
        let bytes = new Array(amount);
        let position = amount - 1;
        for (; position >= 0; position--) {
            bytes[position] = this.readByte() + 128;
        }
        return bytes;
    }
    readUnsignedByte() {
        const b = this.buffer.readUInt8(this.offset);
        this.offset++;
        return b;
    }
    readShort() {
        const val = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return val;
    }
    readShortA() {
        let value = ((this.readByte() & 0xFF) << 8) | (this.readByte() - 128 & 0xFF);
        return value > 32767 ? value - 0x10000 : value;
    }
    // ... previous code
    readLEShort() {
        let value = (this.readByte() & 0xFF) | (this.readByte() & 0xFF) << 8;
        return value > 32767 ? value - 0x10000 : value;
    }
    readLEShortA() {
        let value = (this.readByte() - 128 & 0xFF) | (this.readByte() & 0xFF) << 8;
        return value > 32767 ? value - 0x10000 : value;
    }
    readUnsignedShort() {
        const val = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return val;
    }
    readUnsignedShortA() {
        let value = 0;
        value |= this.readUnsignedByte() << 8;
        value |= (this.readByte() - 128) & 0xff;
        return value;
    }
    readInt() {
        const val = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return val;
    }
    readSingleInt() {
        const firstByte = this.readByte(), secondByte = this.readByte(), thirdByte = this.readByte(), fourthByte = this.readByte();
        return ((thirdByte << 24) & 0xFF) | ((fourthByte << 16) & 0xFF) | ((firstByte << 8) & 0xFF) | (secondByte & 0xFF);
    }
    readDoubleInt() {
        const firstByte = this.readByte() & 0xFF, secondByte = this.readByte() & 0xFF, thirdByte = this.readByte() & 0xFF, fourthByte = this.readByte() & 0xFF;
        return ((secondByte << 24) & 0xFF) | ((firstByte << 16) & 0xFF) | ((fourthByte << 8) & 0xFF) | (thirdByte & 0xFF);
    }
    readTripleInt() {
        return ((this.readByte() << 16) & 0xFF) | ((this.readByte() << 8) & 0xFF) | (this.readByte() & 0xFF);
    }
    readLong() {
        const high = this.readInt();
        const low = this.readInt();
        return high * 0x100000000 + low;
    }
    getBytesReverse(amount, type) {
        let data = new Array(amount);
        let dataPosition = 0;
        for (let i = this.buffer.length + amount - 1; i >= this.buffer.length; i--) {
            let value = this.buffer.readInt8(i);
            switch (type) {
                case ValueType_1.ValueType.A:
                    value -= 128;
                    break;
                case ValueType_1.ValueType.C:
                    value = -value;
                    break;
                case ValueType_1.ValueType.S:
                    value = 128 - value;
                    break;
                case ValueType_1.ValueType.STANDARD:
                    break;
            }
            data[dataPosition++] = value;
        }
        return data;
    }
    readString() {
        let builder = new stringbuilder_1.StringBuilder();
        let value;
        while (this.buffer.readUInt8() && (value = this.buffer.readInt8()) != 10) {
            builder.append(String.fromCharCode(value));
        }
        return builder.toString();
    }
    readSmart() {
        return this.buffer.readInt8(this.buffer.readInt8()) < 128 ? this.readByte() & 0xFF : (this.readShort() & 0xFFFF) - 32768;
    }
    readSignedSmart() {
        return this.buffer.readInt8(this.buffer.readInt8()) < 128 ? (this.readByte() & 0xFF) - 64 : (this.readShort() & 0xFFFF) - 49152;
    }
    toString() {
        return `Packet - [opcode, size] : [${this.getOpcode()}, ${this.getSize()}]`;
    }
    getType() {
        return this.type;
    }
}
exports.Packet = Packet;
//# sourceMappingURL=Packet.js.map