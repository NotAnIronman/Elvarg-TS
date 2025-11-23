"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileUtil = void 0;
const fs_extra_1 = require("fs-extra");
const zlib = require("zlib");
class FileUtil {
    static readFile(name) {
        try {
            const buffer = fs_extra_1.fs.readFileSync(name);
            return buffer;
        }
        catch (error) {
            console.error(error);
            return null;
        }
    }
    static async getGZBuffer(file) {
        const stats = await fs_extra_1.fs.stat(file);
        if (!stats.isFile()) {
            return null;
        }
        const buffer = fs_extra_1.fs.readFile(file);
        const gzipInputBuffer = Buffer.alloc(999999);
        let bufferlength = 0;
        const gzip = zlib.createGunzip();
        gzip.on('data', (data) => {
            if (bufferlength + data.length > gzipInputBuffer.length) {
                console.error('Error inflating data.\nGZIP buffer overflow.');
                gzip.end();
                return;
            }
            data.copy(gzipInputBuffer, bufferlength);
            bufferlength += data.length;
        });
        gzip.on('end', () => {
            const inflated = gzipInputBuffer.slice(0, bufferlength);
            if (inflated.length < 10) {
                return null;
            }
            return inflated;
        });
        gzip.write(buffer);
        gzip.end();
    }
    static async getDecompressedBuffer(file) {
        try {
            const buffer = await FileUtil.getGZBuffer(file);
            const decompressed = zlib.gunzipSync(buffer);
            return decompressed;
        }
        catch (error) {
            console.error(error);
            return null;
        }
    }
}
exports.FileUtil = FileUtil;
//# sourceMappingURL=FileUtil.js.map