"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordInfo = exports.DiscordUtil = void 0;
const uuid_1 = require("uuid");
class DiscordUtil {
    static async getAccessToken(code) {
        let formBody = new FormData();
        formBody.append("client_id", DiscordUtil.DiscordConstants.CLIENT_ID);
        formBody.append("client_secret", DiscordUtil.DiscordConstants.CLIENT_SECRET);
        formBody.append("grant_type", "authorization_code");
        formBody.append("code", code);
        formBody.append("redirect_uri", "http://localhost:8080");
        let response = await fetch(DiscordUtil.DiscordConstants.TOKEN_ENDPOINT, {
            method: 'POST',
            body: formBody
        });
        let resp = await response.json();
        return resp;
    }
    static async getUserInfo(token) {
        let response = await fetch(DiscordUtil.DiscordConstants.IDENTITY_ENDPOINT, {
            headers: {
                Authorization: "Bearer " + token
            }
        });
        let resp = await response.json();
        return resp;
    }
    static async isTokenValid(token) {
        let response = await fetch(DiscordUtil.DiscordConstants.OAUTH_IDENTITY_ENDPOINT, {
            headers: {
                Authorization: "Bearer " + token
            }
        });
        return response.ok;
    }
    static async getDiscordInfoWithCode(code) {
        let token = await DiscordUtil.getAccessToken(code);
        return DiscordUtil.getDiscordInfoWithToken(token.access_token);
    }
    static async getDiscordInfoWithToken(token) {
        let userInfo = await DiscordUtil.getUserInfo(token);
        let ret = new DiscordInfo();
        ret.username = userInfo.username + "_" + userInfo.discriminator;
        ret.password = (0, uuid_1.v4)();
        ret.token = token;
        return ret;
    }
}
exports.DiscordUtil = DiscordUtil;
DiscordUtil.DiscordConstants = {
    CLIENT_ID: "1010001099815669811",
    CLIENT_SECRET: "",
    TOKEN_ENDPOINT: "https://discord.com/api/oauth2/token",
    OAUTH_IDENTITY_ENDPOINT: "https://discord.com/api/oauth2/@me",
    IDENTITY_ENDPOINT: "https://discord.com/api/v10/users/@me",
    USERNAME_AUTHZ_CODE: "authz_code",
    USERNAME_CACHED_TOKEN: "cached_token"
};
class DiscordInfo {
}
exports.DiscordInfo = DiscordInfo;
//# sourceMappingURL=DiscordUtil.js.map