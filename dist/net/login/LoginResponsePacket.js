"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginResponsePacket = void 0;
// import { PlayerRights } from '../../game/model/rights/PlayerRights';
class LoginResponsePacket {
    // private readonly rights: PlayerRights;
    constructor(response, rights) {
        this.response = response;
        if (!rights) {
            // this.rights = PlayerRights.NONE;
        }
        else {
            // this.rights = rights;
        }
    }
    getResponse() {
        return this.response;
    }
}
exports.LoginResponsePacket = LoginResponsePacket;
//# sourceMappingURL=LoginResponsePacket.js.map