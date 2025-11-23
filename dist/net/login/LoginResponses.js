"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginResponses = void 0;
const Server_1 = require("../../Server");
// import { World } from '../../game/World';
// import { Player } from '../../game/entity/impl/player/Player';
const Misc_1 = require("../../util/Misc");
const DiscordUtil_1 = require("../../util/DiscordUtil");
const PlayerPunishment_1 = require("../../util/PlayerPunishment");
// import { GameConstants } from '../../game/GameConstants';
class LoginResponses {
    // public static async evaluate(player: Player, msg: LoginDetailsMessage) {
    static async evaluate(player, msg) {
        // if (World.getPlayers().isFull()) {
        //     return this.LOGIN_WORLD_FULL;
        // }
        if (Server_1.Server.isUpdating()) {
            return this.LOGIN_GAME_UPDATE;
        }
        if (player.getUsername().startsWith(" ") ||
            player.getUsername().endsWith(" ") ||
            !Misc_1.Misc.isValidName(player.getUsername())) {
            return this.INVALID_CREDENTIALS_COMBINATION;
        }
        // if (World.getPlayerByName(player.getUsername())) {
        //     return this.LOGIN_ACCOUNT_ONLINE;
        // }
        if (PlayerPunishment_1.PlayerPunishment.banned(player.getUsername())) {
            return this.LOGIN_DISABLED_ACCOUNT;
        }
        if (PlayerPunishment_1.PlayerPunishment.IPBanned(msg.getHost())) {
            return LoginResponses.LOGIN_DISABLED_IP;
        }
        // Attempt to load the character file..
        let playerLoadingResponse = await LoginResponses.getPlayerResult(player, msg);
        // New player?
        if (playerLoadingResponse === this.NEW_ACCOUNT) {
            player.setNewPlayer(true);
            player.setCreationDate(new Date());
            playerLoadingResponse = this.LOGIN_SUCCESSFUL;
        }
        return playerLoadingResponse;
    }
    // private static async getDiscordResult(player: Player, msg: LoginDetailsMessage): Promise<number> {
    static async getDiscordResult(player, msg) {
        try {
            let discordInfo;
            if (msg.getUsername() === DiscordUtil_1.DiscordUtil.DiscordConstants.USERNAME_AUTHZ_CODE) {
                discordInfo = await DiscordUtil_1.DiscordUtil.getDiscordInfoWithCode(msg.getPassword());
            }
            else if (msg.getUsername() === DiscordUtil_1.DiscordUtil.DiscordConstants.USERNAME_CACHED_TOKEN) {
                if (!DiscordUtil_1.DiscordUtil.isTokenValid(msg.getPassword()))
                    return LoginResponses.LOGIN_INVALID_CREDENTIALS;
                discordInfo = await DiscordUtil_1.DiscordUtil.getDiscordInfoWithToken(msg.getPassword());
            }
            else {
                return LoginResponses.LOGIN_INVALID_CREDENTIALS;
            }
            player.setUsername(discordInfo.username);
            // let playerSave = GameConstants.PLAYER_PERSISTENCE.load(player.getUsername());
            // if (!playerSave) {
            //     player.setDiscordLogin(true);
            //     player.setCachedDiscordAccessToken(discordInfo.token);
            //     player.setPasswordHashWithSalt(discordInfo.password);
            //     return LoginResponses.NEW_ACCOUNT;
            // }
            // playerSave.applyToPlayer(player);
            return LoginResponses.LOGIN_SUCCESSFUL;
        }
        catch (ex) {
            // Adicione um tratamento de erro adequado aqui
        }
        return LoginResponses.LOGIN_INVALID_CREDENTIALS;
    }
    // private static async getPlayerResult(player: Player, msg: LoginDetailsMessage) {
    static async getPlayerResult(player, msg) {
        let plainPassword = msg.getPassword();
        if (msg.getIsDiscord()) {
            return LoginResponses.getDiscordResult(player, msg);
        }
        // let playerSave = GameConstants.PLAYER_PERSISTENCE.load(player.getUsername());
        // if (!playerSave) {
        //     player.setPasswordHashWithSalt(await GameConstants.PLAYER_PERSISTENCE.encryptPassword(plainPassword));
        //     return LoginResponses.NEW_ACCOUNT;
        // }
        // if (msg.getIsDiscord() !== playerSave.isDiscordLoginReturn()) {
        //     // User attempting Discord login on a non-Discord account
        //     return LoginResponses.LOGIN_BAD_SESSION_ID;
        // }
        // if (!GameConstants.PLAYER_PERSISTENCE.checkPassword(plainPassword, playerSave)) {
        //     return LoginResponses.LOGIN_INVALID_CREDENTIALS;
        // }
        // playerSave.applyToPlayer(player);
        return LoginResponses.LOGIN_SUCCESSFUL;
    }
}
exports.LoginResponses = LoginResponses;
LoginResponses.LOGIN_SUCCESSFUL = 2;
LoginResponses.LOGIN_INVALID_CREDENTIALS = 3;
LoginResponses.LOGIN_DISABLED_ACCOUNT = 4;
LoginResponses.LOGIN_DISABLED_COMPUTER = 22;
LoginResponses.LOGIN_DISABLED_IP = 27;
LoginResponses.LOGIN_ACCOUNT_ONLINE = 5;
LoginResponses.LOGIN_GAME_UPDATE = 6;
LoginResponses.LOGIN_WORLD_FULL = 7;
LoginResponses.LOGIN_CONNECTION_LIMIT = 9;
LoginResponses.LOGIN_BAD_SESSION_ID = 10;
LoginResponses.LOGIN_REJECT_SESSION = 11;
LoginResponses.INVALID_CREDENTIALS_COMBINATION = 28;
LoginResponses.OLD_CLIENT_VERSION = 30;
LoginResponses.NEW_ACCOUNT = -1;
//# sourceMappingURL=LoginResponses.js.map