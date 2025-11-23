"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PacketBuilder = exports.AccessType = exports.ValueType = void 0;
const PacketType_1 = require("./PacketType");
const ByteOrder_1 = require("./ByteOrder");
const Packet_1 = require("./Packet");
var ValueType;
(function (ValueType) {
    ValueType[ValueType["A"] = 0] = "A";
    ValueType[ValueType["C"] = 1] = "C";
    ValueType[ValueType["S"] = 2] = "S";
    ValueType[ValueType["STANDARD"] = 3] = "STANDARD";
})(ValueType || (exports.ValueType = ValueType = {}));
var AccessType;
(function (AccessType) {
    AccessType[AccessType["BIT"] = 0] = "BIT";
    AccessType[AccessType["BYTE"] = 1] = "BYTE";
})(AccessType || (exports.AccessType = AccessType = {}));
class PacketBuilder {
    constructor(opcodeOrType, type) {
        this.buffers = Buffer.alloc(10);
        this._buffer = Buffer.from('my string', 'utf-8');
        if (typeof opcodeOrType === 'number') {
            this.opcode = opcodeOrType;
            this.type = type ?? PacketType_1.PacketType.FIXED;
        }
        else {
            this.opcode = -1;
            this.type = PacketType_1.PacketType.FIXED;
        }
    }
    writeBuffer(buffer) {
        this.buffers.write(buffer);
        return this;
    }
    writePutBytes(buffer) {
        this.buffers.write(buffer);
        return this;
    }
    putBytesReverse(data) {
        for (let i = data.length - 1; i >= 0; i--) {
            this.put(data[i]);
        }
        return this;
    }
    writeByteArray(bytes) {
        this.buffers.write(bytes);
        return this;
    }
    writePutBits(numBits, value) {
        if (!this.buffers.buffer) {
            throw new Error("The ByteBuf implementation must support array() for bit usage.");
        }
        let buffer = this.buffers.buffer;
        let bytePos = this.bitPosition >> 3;
        let bitOffset = 8 - (this.bitPosition & 7);
        this.bitPosition += numBits;
        for (; numBits > bitOffset; bitOffset = 8) {
            buffer[bytePos] &= ~PacketBuilder.BIT_MASK[bitOffset];
            buffer[bytePos++] |= (value >> (numBits - bitOffset)) & PacketBuilder.BIT_MASK[bitOffset];
            numBits -= bitOffset;
        }
        if (numBits == bitOffset) {
            buffer[bytePos] &= ~PacketBuilder.BIT_MASK[bitOffset];
            buffer[bytePos] |= value & PacketBuilder.BIT_MASK[bitOffset];
        }
        else {
            buffer[bytePos] &= ~(PacketBuilder.BIT_MASK[numBits] << (bitOffset - numBits));
            buffer[bytePos] |= (value & PacketBuilder.BIT_MASK[numBits]) << (bitOffset - numBits);
        }
        return this;
    }
    putsBit(flag) {
        this.putBits(1, flag ? 1 : 0);
        return this;
    }
    initializesAccess(type) {
        switch (type) {
            case AccessType.BIT:
                this.bitPosition = this.buffers.length * 8;
                break;
            case AccessType.BYTE:
                this.buffers.writeUInt32BE((this.bitPosition + 7) / 8);
                break;
        }
        return this;
    }
    put(value) {
        this.puts(value, ValueType.STANDARD);
        return this;
    }
    putsShort(value, type, order) {
        switch (order) {
            case ByteOrder_1.ByteOrder.BIG:
                this.put(value >> 8);
                this.puts(value, type);
                break;
            case ByteOrder_1.ByteOrder.MIDDLE:
                throw new Error("Middle-endian short is impossible!");
            case ByteOrder_1.ByteOrder.INVERSE_MIDDLE:
                throw new Error("Inverse-middle-endian short is impossible!");
            case ByteOrder_1.ByteOrder.LITTLE:
                this.puts(value, type);
                this.put(value >> 8);
                break;
            case ByteOrder_1.ByteOrder.TRIPLE_INT:
                throw new Error("TRIPLE_INT short not added!");
        }
        return this;
    }
    putTypeInt(value, type = ValueType.STANDARD, order = ByteOrder_1.ByteOrder.BIG) {
        switch (order) {
            case ByteOrder_1.ByteOrder.BIG:
                this.put((value >> 24));
                this.put((value >> 16));
                this.put((value >> 8));
                this.puts(value, type);
                break;
            case ByteOrder_1.ByteOrder.MIDDLE:
                this.put((value >> 8));
                this.puts(value, type);
                this.put((value >> 24));
                this.put((value >> 16));
                break;
            case ByteOrder_1.ByteOrder.INVERSE_MIDDLE:
                this.put((value >> 16));
                this.put((value >> 24));
                this.puts(value, type);
                this.put((value >> 8));
                break;
            case ByteOrder_1.ByteOrder.LITTLE:
                this.puts(value, type);
                this.put((value >> 8));
                this.put((value >> 16));
                this.put((value >> 24));
                break;
            case ByteOrder_1.ByteOrder.TRIPLE_INT:
                this.put((value >> 16));
                this.put((value >> 8));
                this.put(value);
                break;
        }
        return this;
    }
    putInt(value) {
        this.putInts(value, ValueType.STANDARD, ByteOrder_1.ByteOrder.BIG);
        return this;
    }
    putBytes(from) {
        for (let i = 0; i < from.length; i++) {
            this.put(from.readInt8(i));
        }
        return this;
    }
    putsBytes(from) {
        this.buffers.write(from);
        return this;
    }
    writeByteArrays(bytes, offset, length) {
        this.buffers.write(bytes, offset, length);
        return this;
    }
    writeBytesArray(bytes) {
        this.buffers.write(bytes);
        return this;
    }
    putBits(numBits, value) {
        if (!this.buffers.buffer) {
            throw new Error("The ByteBuf implementation must support array() for bit usage.");
        }
        let buffer = this.buffers.buffer;
        let bytePos = this.bitPosition >> 3;
        let bitOffset = 8 - (this.bitPosition & 7);
        this.bitPosition += numBits;
        for (; numBits > bitOffset; bitOffset = 8) {
            buffer[bytePos] &= PacketBuilder.BIT_MASK[bitOffset];
            buffer[bytePos++] |= (value >> (numBits - bitOffset)) & PacketBuilder.BIT_MASK[bitOffset];
            numBits -= bitOffset;
        }
        if (numBits === bitOffset) {
            buffer[bytePos] &= PacketBuilder.BIT_MASK[bitOffset];
            buffer[bytePos] |= value & PacketBuilder.BIT_MASK[bitOffset];
        }
        else {
            buffer[bytePos] &= ~(PacketBuilder.BIT_MASK[numBits] << (bitOffset - numBits));
            buffer[bytePos] |= (value & PacketBuilder.BIT_MASK[numBits] << (bitOffset - numBits));
            buffer[bytePos] |= (value & PacketBuilder.BIT_MASK[numBits]) << (bitOffset - numBits);
        }
        return this;
    }
    initializeAccess(type) {
        switch (type) {
            case AccessType.BIT:
                this.bitPosition = this.buffers.length * 8;
                break;
            case AccessType.BYTE:
                this.buffers.writeUInt32BE((this.bitPosition + 7) / 8);
                break;
        }
        return this;
    }
    putBit(flag) {
        this.putBits(1, flag ? 1 : 0);
        return this;
    }
    puts(value, type) {
        switch (type) {
            case ValueType.A:
                value += 128;
                break;
            case ValueType.C:
                value = -value;
                break;
            case ValueType.S:
                value = 128 - value;
                break;
            case ValueType.STANDARD:
                break;
        }
        this.buffers.writeUInt8(value);
        return this;
    }
    putShort(value, type = ValueType.STANDARD, order = ByteOrder_1.ByteOrder.BIG) {
        switch (order) {
            case ByteOrder_1.ByteOrder.BIG:
                this.put(value >> 8);
                this.puts(value, type);
                break;
            case ByteOrder_1.ByteOrder.MIDDLE:
                throw new Error("Middle-endian short is impossible!");
            case ByteOrder_1.ByteOrder.INVERSE_MIDDLE:
                throw new Error("Inverse-middle-endian short is impossible!");
            case ByteOrder_1.ByteOrder.LITTLE:
                this.puts(value, type);
                this.put(value >> 8);
                break;
            case ByteOrder_1.ByteOrder.TRIPLE_INT:
                throw new Error("TRIPLE_INT short not added!");
        }
        return this;
    }
    writePutShorts(value) {
        return this.putShort(value, ValueType.STANDARD, ByteOrder_1.ByteOrder.BIG);
    }
    putShorts(value, order) {
        return this.putShort(value, ValueType.STANDARD, order);
    }
    putInts(value, type, order) {
        switch (order) {
            case ByteOrder_1.ByteOrder.BIG:
                this.put(value >> 24);
                this.put(value >> 16);
                this.put(value >> 8);
                this.puts(value, type);
                break;
            case ByteOrder_1.ByteOrder.MIDDLE:
                this.put(value >> 8);
                this.puts(value, type);
                this.put(value >> 24);
                this.put(value >> 16);
                break;
            case ByteOrder_1.ByteOrder.INVERSE_MIDDLE:
                this.put(value >> 16);
                this.put(value >> 24);
                this.puts(value, type);
                this.put(value >> 8);
                break;
            case ByteOrder_1.ByteOrder.LITTLE:
                this.puts(value, type);
                this.put(value >> 8);
                this.put(value >> 16);
                this.put(value >> 24);
                break;
            case ByteOrder_1.ByteOrder.TRIPLE_INT:
                this.put((value >> 16));
                this.put((value >> 8));
                this.put(value);
                break;
        }
        return this;
    }
    putInteger(value) {
        this.putInts(value, ValueType.STANDARD, ByteOrder_1.ByteOrder.BIG);
        return this;
    }
    putIntegers(value, type) {
        this.putInts(value, type, ByteOrder_1.ByteOrder.BIG);
        return this;
    }
    putsInt(value, order) {
        this.putInts(value, ValueType.STANDARD, order);
        return this;
    }
    putsLong(value, type = ValueType.STANDARD, order = ByteOrder_1.ByteOrder.BIG) {
        switch (order) {
            case ByteOrder_1.ByteOrder.BIG:
                this.put((value >> 56));
                this.put((value >> 48));
                this.put((value >> 40));
                this.put((value >> 32));
                this.put((value >> 24));
                this.put((value >> 16));
                this.put((value >> 8));
                this.puts(value, type);
                break;
            case ByteOrder_1.ByteOrder.MIDDLE:
                throw new Error("Middle-endian long is not implemented!");
            case ByteOrder_1.ByteOrder.INVERSE_MIDDLE:
                throw new Error("Inverse-middle-endian long is not implemented!");
            case ByteOrder_1.ByteOrder.TRIPLE_INT:
                throw new Error("triple-int long is not implemented!");
            case ByteOrder_1.ByteOrder.LITTLE:
                this.puts(value, type);
                this.put((value >> 8));
                this.put((value >> 16));
                this.put((value >> 24));
                this.put((value >> 32));
                this.put((value >> 40));
                this.put((value >> 48));
                this.put((value >> 56));
                break;
        }
        return this;
    }
    putLong(value, type = ValueType.STANDARD, order = ByteOrder_1.ByteOrder.BIG) {
        switch (order) {
            case ByteOrder_1.ByteOrder.BIG:
                this.put((value >> 56));
                this.put((value >> 48));
                this.put((value >> 40));
                this.put((value >> 32));
                this.put((value >> 24));
                this.put((value >> 16));
                this.put((value >> 8));
                this.puts((value), type);
                break;
            case ByteOrder_1.ByteOrder.MIDDLE:
                throw new Error("Middle-endian long " + "is not implemented!");
            case ByteOrder_1.ByteOrder.INVERSE_MIDDLE:
                throw new Error("Inverse-middle-endian long is not implemented!");
            case ByteOrder_1.ByteOrder.TRIPLE_INT:
                throw new Error("triple-int long is not implemented!");
            case ByteOrder_1.ByteOrder.LITTLE:
                this.puts((value), type);
                this.put((value >> 8));
                this.put((value >> 16));
                this.put((value >> 24));
                this.put((value >> 32));
                this.put((value >> 40));
                this.put((value >> 48));
                this.put((value >> 56));
                break;
        }
        return this;
    }
    putString(string) {
        if (string == null) {
            string = "unknown";
        }
        const encoder = new TextEncoder();
        const byteArray = encoder.encode(string);
        for (let value of byteArray) {
            this.put(value);
        }
        this.put(10);
        return this;
    }
    /**
     * Gets the packet's opcode.
     *
     * @return the packets opcode.
     */
    getOpcode() {
        return this.opcode;
    }
    /**
     * Gets the packet's size.
     *
     * @return the packets size.
     */
    getSize() {
        return this.buffers.length;
    }
    /**
     * Gets the backing byte buffer used to read and write data.
     *
     * @return the backing byte buffer.
     */
    buffer() {
        return this.buffer;
    }
    getBuffer() {
        return this._buffer;
    }
    /**
     * Creates the actual packet from this builder
     *
     * @return
     */
    toPacket() {
        return new Packet_1.Packet(this.opcode, this.type, this.buffers);
    }
    getType() {
        return this.type;
    }
}
exports.PacketBuilder = PacketBuilder;
PacketBuilder.BIT_MASK = [0, 0x1, 0x3, 0x7, 0xf, 0x1f, 0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff,
    0x7fff, 0xffff, 0x1ffff, 0x3ffff, 0x7ffff, 0xfffff, 0x1fffff, 0x3fffff, 0x7fffff, 0xffffff, 0x1ffffff, 0x3ffffff, 0x7ffffff,
    0xfffffff, 0x1fffffff, 0x3fffffff, 0x7fffffff, -1];
//# sourceMappingURL=PacketBuilder.js.map