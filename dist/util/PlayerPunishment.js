"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerPunishment = void 0;
const Misc_1 = require("./Misc");
const fs_extra_1 = require("fs-extra");
class PlayerPunishment {
    static init() {
        // In case we're reloading bans, reset lists first.
        this.IPSBanned = [];
        this.IPSMuted = [];
        this.AccountsBanned = [];
        this.AccountsMuted = [];
        this.initializeList(this.BAN_DIRECTORY, "IPBans", this.IPSBanned);
        this.initializeList(this.BAN_DIRECTORY, "Bans", this.AccountsBanned);
        this.initializeList(this.MUTE_DIRECTORY, "IPMutes", this.IPSMuted);
        this.initializeList(this.MUTE_DIRECTORY, "Mutes", this.AccountsMuted);
    }
    static initializeList(directory, file, list) {
        try {
            const data = fs_extra_1.fs.readFileSync(`${directory}${file}.txt`, 'utf8');
            list.push(...data.split('\n'));
        }
        catch (e) {
            console.error(e);
        }
    }
    static addBannedIP(IP) {
        if (!this.IPSBanned.includes(IP)) {
            this.addToFile(`${this.BAN_DIRECTORY}IPBans.txt`, IP);
        }
        this.IPSBanned.push(IP);
    }
    static addMutedIP(IP) {
        if (!this.IPSMuted.includes(IP)) {
            this.addToFile(`${this.MUTE_DIRECTORY}IPMutes.txt`, IP);
        }
        this.IPSMuted.push(IP);
    }
    static ban(p) {
        p = Misc_1.Misc.formatPlayerName(p.toLowerCase());
        if (!this.AccountsBanned.includes(p)) {
            this.addToFile(`${this.BAN_DIRECTORY}Bans.txt`, p);
        }
        this.AccountsBanned.push(p);
    }
    static mute(p) {
        p = Misc_1.Misc.formatPlayerName(p.toLowerCase());
        if (!this.AccountsMuted.includes(p)) {
            this.addToFile(`${this.MUTE_DIRECTORY}Mutes.txt`, p);
        }
        this.AccountsMuted.push(p);
    }
    static banned(player) {
        player = Misc_1.Misc.formatPlayerName(player.toLowerCase());
        return this.AccountsBanned.includes(player);
    }
    static muted(player) {
        player = Misc_1.Misc.formatPlayerName(player.toLowerCase());
        return this.AccountsMuted.includes(player);
    }
    static IPBanned(IP) {
        return this.IPSBanned.includes(IP);
    }
    static IPMuted(IP) {
        return this.IPSMuted.includes(IP);
    }
    static unban(player) {
        player = Misc_1.Misc.formatPlayerName(player.toLowerCase());
        this.deleteFromFile(`${this.BAN_DIRECTORY}Bans.txt`, player);
        this.AccountsBanned = this.AccountsBanned.filter(p => p !== player);
    }
    static unmute(player) {
        player = Misc_1.Misc.formatPlayerName(player.toLowerCase());
        this.deleteFromFile(`${this.MUTE_DIRECTORY}Mutes.txt`, player);
        this.AccountsMuted = this.AccountsMuted.filter(p => p !== player);
    }
    static reloadIPBans() {
        this.IPSBanned = [];
        this.initializeList(this.BAN_DIRECTORY, "IPBans", this.IPSBanned);
    }
    static reloadIPMutes() {
        this.IPSMuted = [];
        this.initializeList(this.MUTE_DIRECTORY, "IPMutes", this.IPSMuted);
    }
    static deleteFromFile(file, player) {
        try {
            let data = fs_extra_1.fs.readFileSync(file, 'utf8');
            data = data.split('\n').filter(p => p !== player).join('\n');
            fs_extra_1.fs.writeFileSync(file, data);
        }
        catch (e) {
            console.error(e);
        }
    }
    static addToFile(file, player) {
        try {
            fs_extra_1.fs.appendFileSync(file, player + '\n');
        }
        catch (e) {
            console.error(e);
        }
    }
}
exports.PlayerPunishment = PlayerPunishment;
PlayerPunishment.BAN_DIRECTORY = "./data/saves/";
PlayerPunishment.MUTE_DIRECTORY = "./data/saves/";
PlayerPunishment.IPSBanned = [];
PlayerPunishment.IPSMuted = [];
PlayerPunishment.AccountsBanned = [];
PlayerPunishment.AccountsMuted = [];
//# sourceMappingURL=PlayerPunishment.js.map