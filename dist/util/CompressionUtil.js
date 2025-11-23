"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompressionUtil = void 0;
const gzip_js_1 = require("gzip-js");
const Bzip2 = require("bzip2");
class CompressionUtil {
    constructor() {
        throw new Error("static-utility classes may not be instantiated.");
    }
    static gunzip(data) {
        return Uint8Array.from((0, gzip_js_1.ungzip)(data));
    }
    static unbzip2Headerless(data, offset, length) {
        let bzip2 = new Uint8Array(length + 2);
        bzip2[0] = 104; // ASCII value for 'h'
        bzip2[1] = 49; // ASCII value for '1'
        bzip2.set(new Uint8Array(data.buffer, offset, length), 2);
        const decompressed = CompressionUtil.unbzip2(bzip2);
        if (decompressed === null) {
            return null;
        }
        return decompressed;
    }
    static unbzip2(data) {
        const decompressed = Bzip2.decompressFile(String.fromCharCode.apply(null, data));
        return decompressed !== null ? new Uint8Array(decompressed) : null;
    }
}
exports.CompressionUtil = CompressionUtil;
//# sourceMappingURL=CompressionUtil.js.map