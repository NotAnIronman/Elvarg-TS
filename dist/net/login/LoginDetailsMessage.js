"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginDetailsMessage = void 0;
class LoginDetailsMessage {
    constructor(username, password, host, encryptor, decryptor) {
        this.isDiscord = false;
        this.username = username;
        this.password = password;
        this.host = host;
        this.encryptor = encryptor;
        this.decryptor = decryptor;
    }
    getUsername() {
        return this.username;
    }
    getPassword() {
        return this.password;
    }
    getHost() {
        return this.host;
    }
    getEncryptor() {
        return this.encryptor;
    }
    getDecryptor() {
        return this.decryptor;
    }
    getIsDiscord() {
        return this.isDiscord;
    }
    setDiscord(discord) {
        this.isDiscord = discord;
    }
}
exports.LoginDetailsMessage = LoginDetailsMessage;
//# sourceMappingURL=LoginDetailsMessage.js.map