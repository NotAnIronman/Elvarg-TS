"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginEncoder = void 0;
const socket_io_1 = require("socket.io");
const LoginResponses_1 = require("../login/LoginResponses");
/**
Encodes login.
@author Swiffy
*/
const io = new socket_io_1.Server();
class LoginEncoder {
    encode(msg) {
        io.on("connection", (socket) => {
            socket.emit("message", msg.getResponse());
            if (msg.getResponse() == LoginResponses_1.LoginResponses.LOGIN_SUCCESSFUL) {
                // socket.emit('message', msg.getRights());
                socket.emit("message", "");
            }
        });
    }
}
exports.LoginEncoder = LoginEncoder;
//# sourceMappingURL=LoginEncoder.js.map