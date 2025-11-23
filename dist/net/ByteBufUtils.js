"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ByteBufUtils = void 0;
const stringbuilder_1 = require("stringbuilder");
class ByteBufUtils {
    static getMedium(buffer) {
        const short1 = buffer[0] << 8;
        const short2 = buffer[1];
        return (short1 | short2);
    }
    static getStrings(buffer, terminator = "\0") {
        let str = "";
        let b;
        while ((b = buffer[0]) !== terminator.charCodeAt(0)) {
            str += String.fromCharCode(b);
            buffer = buffer.slice(1);
        }
        return str;
    }
    static getBytes(buffer, length) {
        const data = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            data[i] = buffer[i];
        }
        return data;
    }
    static getString(buffer, terminator) {
        const os = new Uint8Array(0);
        let i = 0;
        while (i < buffer.length) {
            const read = buffer[i] & 0xFF;
            i++;
            if (read === terminator.charCodeAt(0)) {
                break;
            }
            os.set([read], os.length);
        }
        return new TextDecoder().decode(os);
    }
    static getHost(channel) {
        const url = new URL(channel.url);
        const { hostname, port } = url;
        return `${hostname}:${port}`;
    }
    static readString(buf) {
        let temp;
        let builder = new stringbuilder_1.StringBuilder();
        for (let i = 0; i < buf.length && (temp = buf[i]) !== 10; i++) {
            builder.append(String.fromCharCode(temp));
        }
        return builder.toString();
    }
}
exports.ByteBufUtils = ByteBufUtils;
ByteBufUtils.J_STRING_TERMINATOR = '\n';
//TODO: Trocar ByteBuf e ByteBuffer pro Buffer
//# sourceMappingURL=ByteBufUtils.js.map