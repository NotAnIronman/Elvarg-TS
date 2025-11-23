"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Buffer = void 0;
const BigInteger = require('big-integer');
class Buffer {
    constructor(payload) {
        this.payload = payload;
        this.currentPosition = 0;
    }
    static create() {
        let buffer = new Buffer([0]);
        buffer.currentPosition = 0;
        buffer.payload = new Array(5000);
        return buffer;
    }
    readUTriByte(i) {
        this.currentPosition += 3;
        return (0xff & this.payload[this.currentPosition - 3] << 16)
            + (0xff & this.payload[this.currentPosition - 2] << 8)
            + (0xff & this.payload[this.currentPosition - 1]);
    }
    readUShort() {
        this.currentPosition += 2;
        return ((this.payload[this.currentPosition - 2] & 0xff) << 8)
            + (this.payload[this.currentPosition - 1] & 0xff);
    }
    readUShortA() {
        this.currentPosition += 2;
        return ((this.payload[this.currentPosition - 2] & 0xff) << 8)
            + (this.payload[this.currentPosition - 1] - 128 & 0xff);
    }
    readSignedByte() {
        return this.payload[this.currentPosition++];
    }
    readUSmart() {
        let value = this.payload[this.currentPosition] & 0xff;
        if (value < 128)
            return this.readSignedByte();
        else
            return this.readUShort() - 32768;
    }
    readUSmart2() {
        let baseVal = 0;
        let lastVal = 0;
        while ((lastVal = this.readUSmart()) == 32767) {
            baseVal += 32767;
        }
        return baseVal + lastVal;
    }
    readNewString() {
        let i = this.currentPosition;
        while (this.payload[this.currentPosition++] != 0)
            ;
        return String.fromCharCode(...this.payload.slice(i, this.currentPosition - 1));
    }
    writeOpcode(opcode) {
        this.payload[this.currentPosition++] = (opcode + this.encryption.nextInt());
    }
    writeByte(value) {
        this.payload[this.currentPosition++] = (value);
    }
    writeShort(value) {
        this.payload[this.currentPosition++] = (value >> 8);
        this.payload[this.currentPosition++] = (value);
    }
    writeTriByte(value) {
        this.payload[this.currentPosition++] = (value >> 16);
        this.payload[this.currentPosition++] = (value >> 8);
        this.payload[this.currentPosition++] = (value);
    }
    writeInt(value) {
        this.payload[this.currentPosition++] = (value >> 24);
        this.payload[this.currentPosition++] = (value >> 16);
        this.payload[this.currentPosition++] = (value >> 8);
        this.payload[this.currentPosition++] = value;
    }
    writeLEInt(value) {
        this.payload[this.currentPosition++] = value;
        this.payload[this.currentPosition++] = (value >> 8);
        this.payload[this.currentPosition++] = (value >> 16);
        this.payload[this.currentPosition++] = (value >> 24);
    }
    writeLong(value) {
        try {
            this.payload[this.currentPosition++] = (value >> 56);
            this.payload[this.currentPosition++] = (value >> 48);
            this.payload[this.currentPosition++] = (value >> 40);
            this.payload[this.currentPosition++] = (value >> 32);
            this.payload[this.currentPosition++] = (value >> 24);
            this.payload[this.currentPosition++] = (value >> 16);
            this.payload[this.currentPosition++] = (value >> 8);
            this.payload[this.currentPosition++] = (value);
        }
        catch (runtimeexception) {
            console.error("14395, " + 5 + ", " + value + ", " + runtimeexception.toString());
            throw new Error();
        }
    }
    writeString(text) {
        this.payload.slice(text.length).forEach((e, i) => this.payload[this.currentPosition + i] = e);
        this.currentPosition += text.length;
        this.payload[this.currentPosition++] = 10;
    }
    readShort2() {
        this.currentPosition += 2;
        let i = ((this.payload[this.currentPosition - 2] & 0xff) << 8) + (this.payload[this.currentPosition - 1] & 0xff);
        if (i > 32767)
            i -= 65537;
        return i;
    }
    readShort() {
        this.currentPosition += 2;
        let value = ((this.payload[this.currentPosition - 2] & 0xff) << 8)
            + (this.payload[this.currentPosition - 1] & 0xff);
        if (value > 32767) {
            value -= 0x10000;
        }
        return value;
    }
    readTriByte() {
        this.currentPosition += 3;
        return ((this.payload[this.currentPosition - 3] & 0xff) << 16)
            + ((this.payload[this.currentPosition - 2] & 0xff) << 8)
            + (this.payload[this.currentPosition - 1] & 0xff);
    }
    readInt() {
        this.currentPosition += 4;
        return ((this.payload[this.currentPosition - 4] & 0xff) << 24)
            + ((this.payload[this.currentPosition - 3] & 0xff) << 16)
            + ((this.payload[this.currentPosition - 2] & 0xff) << 8)
            + (this.payload[this.currentPosition - 1] & 0xff);
    }
    readLong() {
        let msi = (this.readInt() & 0xffffffff);
        let lsi = (this.readInt() & 0xffffffff);
        return (msi << 32) + lsi;
    }
    readString() {
        let index = this.currentPosition;
        while (this.payload[this.currentPosition++] != 10)
            ;
        return String.fromCharCode(...this.payload.slice(index, this.currentPosition - 1));
    }
    readBytes() {
        let index = this.currentPosition;
        while (this.payload[this.currentPosition++] != 10)
            ;
        let data = new Uint8Array(this.currentPosition - index - 1);
        data.set(this.payload.slice(index, this.currentPosition - 1));
        return data;
    }
    readByte(offset, length, data) {
        for (let index = length; index < length + offset; index++)
            data[index] = this.payload[this.currentPosition++];
    }
    initBitAccess() {
        this.bitPosition = this.currentPosition * 8;
    }
    readBits(amount) {
        let byteOffset = this.bitPosition >> 3;
        let bitOffset = 8 - (this.bitPosition & 7);
        let value = 0;
        this.bitPosition += amount;
        for (; amount > bitOffset; bitOffset = 8) {
            value += (this.payload[byteOffset++] & Buffer.BIT_MASKS[bitOffset]) << amount
                - bitOffset;
            amount -= bitOffset;
        }
        if (amount == bitOffset)
            value += this.payload[byteOffset] & Buffer.BIT_MASKS[bitOffset];
        else
            value += this.payload[byteOffset] >> bitOffset - amount
                & Buffer.BIT_MASKS[amount];
        return value;
    }
    disableBitAccess() {
        this.currentPosition = (this.bitPosition + 7) / 8;
    }
    readSmart() {
        let value = this.payload[this.currentPosition] & 0xff;
        if (value < 128)
            return this.readSignedByte() - 64;
        else
            return this.readUShort() - 49152;
    }
    getSmart() {
        try {
            // checks current without modifying position
            if (this.currentPosition >= this.payload.length) {
                return this.payload[this.payload.length - 1] & 0xFF;
            }
            let value = this.payload[this.currentPosition] & 0xFF;
            if (value < 128) {
                return this.readSignedByte();
            }
            else {
                return this.readUShort() - 32768;
            }
        }
        catch (e) {
            console.log(e);
            return this.readUShort() - 32768;
        }
    }
    encodeRSA(exponent, modulus) {
        let length = this.currentPosition;
        this.currentPosition = 0;
        let buffer = new Uint8Array(length);
        this.readBytes();
        let rsa = buffer;
        //if (Configuration.ENABLE_RSA) {
        rsa = new BigInteger(buffer).modPow(exponent, modulus)
            .toByteArray();
        //}
        this.currentPosition = 0;
        this.writeByte(rsa.length);
        this.writeByteS(rsa.length);
    }
    writeNegatedByte(value) {
        this.payload[this.currentPosition++] = (value * -1);
    }
    writeByteS(value) {
        this.payload[this.currentPosition++] = (128 - value);
    }
    readUByteA() {
        return this.payload[this.currentPosition++] - 128 & 0xff;
    }
    readNegUByte() {
        return -this.payload[this.currentPosition++] & 0xff;
    }
    readUByteS() {
        return 128 - this.payload[this.currentPosition++] & 0xff;
    }
    readNegByte() {
        return -this.payload[this.currentPosition++];
    }
    readByteS() {
        return 128 - this.payload[this.currentPosition++];
    }
    writeLEShort(value) {
        this.payload[this.currentPosition++] = value;
        this.payload[this.currentPosition++] = (value >> 8);
    }
    writeShortA(value) {
        this.payload[this.currentPosition++] = (value >> 8);
        this.payload[this.currentPosition++] = (value + 128);
    }
    writeLEShortA(value) {
        this.payload[this.currentPosition++] = (value + 128);
        this.payload[this.currentPosition++] = (value >> 8);
    }
    readLEUShort() {
        this.currentPosition += 2;
        return ((this.payload[this.currentPosition - 1] & 0xff) << 8)
            + (this.payload[this.currentPosition - 2] & 0xff);
    }
    readLEUShortA() {
        this.currentPosition += 2;
        return ((this.payload[this.currentPosition - 1] & 0xff) << 8)
            + (this.payload[this.currentPosition - 2] - 128 & 0xff);
    }
    readLEShort() {
        this.currentPosition += 2;
        let value = ((this.payload[this.currentPosition - 1] & 0xff) << 8)
            + (this.payload[this.currentPosition - 2] & 0xff);
        if (value > 32767) {
            value -= 0x10000;
        }
        return value;
    }
    readLEShortA() {
        this.currentPosition += 2;
        let value = ((this.payload[this.currentPosition - 1] & 0xff) << 8)
            + (this.payload[this.currentPosition - 2] - 128 & 0xff);
        if (value > 32767)
            value -= 0x10000;
        return value;
    }
    getIntLittleEndian() {
        this.currentPosition += 4;
        return ((this.payload[this.currentPosition - 4] & 0xFF) << 24) + ((this.payload[this.currentPosition - 3] & 0xFF) << 16) + ((this.payload[this.currentPosition - 2] & 0xFF) << 8) + (this.payload[this.currentPosition - 1] & 0xFF);
    }
    readMEInt() {
        this.currentPosition += 4;
        return ((this.payload[this.currentPosition - 2] & 0xff) << 24)
            + ((this.payload[this.currentPosition - 1] & 0xff) << 16)
            + ((this.payload[this.currentPosition - 4] & 0xff) << 8)
            + (this.payload[this.currentPosition - 3] & 0xff);
    }
    readIMEInt() {
        this.currentPosition += 4;
        return ((this.payload[this.currentPosition - 3] & 0xff) << 24)
            + ((this.payload[this.currentPosition - 4] & 0xff) << 16)
            + ((this.payload[this.currentPosition - 1] & 0xff) << 8)
            + (this.payload[this.currentPosition - 2] & 0xff);
    }
    writeReverseDataA(data, length, offset) {
        for (let index = (length + offset) - 1; index >= length; index--) {
            this.payload[this.currentPosition++] = (data[index] + 128);
        }
    }
    readReverseData(data, offset, length) {
        for (let index = (length + offset) - 1; index >= length; index--) {
            data[index] = this.payload[this.currentPosition++];
        }
    }
}
exports.Buffer = Buffer;
Buffer.BIT_MASKS = [0, 1, 3, 7, 15, 31, 63, 127, 255,
    511, 1023, 2047, 4095, 8191, 16383, 32767, 65535, 0x1ffff, 0x3ffff,
    0x7ffff, 0xfffff, 0x1fffff, 0x3fffff, 0x7fffff, 0xffffff,
    0x1ffffff, 0x3ffffff, 0x7ffffff, 0xfffffff, 0x1fffffff, 0x3fffffff,
    0x7fffffff, -1];
//# sourceMappingURL=Buffer.js.map