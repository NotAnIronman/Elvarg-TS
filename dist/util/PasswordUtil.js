"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordUtil = void 0;
const bcrypt_1 = require("bcrypt");
class PasswordUtil {
    static async generatePasswordHashWithSalt(password) {
        const saltRounds = this.pbkdf2;
        const salt = await bcrypt_1.default.genSalt(saltRounds);
        const hash = await bcrypt_1.default.hash(password, salt);
        return salt + ":" + hash;
    }
    static async passwordsMatch(plainTextPassword, passwordHashWithSalt) {
        const parts = passwordHashWithSalt.split(":");
        const salt = parts[0];
        const hash = parts[1];
        return await bcrypt_1.default.compare(plainTextPassword, hash);
    }
    static toBase64(s) {
        return Buffer.from(s).toString('base64');
    }
    static fromBase64(s) {
        return Buffer.from(s, 'base64').toString();
    }
}
exports.PasswordUtil = PasswordUtil;
PasswordUtil.pbkdf2 = 10;
//# sourceMappingURL=PasswordUtil.js.map