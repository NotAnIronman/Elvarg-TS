"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkBuilder = void 0;
const crypto_1 = require("crypto");
const ws_1 = require("ws");
const Misc_1 = require("../util/Misc");
const NetworkConstants_1 = require("./NetworkConstants");
const LoginResponses_1 = require("./login/LoginResponses");
const IsaacRandom_1 = require("./security/IsaacRandom");
const PacketType_1 = require("./packet/PacketType");
const Player_1 = require("../game/entity/impl/player/Player");
const Location_1 = require("../game/model/Location");
const PacketConstants_1 = require("./packet/PacketConstants");
const Packet_1 = require("./packet/Packet");
const PlayerSession_1 = require("./PlayerSession");
const Appearance_1 = require("../game/model/Appearance");
const PacketGuide_1 = require("./PacketGuide");
const NOPPacketListener_1 = require("./packet/impl/NOPPacketListener");
// Copied from Java PacketDecoder.PACKET_SIZES (index = opcode).
const PACKET_SIZES = [
    0, 0, 6, 1, -1, -1, 2, 4, 4, 4, // 0
    4, 13, -1, -1, 8, 0, 6, 2, 2, 0, // 10
    0, 2, 0, 6, 0, 12, 0, 0, 0, 0, // 20
    9, 0, 0, 0, 0, 8, 4, 0, 0, 2, // 30
    2, 6, 0, 8, 0, -1, 0, 0, 0, 1, // 40
    0, 0, 0, 12, 0, 0, 0, 8, 0, 0, // 50
    -1, 8, 0, 0, 0, 0, 0, 0, 0, 0, // 60
    6, 0, 2, 2, 8, 6, 0, -1, 0, 6, // 70
    -1, 0, 0, 0, 0, 1, 4, 6, 0, 0, // 80
    0, 0, 0, 0, 0, 3, 0, 0, -1, 0, // 90
    0, 13, 0, -1, -1, 0, 0, 0, 0, 0, // 100
    0, 0, 0, 0, 0, 0, 0, 8, 0, 0, // 110
    1, 0, 6, 0, 0, 0, -1, 0, 2, 8, // 120
    0, 4, 6, 8, 0, 8, 0, 0, 6, 2, // 130
    0, 0, 0, 0, 0, 8, 0, 0, 0, 0, // 140
    0, 0, 1, 2, 0, 2, 6, 0, 0, 0, // 150
    0, 0, 0, 0, 5, -1, 5, 0, 0, 0, // 160
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 170
    0, 8, 0, 2, 4, 4, 5, 6, 8, 1, // 180
    0, 0, 12, 0, 0, 0, 0, 0, 0, 0, // 190
    2, 0, 0, 0, 2, 0, 0, 0, 4, 0, // 200
    4, 0, 0, 0, 9, 8, 8, 0, 10, 0, // 210
    0, 0, 3, 2, 0, 0, -1, 0, 6, 1, // 220
    1, 0, 0, 0, 6, 6, 6, 8, 1, 1, // 230
    0, 4, 0, 0, 0, 0, -1, 0, -1, 4, // 240
    0, 0, 6, 6, 0, 0 // 250
];
// Match Java server defaults (see Appearance#set)
const DEFAULT_LOOKS = [3, 14, 18, 26, 34, 38, 42]; // head, beard, chest, arms, hands, legs, feet
const DEFAULT_COLORS = [2, 14, 5, 4, 0]; // hair, torso, legs, feet, skin
const ALLOWED_COLORS = [
    [0, 11],
    [0, 15],
    [0, 15],
    [0, 5],
    [0, 7],
];
const FEMALE_LOOK_RANGES = [
    [45, 54], // head
    [-1, -1], // jaw
    [56, 60], // torso
    [61, 65], // arms
    [67, 68], // hands
    [70, 77], // legs
    [79, 80], // feet
];
const MALE_LOOK_RANGES = [
    [0, 8], // head
    [10, 17], // jaw
    [18, 25], // torso
    [26, 31], // arms
    [33, 34], // hands
    [36, 40], // legs
    [42, 43], // feet
];
const NPC_BITS = 14;
class LoginSession {
    constructor(socket) {
        this.socket = socket;
        this.stage = "HANDSHAKE";
        this.serverSeeds = null;
        this.encryptor = null;
        this.decryptor = null;
        this.player = null;
        this.gamePlayer = null;
        this.recvBuffer = Buffer.alloc(0);
        this.log("connection_open", {
            remote: this.socket?._socket?.remoteAddress ?? "unknown",
        });
        socket.on("message", (data) => {
            try {
                this.onMessage(data);
            }
            catch (err) {
                this.log("message_handler_error", {
                    err: err?.message ?? String(err),
                    stack: err?.stack,
                });
            }
        });
        socket.on("error", (err) => {
            this.log("socket_error", { err: err?.message ?? err });
            this.socket.close();
        });
        socket.on("close", (code, reason) => {
            const stack = new Error().stack;
            this.log("connection_closed", {
                code,
                reason: reason instanceof Buffer ? reason.toString("utf8") : reason,
                stage: this.stage,
                stack,
            });
        });
    }
    onMessage(rawData) {
        const buffer = Buffer.isBuffer(rawData)
            ? rawData
            : Buffer.from(rawData);
        if (this.stage === "HANDSHAKE") {
            this.handleHandshake(buffer);
            return;
        }
        if (this.stage === "LOGIN") {
            this.handleLogin(buffer);
            return;
        }
        if (this.stage === "ESTABLISHED") {
            this.handleGamePacket(buffer);
        }
    }
    handleHandshake(buffer) {
        this.log("handshake_received", { length: buffer.length, opcode: buffer[0] });
        if (buffer.length < 1 ||
            buffer.readUInt8(0) !== NetworkConstants_1.NetworkConstants.LOGIN_REQUEST_OPCODE) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_BAD_SESSION_ID, true, "bad_login_request_opcode");
            return;
        }
        this.serverSeeds = [(0, crypto_1.randomInt)(0, 0x7fffffff), (0, crypto_1.randomInt)(0, 0x7fffffff)];
        const response = Buffer.alloc(9);
        response.writeUInt8(0, 0);
        response.writeInt32BE(this.serverSeeds[0], 1);
        response.writeInt32BE(this.serverSeeds[1], 5);
        this.socket.send(response);
        this.stage = "LOGIN";
        this.log("handshake_sent", { seeds: this.serverSeeds });
    }
    handleLogin(buffer) {
        if (!this.serverSeeds) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_BAD_SESSION_ID, true, "missing_server_seeds");
            return;
        }
        let offset = 0;
        if (buffer.length < 5) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "login_buffer_too_small");
            return;
        }
        const connectionType = buffer.readUInt8(offset++);
        if (connectionType !== NetworkConstants_1.NetworkConstants.NEW_CONNECTION_OPCODE &&
            connectionType !== NetworkConstants_1.NetworkConstants.RECONNECTION_OPCODE) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_BAD_SESSION_ID, true, "bad_connection_type");
            return;
        }
        const encryptedLoginBlockSize = buffer.readUInt8(offset++);
        if (encryptedLoginBlockSize !== buffer.length - 2) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "encrypted_block_size_mismatch");
            return;
        }
        const magicId = buffer.readUInt8(offset++);
        if (magicId !== 0xff) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "bad_magic");
            return;
        }
        const memoryFlag = buffer.readUInt8(offset++);
        if (memoryFlag !== 0 && memoryFlag !== 1) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "bad_memory_flag");
            return;
        }
        const rsaBlockLength = buffer.readUInt8(offset++);
        if (rsaBlockLength > buffer.length - offset) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "rsa_length_too_big");
            return;
        }
        const rsaBytes = buffer.subarray(offset, offset + rsaBlockLength);
        if (rsaBytes.length !== rsaBlockLength) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "rsa_length_mismatch");
            return;
        }
        this.log("rsa_payload", { rsaLength: rsaBlockLength, rsaBytesHex: rsaBytes.toString("hex") });
        const decrypted = this.decryptRsa(rsaBytes);
        if (!decrypted) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "rsa_decrypt_failed");
            return;
        }
        this.log("rsa_decrypted_raw", {
            decryptedHex: decrypted.toString("hex"),
            decryptedLength: decrypted.length,
        });
        const parsed = this.parseLoginPayload(decrypted) ?? this.parseLoginPayload(rsaBytes, "raw");
        if (!parsed) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "login_parse_failed");
            return;
        }
        const { securityId, seed0, seed1, seed2, seed3, usernameRaw, password } = parsed;
        this.log("rsa_decrypted", {
            decryptedHex: decrypted.toString("hex"),
            securityId,
            decryptedLength: decrypted.length,
            parsedWith: parsed.parsedFrom,
            seed0,
            seed1,
            seed2,
            seed3,
        });
        if (securityId !== 10 && securityId !== 11) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_REJECT_SESSION, true, "bad_security_id");
            return;
        }
        if (seed2 !== this.serverSeeds[0] ||
            seed3 !== this.serverSeeds[1]) {
            this.sendResponse(LoginResponses_1.LoginResponses.LOGIN_BAD_SESSION_ID, true, "server_seed_mismatch");
            return;
        }
        const seed = [seed0, seed1, seed2, seed3];
        this.decryptor = new IsaacRandom_1.IsaacRandom(seed.slice());
        const encSeed = seed.map((s) => s + 50);
        this.encryptor = new IsaacRandom_1.IsaacRandom(encSeed);
        const username = Misc_1.Misc.formatText(usernameRaw.toLowerCase());
        if (username.length < 3 ||
            username.length > 30 ||
            password.length < 3 ||
            password.length > 30 ||
            !Misc_1.Misc.isValidName(username)) {
            this.sendResponse(LoginResponses_1.LoginResponses.INVALID_CREDENTIALS_COMBINATION, true, "bad_lengths");
            return;
        }
        this.log("login_success", {
            username,
            securityId,
            seed0,
            seed1,
            seed2,
            seed3,
            passwordLength: password.length,
        });
        const player = {
            username,
            index: 1,
            location: { x: 3089, y: 3524, plane: 0 },
            appearance: this.defaultAppearance(),
        };
        this.player = player;
        // Build game-layer player for packet listeners.
        const session = new PlayerSession_1.PlayerSession(this.socket);
        if (this.encryptor) {
            session.setEncryptor(this.encryptor);
        }
        const gamePlayer = new Player_1.Player(session, new Location_1.Location(player.location.x, player.location.y, player.location.plane));
        gamePlayer.setUsername(username);
        gamePlayer.setLongUsername(Misc_1.Misc.stringToLong(username));
        gamePlayer.setHostAddress(this.socket?._socket?.remoteAddress ?? "");
        gamePlayer.setLastKnownRegion(new Location_1.Location(player.location.x, player.location.y, player.location.plane));
        gamePlayer.setRegionHeight(player.location.plane);
        this.gamePlayer = gamePlayer;
        // Plain login response
        this.socket.send(Buffer.from([LoginResponses_1.LoginResponses.LOGIN_SUCCESSFUL, 0]));
        // Encrypted initial packets
        this.sendInitialPackets(player);
        this.sendInitialNpcs(player);
        this.stage = "ESTABLISHED";
    }
    parseLoginPayload(buffer, origin = "decrypted") {
        // Java layout (LoginDecoder): [sid][long clientSeed][long seedReceived][int uid][username][password]
        const minLen = 1 + 8 + 8 + 4;
        if (buffer.length < minLen) {
            this.log("login_parse_too_short", { origin, length: buffer.length, bufferHex: buffer.toString("hex") });
            return null;
        }
        let offset = 0;
        const securityId = buffer.readUInt8(offset++);
        const clientSeedHigh = buffer.readInt32BE(offset);
        offset += 4;
        const clientSeedLow = buffer.readInt32BE(offset);
        offset += 4;
        const seedReceivedHigh = buffer.readInt32BE(offset);
        offset += 4;
        const seedReceivedLow = buffer.readInt32BE(offset);
        offset += 4;
        const uid = buffer.readInt32BE(offset);
        offset += 4;
        const usernameResult = this.readString(buffer, offset);
        if (!usernameResult) {
            this.log("login_parse_username_missing", { origin, offset, bufferHex: buffer.toString("hex") });
            return null;
        }
        const passwordResult = this.readString(buffer, usernameResult.next);
        if (!passwordResult) {
            this.log("login_parse_password_missing", { origin, next: usernameResult.next });
            return null;
        }
        return {
            securityId,
            seed0: clientSeedHigh,
            seed1: clientSeedLow,
            seed2: seedReceivedHigh,
            seed3: seedReceivedLow,
            uid,
            usernameRaw: usernameResult.value,
            password: passwordResult.value,
            parsedFrom: origin,
        };
    }
    encodePacket(opcode, payload, type = PacketType_1.PacketType.FIXED) {
        const encOpcode = this.encryptor != null ? (opcode + this.encryptor.nextInt()) & 0xff : opcode;
        let header;
        switch (type) {
            case PacketType_1.PacketType.VARIABLE:
                header = Buffer.alloc(2);
                header.writeUInt8(encOpcode, 0);
                header.writeUInt8(payload.length & 0xff, 1); // guard against overflow
                break;
            case PacketType_1.PacketType.VARIABLE_SHORT:
                header = Buffer.alloc(3);
                header.writeUInt8(encOpcode, 0);
                header.writeUInt16BE(payload.length, 1);
                break;
            default:
                header = Buffer.from([encOpcode]);
        }
        return Buffer.concat([header, payload]);
    }
    sendPacket(opcode, payload, type = PacketType_1.PacketType.FIXED, label) {
        const guide = PacketGuide_1.PACKET_GUIDE[opcode];
        this.log("send_packet", {
            opcode,
            label: label ?? guide?.name,
            payloadLength: payload.length,
            payloadHex: payload.toString("hex"),
        });
        try {
            this.socket.send(this.encodePacket(opcode, payload, type));
        }
        catch (err) {
            this.log("send_packet_error", {
                opcode,
                label: label ?? guide?.name,
                payloadLength: payload.length,
                type,
                err: err?.message ?? String(err),
                stack: err?.stack,
            });
            // Avoid crashing the session on malformed payloads; drop the packet.
        }
    }
    sendInitialPackets(player) {
        const { location, appearance, username, index } = player;
        const regionX = location.x >> 3;
        const regionY = location.y >> 3;
        const localX = location.x - ((regionX - 6) << 3);
        const localY = location.y - ((regionY - 6) << 3);
        // Map region (73)
        const mapPayload = Buffer.alloc(4);
        mapPayload.writeUInt8(((regionX >> 8) & 0xff) >>> 0, 0);
        mapPayload.writeUInt8((((regionX & 0xff) + 128) & 0xff) >>> 0, 1); // ValueType.A on low byte
        mapPayload.writeUInt8(((regionY >> 8) & 0xff) >>> 0, 2);
        mapPayload.writeUInt8((regionY & 0xff) >>> 0, 3);
        this.sendPacket(73, mapPayload, PacketType_1.PacketType.FIXED, "map_region");
        const updateBuf = this.buildPlayerUpdate(localX, localY, location.plane, username, appearance, "teleport");
        this.sendPacket(81, updateBuf, PacketType_1.PacketType.VARIABLE_SHORT, "player_update");
        // Details (249)
        const details = Buffer.alloc(3);
        details.writeUInt8(((1 + 128) & 0xff) >>> 0, 0);
        details.writeUInt8(((index >> 8) & 0xff) >>> 0, 1);
        details.writeUInt8((index & 0xff) >>> 0, 2);
        this.sendPacket(249, details, PacketType_1.PacketType.FIXED, "player_details");
        // Tabs (71)
        const tabs = [
            2423, 3917, 31000, 3213, 1644, 5608, 1151, 37128, 5065, 5715, 2449, 42500,
            147, 32000,
        ];
        tabs.forEach((intf, tab) => {
            if (intf < 0)
                return;
            const buf = Buffer.alloc(3);
            buf.writeUInt8(((intf >> 8) & 0xff) >>> 0, 0);
            buf.writeUInt8((intf & 0xff) >>> 0, 1);
            buf.writeUInt8((((tab & 0xff) + 128) & 0xff) >>> 0, 2);
            this.sendPacket(71, buf, PacketType_1.PacketType.FIXED, `tab_${tab}`);
        });
        // Run status/energy (113/110)
        this.sendPacket(113, Buffer.from([0]), PacketType_1.PacketType.FIXED, "run_status");
        this.sendPacket(110, Buffer.from([100]), PacketType_1.PacketType.FIXED, "run_energy");
        // Map state (99) unlocked
        this.sendPacket(99, Buffer.from([0]), PacketType_1.PacketType.FIXED, "map_state");
        // Clear any lingering interfaces/overlays (219 handles per Java)
        this.sendPacket(219, Buffer.alloc(0), PacketType_1.PacketType.FIXED, "interface_removal");
        // Prayer unlock configs (36)
        this.sendConfig(709, 0);
        this.sendConfig(711, 0);
        this.sendConfig(713, 0);
        this.sendConfig(172, 1); // auto-retaliate on
        // Clear interfaces (219) similar to Java's sendInterfaceRemoval on login
        this.sendPacket(219, Buffer.alloc(0), PacketType_1.PacketType.FIXED, "interface_removal");
        // Inventory/equipment containers (53) with empty slots to avoid client desync.
        this.sendItemContainer(3214, 28); // inventory
        this.sendItemContainer(1688, 14); // equipment
        // Total experience (108) - send zeroed long for now
        const totalExp = Buffer.alloc(8);
        this.sendPacket(108, totalExp, PacketType_1.PacketType.FIXED, "total_exp");
        // Welcome message (253)
        const msg = Buffer.from(`Welcome to RSPS.APP.\n`, "ascii");
        this.sendPacket(253, msg, PacketType_1.PacketType.VARIABLE, "welcome_msg");
        // Rights (127)
        this.sendPacket(127, Buffer.from([0, 0]), PacketType_1.PacketType.FIXED, "rights");
        // Interaction options (104)
        const writeInteraction = (option, slot, top) => {
            const slotC = (-slot) & 0xff; // ValueType.C
            const topA = ((top ? 1 : 0) + 128) & 0xff; // ValueType.A
            return Buffer.from([slotC, topA, ...Buffer.from(option + "\0", "ascii")]);
        };
        const follow = writeInteraction("Follow", 3, false);
        const trade = writeInteraction("Trade With", 4, false);
        this.sendPacket(104, follow, PacketType_1.PacketType.VARIABLE, "follow_option");
        this.sendPacket(104, trade, PacketType_1.PacketType.VARIABLE, "trade_option");
    }
    buildPlayerUpdate(x, y, plane, username, appearance, movement) {
        const bits = [];
        let bitPos = 0;
        const putBits = (numBits, value) => {
            const masked = value & ((1 << numBits) - 1);
            for (let i = numBits - 1; i >= 0; i--) {
                const bit = (masked >> i) & 1;
                const bytePos = bitPos >> 3;
                if (bits[bytePos] === undefined)
                    bits[bytePos] = 0;
                bits[bytePos] |= bit << (7 - (bitPos & 7));
                bitPos++;
            }
        };
        // Local movement/update indicator
        putBits(1, 1); // update required
        if (movement === "teleport") {
            putBits(2, 3); // teleport
            putBits(2, plane & 0x3);
            putBits(1, 1); // reset queue
            putBits(1, 1); // update block appended
            putBits(7, y & 0x7f);
            putBits(7, x & 0x7f);
        }
        else {
            putBits(2, 0); // no movement, just an update block
        }
        // No other players
        putBits(8, 0);
        // sentinel
        putBits(11, 2047);
        const pad = (8 - (bitPos & 7)) & 7;
        if (pad > 0) {
            putBits(pad, 0);
        }
        const bitBytes = Math.ceil(bitPos / 8);
        const bitBuf = Buffer.alloc(bitBytes);
        for (let i = 0; i < bitBytes; i++)
            bitBuf[i] = bits[i] ?? 0;
        const appearanceBlock = this.buildAppearanceBlock(username, appearance);
        const mask = Buffer.from([0x10]); // appearance flag only
        // Java uses ValueType.C for length (negated byte)
        const lenByte = (-appearanceBlock.length) & 0xff;
        const updateBlock = Buffer.concat([mask, Buffer.from([lenByte]), appearanceBlock]);
        return Buffer.concat([bitBuf, updateBlock]);
    }
    buildAppearanceBlock(username, appearance) {
        const bytes = [];
        const putByte = (v) => bytes.push(v & 0xff);
        const putShort = (v) => {
            bytes.push((v >> 8) & 0xff, v & 0xff);
        };
        const putLong = (v) => {
            const buf = Buffer.alloc(8);
            buf.writeBigUInt64BE(v);
            bytes.push(...buf);
        };
        const look = {
            head: appearance.looks[0],
            jaw: appearance.looks[1],
            torso: appearance.looks[2],
            arms: appearance.looks[3],
            hands: appearance.looks[4],
            legs: appearance.looks[5],
            feet: appearance.looks[6],
        };
        // Gender and icons
        putByte(appearance.gender); // 0 male, 1 female
        putByte(0xff); // head icon
        putByte(0xff); // skull icon
        putByte(0); // hint/arrow
        // Equipment/looks (mirror Java ordering; empty slots use a single 0 byte)
        putByte(0); // head slot empty
        putByte(0); // cape
        putByte(0); // amulet
        putByte(0); // weapon
        putShort(0x100 + look.torso); // body
        putByte(0); // shield
        putShort(0x100 + look.arms); // arms
        putShort(0x100 + look.legs); // legs
        putShort(0x100 + look.head); // head
        putShort(0x100 + look.hands); // hands
        putShort(0x100 + look.feet); // feet
        if (appearance.gender === 0 && look.jaw > 0) {
            putShort(0x100 + look.jaw); // beard
        }
        else {
            putByte(0);
        }
        // Colors (hair, torso, legs, feet, skin)
        appearance.colors.forEach((c) => putByte(c & 0xff));
        // Animations (unarmed defaults)
        putShort(808); // stand
        putShort(823); // turn
        putShort(819); // walk
        putShort(820); // turn 180
        putShort(821); // turn 90 cw
        putShort(822); // turn 90 ccw
        putShort(824); // run
        // Name as long
        putLong(BigInt(Misc_1.Misc.stringToLong(username)));
        // Combat level
        putByte(3);
        // Rights
        putByte(0);
        // Loyalty title (empty string, terminator only)
        putByte(0);
        return Buffer.from(bytes);
    }
    handleMovement(opcode, payload) {
        if (!this.player) {
            this.log("movement_no_player");
            return;
        }
        if (payload.length < 5) {
            this.log("movement_payload_too_short", { opcode, payloadLength: payload.length, payloadHex: payload.toString("hex") });
            return;
        }
        let x = payload.readUInt16BE(0);
        let y = payload.readUInt16BE(2);
        let plane = payload.readUInt8(4);
        this.log("movement_received", { opcode, x, y, plane, payloadHex: payload.toString("hex") });
        const dest = new Location_1.Location(x, y, plane);
        const oldRegionX = this.player.location.x >> 3;
        const oldRegionY = this.player.location.y >> 3;
        // Validate destination and move there. We skip pathfinding complexity and place the player
        // directly to keep basic click-to-move responsive in this lightweight server.
        if (this.gamePlayer) {
            const mq = this.gamePlayer.getMovementQueue();
            if (!mq.checkDestination(dest)) {
                this.log("movement_invalid_destination", { x, y, plane });
                return;
            }
            // Close interfaces (except floating world map)
            this.gamePlayer.getPacketSender().sendInterfaceRemoval();
            mq.reset();
            mq.walkToReset();
            this.gamePlayer.moveTo(dest);
            x = dest.getX();
            y = dest.getY();
            plane = dest.getZ();
            this.log("movement_applied", { x, y, plane });
        }
        const regionX = x >> 3;
        const regionY = y >> 3;
        // Local coords relative to region base ((regionX - 6) << 3), matching client expectations.
        const localX = x - ((regionX - 6) << 3);
        const localY = y - ((regionY - 6) << 3);
        // Update stored state
        this.player.location = { x, y, plane };
        // Refresh map region only when we crossed a region boundary.
        if (regionX !== oldRegionX || regionY !== oldRegionY) {
            const mapPayload = Buffer.alloc(4);
            mapPayload.writeUInt8(((regionX >> 8) & 0xff) >>> 0, 0);
            mapPayload.writeUInt8((((regionX & 0xff) + 128) & 0xff) >>> 0, 1);
            mapPayload.writeUInt8(((regionY >> 8) & 0xff) >>> 0, 2);
            mapPayload.writeUInt8((regionY & 0xff) >>> 0, 3);
            this.sendPacket(73, mapPayload, PacketType_1.PacketType.FIXED, "map_region_move");
            if (this.gamePlayer) {
                // Update region base for subsequent locals.
                this.gamePlayer.setLastKnownRegion(new Location_1.Location(x, y, plane));
            }
        }
        if (this.gamePlayer) {
            this.gamePlayer.setNeedsPlacement(true);
        }
        const updateBuf = this.buildPlayerUpdate(localX, localY, plane, this.player.username, this.player.appearance, "teleport");
        this.sendPacket(81, updateBuf, PacketType_1.PacketType.VARIABLE_SHORT, "player_update_move");
    }
    startKeepAlive() {
        setInterval(() => {
            if (this.stage !== "ESTABLISHED")
                return;
            this.sendPacket(0, Buffer.alloc(0), PacketType_1.PacketType.FIXED, "keepalive_tick");
        }, 10000);
    }
    sendConfig(id, state) {
        const buf = Buffer.alloc(3);
        // ValueType.A on state for exact match? use little-endian short then state byte
        buf.writeUInt16LE(id & 0xffff, 0);
        buf.writeUInt8(state & 0xff, 2);
        this.sendPacket(36, buf, PacketType_1.PacketType.FIXED, `config_${id}`);
    }
    sendItemContainer(interfaceId, capacity) {
        const entries = [];
        for (let i = 0; i < capacity; i++) {
            const entry = Buffer.alloc(4);
            entry.writeInt32BE(-1, 0);
            entries.push(entry);
        }
        const header = Buffer.alloc(6);
        header.writeInt32BE(interfaceId, 0);
        header.writeUInt16BE(capacity, 4);
        const payload = Buffer.concat([header, ...entries]);
        this.sendPacket(53, payload, PacketType_1.PacketType.VARIABLE_SHORT, `item_container_${interfaceId}`);
    }
    decryptRsa(payload) {
        try {
            const modulus = NetworkConstants_1.NetworkConstants.RSA_MODULUS;
            const exponent = NetworkConstants_1.NetworkConstants.RSA_EXPONENT;
            const unsignedInt = BigInt("0x" + payload.toString("hex"));
            const base = unsignedInt % modulus;
            const plainInt = LoginSession.modPow(base, exponent, modulus);
            let plainHex = plainInt.toString(16);
            if (plainHex.length % 2 === 1)
                plainHex = "0" + plainHex;
            if ((parseInt(plainHex.slice(0, 2), 16) & 0x80) !== 0) {
                plainHex = "00" + plainHex;
            }
            return Buffer.from(plainHex, "hex");
        }
        catch (err) {
            console.error("RSA decrypt failed:", err);
            return null;
        }
    }
    readString(data, start) {
        const terminatorIndex = data.indexOf(10, start);
        if (terminatorIndex === -1)
            return null;
        return { value: data.toString("utf8", start, terminatorIndex), next: terminatorIndex + 1 };
    }
    sendResponse(response, closeAfter, reason) {
        this.log("login_response", { response, reason, stage: this.stage });
        this.socket.send(Buffer.from([response]));
        if (closeAfter)
            this.socket.close();
    }
    log(event, data) {
        const meta = data ? JSON.stringify(data) : "";
        console.log(`[login_session] ${event} ${meta}`);
    }
    static modPow(base, exp, mod) {
        let result = 1n;
        let b = base % mod;
        let e = exp;
        while (e > 0n) {
            if (e & 1n)
                result = (result * b) % mod;
            e >>= 1n;
            b = (b * b) % mod;
        }
        return result;
    }
    defaultAppearance() {
        return {
            gender: 0,
            looks: [...DEFAULT_LOOKS],
            colors: [...DEFAULT_COLORS],
        };
    }
    normalizeAppearance(gender, looks, colors) {
        const lookRanges = gender === 0 ? MALE_LOOK_RANGES : FEMALE_LOOK_RANGES;
        const normalizedLooks = lookRanges.map(([min, max], idx) => {
            const value = looks[idx] ?? DEFAULT_LOOKS[idx];
            const clamped = Math.min(max, Math.max(min, value));
            return clamped < 0 ? 0 : clamped;
        });
        const normalizedColors = ALLOWED_COLORS.map(([min, max], idx) => {
            const value = colors[idx] ?? DEFAULT_COLORS[idx];
            return Math.min(max, Math.max(min, value));
        });
        return {
            gender: gender === 1 ? 1 : 0,
            looks: normalizedLooks,
            colors: normalizedColors,
        };
    }
    handleGamePacket(buffer) {
        if (!this.decryptor) {
            this.log("game_packet_without_decryptor", { length: buffer.length });
            return;
        }
        if (buffer.length === 0) {
            return;
        }
        // Accumulate and decode multiple packets from this frame using the Java PACKET_SIZES table.
        let data = Buffer.concat([this.recvBuffer, buffer]);
        let offset = 0;
        while (true) {
            if (data.length - offset < 1)
                break;
            const encOpcode = data.readUInt8(offset++);
            const rand = this.decryptor.nextInt() & 0xff;
            const opcode = (encOpcode - rand) & 0xff;
            let size = PACKET_SIZES[opcode];
            if (size === undefined) {
                this.log("packet_unknown_size", { opcode, encOpcode, rand });
                break;
            }
            if (size === -1) {
                if (data.length - offset < 1) {
                    offset--; // rewind opcode
                    break;
                }
                size = data.readUInt8(offset++);
            }
            else if (size === -2) {
                if (data.length - offset < 2) {
                    offset--;
                    break;
                }
                size = data.readUInt16BE(offset);
                offset += 2;
            }
            // Override movement packet sizes to match client encoding (5 bytes for 98/164, 6 for 248).
            if (opcode === PacketConstants_1.PacketConstants.COMMAND_MOVEMENT_OPCODE ||
                opcode === PacketConstants_1.PacketConstants.GAME_MOVEMENT_OPCODE) {
                size = 5;
            }
            else if (opcode === PacketConstants_1.PacketConstants.MINIMAP_MOVEMENT_OPCODE) {
                size = 6;
            }
            if (data.length - offset < size) {
                // Not enough data yet; rewind and wait for the rest.
                offset -= size === -1 ? 2 : size === -2 ? 3 : 1;
                break;
            }
            const payload = data.subarray(offset, offset + size);
            offset += size;
            this.log("packet_received", {
                opcode,
                encOpcode,
                rand,
                sizeUsed: size,
                payloadLength: payload.length,
                payloadPreview: payload.subarray(0, Math.min(16, payload.length)).toString("hex"),
            });
            if (payload.length === 0) {
                this.log("packet_empty_payload", { opcode });
            }
            // Handle movement first.
            if (opcode === PacketConstants_1.PacketConstants.COMMAND_MOVEMENT_OPCODE ||
                opcode === PacketConstants_1.PacketConstants.GAME_MOVEMENT_OPCODE ||
                opcode === PacketConstants_1.PacketConstants.MINIMAP_MOVEMENT_OPCODE) {
                this.handleMovement(opcode, payload);
                continue;
            }
            const exec = PacketConstants_1.PacketConstants.PACKETS.get(opcode) ?? new NOPPacketListener_1.NOPPacketListener();
            if (exec && this.gamePlayer) {
                if (typeof exec.execute !== "function") {
                    this.log("packet_listener_missing_execute", { opcode, listener: exec.constructor?.name });
                    continue;
                }
                try {
                    const packet = new Packet_1.Packet(opcode, payload);
                    exec.execute(this.gamePlayer, packet);
                    continue;
                }
                catch (err) {
                    this.log("packet_listener_error", { opcode, err: err?.message ?? String(err) });
                    continue;
                }
            }
            switch (opcode) {
                case 0:
                    this.sendPacket(0, Buffer.alloc(0), PacketType_1.PacketType.FIXED, "keepalive_echo");
                    continue;
                case 11:
                    this.handleAppearanceChange(payload);
                    continue;
                case PacketConstants_1.PacketConstants.FINALIZED_MAP_REGION_OPCODE:
                    // Let the server know the client finished loading; no-op for now.
                    continue;
                case PacketConstants_1.PacketConstants.CHANGE_MAP_REGION_OPCODE:
                    // Client is requesting a region change; acknowledge by resetting placement so next update teleports.
                    if (this.gamePlayer) {
                        this.gamePlayer.setNeedsPlacement(true);
                    }
                    continue;
                default:
                    this.log("unhandled_packet", { opcode, payloadLength: payload.length });
            }
        }
        this.recvBuffer = data.subarray(offset);
    }
    handleAppearanceChange(payload) {
        if (!this.player) {
            this.log("appearance_change_no_player");
            return;
        }
        if (payload.length < 13) {
            this.log("appearance_change_too_short", { length: payload.length });
            return;
        }
        let offset = 0;
        const gender = payload.readUInt8(offset++);
        const looks = [];
        for (let i = 0; i < 7; i++) {
            looks.push(payload.readUInt8(offset++));
        }
        const colors = [];
        for (let i = 0; i < 5; i++) {
            colors.push(payload.readUInt8(offset++));
        }
        this.player.appearance = this.normalizeAppearance(gender, looks, colors);
        if (this.gamePlayer) {
            const app = this.gamePlayer.getAppearance();
            app.setLook(Appearance_1.Appearance.GENDER, this.player.appearance.gender);
            app.setLook(Appearance_1.Appearance.HEAD, this.player.appearance.looks[0]);
            app.setLook(Appearance_1.Appearance.BEARD, this.player.appearance.looks[1]);
            app.setLook(Appearance_1.Appearance.CHEST, this.player.appearance.looks[2]);
            app.setLook(Appearance_1.Appearance.ARMS, this.player.appearance.looks[3]);
            app.setLook(Appearance_1.Appearance.HANDS, this.player.appearance.looks[4]);
            app.setLook(Appearance_1.Appearance.LEGS, this.player.appearance.looks[5]);
            app.setLook(Appearance_1.Appearance.FEET, this.player.appearance.looks[6]);
            app.setLook(Appearance_1.Appearance.HAIR_COLOUR, this.player.appearance.colors[0]);
            app.setLook(Appearance_1.Appearance.TORSO_COLOUR, this.player.appearance.colors[1]);
            app.setLook(Appearance_1.Appearance.LEG_COLOUR, this.player.appearance.colors[2]);
            app.setLook(Appearance_1.Appearance.FEET_COLOUR, this.player.appearance.colors[3]);
            app.setLook(Appearance_1.Appearance.SKIN_COLOUR, this.player.appearance.colors[4]);
        }
        this.log("appearance_change_applied", {
            gender: this.player.appearance.gender,
            looks: this.player.appearance.looks,
            colors: this.player.appearance.colors,
        });
        const updateBuf = this.buildPlayerUpdate(0, 0, this.player.location.plane, this.player.username, this.player.appearance, "none");
        this.sendPacket(81, updateBuf, PacketType_1.PacketType.VARIABLE_SHORT, "player_update_appearance");
    }
    sendInitialNpcs(player) {
        // TODO: Send real NPC additions once bit-packing matches the Java server/client expectations.
        const payload = this.buildNpcUpdate(player, []);
        this.sendPacket(65, payload, PacketType_1.PacketType.VARIABLE_SHORT, "npc_update");
    }
    buildNpcUpdate(player, npcs) {
        if (npcs.length === 0) {
            // Only the 8-bit local npc count (0), no sentinel when there are no updates.
            return Buffer.from([0]);
        }
        const bits = [];
        let bitPos = 0;
        const putBits = (numBits, value) => {
            const masked = value & ((1 << numBits) - 1);
            for (let i = numBits - 1; i >= 0; i--) {
                const bit = (masked >> i) & 1;
                const bytePos = bitPos >> 3;
                if (bits[bytePos] === undefined)
                    bits[bytePos] = 0;
                bits[bytePos] |= bit << (7 - (bitPos & 7));
                bitPos++;
            }
        };
        // No existing local NPCs yet
        putBits(8, 0);
        for (const npc of npcs) {
            const dx = npc.location.x - player.location.x;
            const dy = npc.location.y - player.location.y;
            putBits(14, npc.index & 0x3fff);
            putBits(5, dy & 0x1f);
            putBits(5, dx & 0x1f);
            putBits(1, 0); // discard walking queue
            putBits(3, 0); // facing direction index
            putBits(NPC_BITS, npc.id & 0x3fff);
            putBits(1, 0); // no update mask
        }
        // Align to next byte
        const pad = (8 - (bitPos & 7)) & 7;
        if (pad > 0) {
            putBits(pad, 0);
        }
        const byteLen = Math.ceil(bitPos / 8);
        const buf = Buffer.alloc(byteLen);
        for (let i = 0; i < byteLen; i++)
            buf[i] = bits[i] ?? 0;
        return buf;
    }
}
class NetworkBuilder {
    initialize(port) {
        const wss = new ws_1.WebSocketServer({ port, host: "127.0.0.1" });
        wss.on("connection", (socket) => new LoginSession(socket));
        console.log(`WebSocket login server started on port ${port}`);
    }
}
exports.NetworkBuilder = NetworkBuilder;
//# sourceMappingURL=NetworkBuilder.js.map