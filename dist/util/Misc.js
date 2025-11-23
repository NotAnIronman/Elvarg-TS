"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Misc = void 0;
const decimal_format_1 = require("decimal-format");
// import { Location } from '../game/model/Location';
// import { Player } from '../game/entity/impl/player/Player';
const RandomGen_1 = require("../util/RandomGen");
const Location_1 = require("../game/model/Location");
const js_joda_1 = require("js-joda");
const fs_extra_1 = require("fs-extra");
const path = require("path");
const path_1 = require("path");
const zlib = require("zlib");
const moment_1 = require("moment");
class Misc {
    static getTicks(seconds) {
        return seconds / 0.6;
    }
    static getSeconds(ticks) {
        return ticks * 0.6;
    }
    static getRandom(length) {
        return Math.floor(Math.random() * (length + 1));
    }
    static getRandomDouble(length) {
        return Math.random() * length;
    }
    static getRandomInt() {
        return Math.floor(Math.random() * (length + 1));
    }
    static getCurrentServerTime() {
        this.zonedDateTime = js_joda_1.ZonedDateTime.now();
        let hour = this.zonedDateTime.hour();
        let hourPrefix = hour < 10 ? "0" + hour + "" : "" + hour + "";
        let minute = this.zonedDateTime.minute();
        let minutePrefix = minute < 10 ? "0" + minute + "" : "" + minute + "";
        return "" + hourPrefix + ":" + minutePrefix + "";
    }
    static getTimePlayed(totalPlayTime) {
        const sec = Math.floor(totalPlayTime / 1000);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec / 60) % 60);
        const s = sec % 60;
        return ((h < 10 ? "0" + h : h) +
            ":" +
            (m < 10 ? "0" + m : m) +
            ":" +
            (s < 10 ? "0" + s : s));
    }
    static getHoursPlayed(totalPlayTime) {
        const sec = Math.floor(totalPlayTime / 1000);
        const h = Math.floor(sec / 3600);
        return (h < 10 ? "0" + h : h) + "h";
    }
    static getMinutesPassed(t) {
        const seconds = Math.floor((t / 1000) % 60);
        const minutes = Math.floor((t - seconds) / 1000 / 60);
        return minutes;
    }
    static concat(a, b) {
        const aLen = a.length;
        const bLen = b.length;
        const c = new Array(aLen + bLen);
        c.push(...a, ...b);
        return c;
    }
    static getCloseRandomPlayer(plrs) {
        const index = Misc.getRandom(plrs.length - 1);
        if (index > 0) {
            return plrs[index];
        }
        return null;
    }
    static getDirection(x, y) {
        for (let i = 0; i < 8; i++) {
            if (Misc.DIRECTIONS[i][0] == x && Misc.DIRECTIONS[i][1] == y)
                return i;
        }
        return -1;
    }
    static ucFirst(str) {
        str = str.toLowerCase();
        if (str.length > 1) {
            str = str.substring(0, 1).toUpperCase() + str.substring(1);
        }
        else {
            return str.toUpperCase();
        }
        return str;
    }
    static format(num) {
        return num.toLocaleString();
    }
    static formatText(s) {
        for (let i = 0; i < s.length; i++) {
            if (i == 0) {
                s = `${s.charAt(0).toUpperCase()}${s.substring(1)}`;
            }
            if (!/[a-zA-Z0-9]/.test(s.charAt(i))) {
                if (i + 1 < s.length) {
                    s = `${s.substring(0, i + 1)}${s
                        .charAt(i + 1)
                        .toUpperCase()}${s.substring(i + 2)}`;
                }
            }
        }
        return s.replace("_", " ");
    }
    static getTotalAmount(j) {
        if (j >= 10000 && j < 1000000) {
            return j / 1000 + "K";
        }
        else if (j >= 1000000 && j <= Number.MAX_SAFE_INTEGER) {
            return j / 1000000 + "M";
        }
        else {
            return "" + j;
        }
    }
    static formatPlayerName(str) {
        return this.formatText(str);
    }
    static insertCommasToNumber(number) {
        return number.length < 4
            ? number
            : this.insertCommasToNumber(number.substring(0, number.length - 3)) +
                "," +
                number.substring(number.length - 3, number.length);
    }
    static textUnpack(packedData, size) {
        let decodeBuf = new Array(4096);
        let idx = 0, highNibble = -1;
        for (let i = 0; i < size * 2; i++) {
            let val = (packedData[i / 2] >> (4 - 4 * (i % 2))) & 0xf;
            if (highNibble == -1) {
                if (val < 13) {
                    decodeBuf[idx++] = parseInt(Misc.xlateTable[val]);
                }
                else {
                    highNibble = val;
                }
            }
            else {
                decodeBuf[idx++] = parseInt(Misc.xlateTable[(highNibble << 4) + val - 195]);
                highNibble = -1;
            }
        }
        return new TextDecoder().decode(new Uint8Array(decodeBuf.slice(0, idx)));
    }
    static anOrAr(s) {
        s = s.toLowerCase();
        if (s === "anchovies" ||
            s === "soft clay" ||
            s === "cheese" ||
            s === "ball of wool" ||
            s === "spice" ||
            s === "steel nails" ||
            s === "snape grass" ||
            s === "coal") {
            return "some";
        }
        if (s.startsWith("a") ||
            s.startsWith("e") ||
            s.startsWith("i") ||
            s.startsWith("o") ||
            s.startsWith("u")) {
            return "an";
        }
        return "a";
    }
    static anOrAs(s) {
        s = s.toLowerCase();
        if (s === "anchovies" ||
            s === "soft clay" ||
            s === "cheese" ||
            s === "ball of wool" ||
            s === "spice" ||
            s === "steel nails" ||
            s === "snape grass" ||
            s === "coal") {
            return "some";
        }
        if (s.startsWith("a") ||
            s.startsWith("e") ||
            s.startsWith("i") ||
            s.startsWith("o") ||
            s.startsWith("u")) {
            return "an";
        }
        return "a";
    }
    static textPack(text) {
        if (text.length > 80) {
            text = text.substring(0, 80);
        }
        let packedData = [];
        text = text.toLowerCase();
        let carryOverNibble = -1;
        let ofs = 0;
        for (let idx = 0; idx < text.length; idx++) {
            let c = text.charAt(idx);
            let tableIdx = 0;
            for (let i = 0; i < Misc.xlateTable.length; i++) {
                if (c === Misc.xlateTable[i]) {
                    tableIdx = i;
                    break;
                }
            }
            if (tableIdx > 12) {
                tableIdx += 195;
            }
            if (carryOverNibble === -1) {
                if (tableIdx < 13) {
                    carryOverNibble = tableIdx;
                }
                else {
                    packedData[ofs++] = tableIdx;
                }
            }
            else if (tableIdx < 13) {
                packedData[ofs++] = (carryOverNibble << 4) + tableIdx;
                carryOverNibble = -1;
            }
            else {
                packedData[ofs++] = (carryOverNibble << 4) + (tableIdx >> 4);
                carryOverNibble = tableIdx & 0xf;
            }
        }
        if (carryOverNibble != -1) {
            packedData[ofs++] = carryOverNibble << 4;
        }
        return packedData;
    }
    static anOrA(s) {
        s = s.toLowerCase();
        if (s.toLowerCase() === "anchovies" ||
            s.toLowerCase() === "soft clay" ||
            s.toLowerCase() === "cheese" ||
            s.toLowerCase() === "ball of wool" ||
            s.toLowerCase() === "spice" ||
            s.toLowerCase() === "steel nails" ||
            s.toLowerCase() === "snape grass" ||
            s.toLowerCase() === "coal")
            return "some";
        if (s.startsWith("a") ||
            s.startsWith("e") ||
            s.startsWith("i") ||
            s.startsWith("o") ||
            s.startsWith("u"))
            return "an";
        return "a";
    }
    static getClasses(packageName) {
        let classList = [];
        // Add logic to get classes from package name
        return classList;
    }
    static findClasses(directory, packageName) {
        let classes = [];
        let files = fs_extra_1.fs.readdirSync(directory);
        for (let file of files) {
            let filePath = path.join(directory, file);
            let stat = fs_extra_1.fs.lstatSync(filePath);
            if (stat.isDirectory()) {
                classes = classes.concat(Misc.findClasses(filePath, packageName + "." + file));
            }
            else if (file.endsWith(".class")) {
                classes.push(require(packageName + "." + file.substring(0, file.length - 6)));
            }
        }
        return classes;
    }
    static removeSpaces(s) {
        return s.replace(/ /g, "");
    }
    static getMinutesElapsed(minute, hour, day, year) {
        let i = new Date();
        if (i.getFullYear() == year) {
            if (i.getDate() == day) {
                if (hour == i.getHours()) {
                    return i.getMinutes() - minute;
                }
                return (i.getHours() - hour) * 60 + (59 - i.getMinutes());
            }
            let ela = (i.getDate() - day) * 24 * 60 * 60;
            return ela > 2147483647 ? 2147483647 : ela;
        }
        let ela = Misc.getElapsed(day, year) * 24 * 60 * 60;
        return ela > 2147483647 ? 2147483647 : ela;
    }
    static async readFile(s) {
        try {
            return await new Promise((resolve, reject) => {
                let fis = new FileReader();
                fis.readAsArrayBuffer(s);
                fis.onloadend = function () {
                    const fc = new Uint8Array(fis.result);
                    resolve(fc);
                };
                fis.onerror = reject;
            });
        }
        catch (e) {
            console.log("FILE : " + s.name + " missing.");
            return null;
        }
    }
    static isWeekend() {
        let day = new Date().getDay();
        return day === 0 || day === 6 || day === 7;
    }
    static randomTypeOfList(list) {
        return list[Math.floor(Math.random() * list.length)];
    }
    static randomInclusive(min, max) {
        return (Math.min(min, max) +
            Math.floor(Math.random() * (Math.max(min, max) - Math.min(min, max) + 1)));
    }
    static async getBuffers(filePath) {
        try {
            const buffer = await fs_extra_1.fs.readFile(filePath);
            const inflated = await new Promise((resolve, reject) => {
                zlib.gunzip(buffer, (err, result) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(result);
                    }
                });
            });
            if (inflated.length < 10) {
                return null;
            }
            return new Uint8Array(inflated);
        }
        catch (e) {
            console.log(`Error reading file "${filePath}":`, e);
            return null;
        }
    }
    // public static getFormattedPlayTime(player: Player): string {
    static getFormattedPlayTime(player) {
        const now = new Date().getTime();
        const creationDate = player.getCreationDate().getTime();
        const elapsed = now - creationDate;
        const secondsInMilli = 1000;
        const minutesInMilli = secondsInMilli * 60;
        const hoursInMilli = minutesInMilli * 60;
        const daysInMilli = hoursInMilli * 24;
        const elapsedDays = Math.floor(elapsed / daysInMilli);
        const elapsedHours = Math.floor((elapsed % daysInMilli) / hoursInMilli);
        const elapsedMinutes = Math.floor((elapsed % hoursInMilli) / minutesInMilli);
        const elapsedSeconds = Math.floor((elapsed % minutesInMilli) / secondsInMilli);
        return `${elapsedDays} day(s) : ${elapsedHours} hour(s) : ${elapsedMinutes} minute(s) : ${elapsedSeconds} second(s)`;
    }
    static hexToInt(data) {
        let value = 0;
        let n = 1000;
        for (let i = 0; i < data.length; i++) {
            let num = (data[i] & 0xff) * n;
            value += num;
            if (n > 1) {
                n = n / 1000;
            }
        }
        return value;
    }
    static delta(a, b) {
        return new Location_1.Location(b.getX() - a.getX(), b.getY() - a.getY(), b.getZ());
    }
    // Picks a random element out of any array type
    static randomElements(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    // Picks a random element out of any list type
    static randomElement(list) {
        return list[Math.floor(Math.random() * list.length)];
    }
    static blockedWord(string) {
        const BLOCKED_WORDS = [];
        for (const s of Misc.BLOCKED_WORDS) {
            if (string.includes(s)) {
                return true;
            }
        }
        return false;
    }
    static capitalizeWords(name) {
        let builder = "";
        const words = name.split(" ");
        let i; // mover a declaração da variável i para fora do loop
        for (i = 0; i < words.length; ++i) {
            if (i > 0) {
                builder += " ";
            }
            builder += words[i][0].toUpperCase() + words[i].substring(1);
        }
        return builder;
    }
    static capitalize(name) {
        if (name.length < 1) {
            return "";
        }
        let builder = "";
        builder += name[0].toUpperCase() + name.substring(1).toLowerCase();
        return builder;
    }
    static getVowelFormat(name) {
        let letter = name.charAt(0);
        let vowel = letter == "a" ||
            letter == "e" ||
            letter == "i" ||
            letter == "o" ||
            letter == "u";
        let other = vowel ? "an" : "a";
        return other + " " + name;
    }
    static isValidName(name) {
        return Misc.formatNameForProtocol(name).match(/^[a-z0-9_]+$/gi) !== null;
    }
    static stringToLong(string) {
        let l = 0;
        for (let i = 0; i < string.length && i < 12; i++) {
            let c = string.charAt(i);
            l *= 37;
            if (c >= "A" && c <= "Z") {
                l += 1 + c.charCodeAt(0) - 65;
            }
            else if (c >= "a" && c <= "z") {
                l += 1 + c.charCodeAt(0) - 97;
            }
            else if (c >= "0" && c <= "9") {
                l += 27 + c.charCodeAt(0) - 48;
            }
        }
        while (l % 37 === 0 && l !== 0) {
            l /= 37;
        }
        return l;
    }
    static getBuffer(file) {
        try {
            if (!fs_extra_1.fs.existsSync(file)) {
                return null;
            }
            let buffer = new Uint8Array((0, fs_extra_1.readFileSync)(file));
            return buffer;
        }
        catch (e) {
            console.error(e);
        }
        return null;
    }
    static formatNameForProtocol(name) {
        return name.toLowerCase().replace(" ", "_");
    }
    static formatName(name) {
        return Misc.fixName(name.replace(" ", "_"));
    }
    static longToString(l) {
        let i = 0;
        let ac = new Array(12);
        while (l != 0) {
            let l1 = l;
            l /= 37;
            ac[11 - i++] = Misc.VALID_CHARACTERS[l1 - l * 37];
        }
        return ac.slice(12 - i, i).join("");
    }
    static fixName(name) {
        if (name.length > 0) {
            const ac = name.split("");
            for (let j = 0; j < ac.length; j++) {
                if (ac[j] === "_") {
                    ac[j] = " ";
                    if (j + 1 < ac.length && ac[j + 1] >= "a" && ac[j + 1] <= "z") {
                        ac[j + 1] = String.fromCharCode(ac[j + 1].charCodeAt(0) + 65 - 97);
                    }
                }
            }
            if (ac[0] >= "a" && ac[0] <= "z") {
                ac[0] = String.fromCharCode(ac[0].charCodeAt(0) + 65 - 97);
            }
            return ac.join("");
        }
        else {
            return name;
        }
    }
    static wrapText(text, len) {
        const EFFECTS = [
            "@gre@",
            "@cya@",
            "@red@",
            "chalreq",
            "tradereq",
            "@bro@",
            "@yel@",
            "@blu@",
            "@gr1@",
            "@gr2@",
            "@gr3@",
            "@str@",
            "@mag@",
            "@dre@",
            "@dbl@",
            "@or1@",
            "@or2@",
            "@or3@",
            "@whi@",
            "@bla@",
            "@cr",
            "<col",
            "<shad",
            "<str",
            "<u",
            "<br",
            "<trans",
            "duelreq",
            "<img",
            "@lre@",
            ":clan:",
            "]cr",
            "::summ",
            "<str",
        ];
        // Retorna um array vazio para o texto nulo
        if (text == null) {
            return [];
        }
        // Retorna o texto se len for zero ou menor
        if (len <= 0) {
            return [text];
        }
        // Retorna o texto se for menor ou igual ao comprimento
        if (text.length <= len) {
            return [text];
        }
        const chars = text.split("");
        const lines = [];
        let line = "";
        let word = "";
        // Efeitos de texto
        let effects = null;
        for (const effectCode of EFFECTS) {
            if (text.includes(effectCode)) {
                if (effects == null) {
                    effects = "";
                }
                effects += effectCode;
            }
        }
        for (let i = 0; i < chars.length; i++) {
            word += chars[i];
            if (chars[i] == " ") {
                if (line.length + word.length > len) {
                    let line_ = line;
                    // Aplica os efeitos
                    if (effects != null && !line_.startsWith(effects)) {
                        line_ = effects + line_;
                    }
                    lines.push(line_);
                    line = "";
                }
                line += word;
                word = "";
            }
        }
        // Lidar com quaisquer caracteres extras na palavra atual
        if (word.length > 0) {
            if (line.length + word.length > len) {
                let line_ = line;
                // Aplica os efeitos
                if (effects != null && !line_.startsWith(effects)) {
                    line_ = effects + line_;
                }
                lines.push(line_);
                line = "";
            }
            line += word;
        }
        // Lidar com linha extra
        if (line.length > 0) {
            let line_ = line;
            // Aplica os efeitos
            if (effects != null && !line_.startsWith(effects)) {
                line_ = effects + line_;
            }
            lines.push(line_);
        }
        return lines;
    }
    static hash(string) {
        return Misc.hash(string.toUpperCase());
    }
    static getUsersProjectRootDirectory() {
        const envRootDir = process.cwd();
        const rootDir = (0, path_1.resolve)(".");
        if (rootDir.startsWith(envRootDir)) {
            return rootDir;
        }
        else {
            throw new Error("Root dir not found in user directory.");
        }
    }
    static randoms(range) {
        return Math.floor(Math.random() * (range + 1));
    }
    static random(minRange, maxRange) {
        return minRange + Misc.random(maxRange, minRange);
    }
    /**
     * Get a random number between a range and exclude some numbers.
     * The excludes list MUST BE MODIFIABLE.
     *
     * @param start start number
     * @param end end number
     * @param excludes list of numbers to be excluded
     * @return value between `start` (inclusive) and `end` (inclusive)
     */
    static getRandomExlcuding(start, end, excludes) {
        if (start > end) {
            [start, end] = [end, start];
        }
        const range = end - start + 1;
        let random = start + Math.floor(Math.random() * range);
        while (excludes.includes(random)) {
            random = start + Math.floor(Math.random() * range);
        }
        return random;
    }
    static concatWithCollection(array1, array2) {
        let resultList = [...array1, ...array2];
        return resultList;
    }
}
exports.Misc = Misc;
Misc.FORMATTER = new decimal_format_1.default("0.#");
Misc.HALF_A_DAY_IN_MILLIS = 43200000;
Misc.VALID_PLAYER_CHARACTERS = [
    "_",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "[",
    "]",
    "/",
    "-",
    " ",
];
Misc.VALID_CHARACTERS = [
    "_",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "!",
    "@",
    "#",
    "$",
    "%",
    "^",
    "&",
    "",
    "(",
    ")",
    "-",
    "+",
    "=",
    ":",
    ";",
    ".",
    ">",
    "<",
    ",",
    '"',
    "[",
    "]",
    "|",
    "?",
    "/",
    "`",
];
Misc.RANDOM = new RandomGen_1.RandomGen();
Misc.BLOCKED_WORDS = [
    ".com",
    ".net",
    ".org",
    "<img",
    "@cr",
    "<img=",
    ":tradereq:",
    ":duelreq:",
    "<col=",
    "<shad=",
];
Misc.DIRECTIONS = [
    [-1, 1],
    [0, 1],
    [1, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
];
Misc.xlateDirectionToClient = { 1: 2, 4: 7, 6: 5, 3: 0 };
Misc.xlateTable = [
    " ",
    "e",
    "t",
    "a",
    "o",
    "i",
    "h",
    "n",
    "s",
    "r",
    "d",
    "l",
    "u",
    "m",
    "w",
    "c",
    "y",
    "f",
    "g",
    "p",
    "b",
    "v",
    "k",
    "x",
    "j",
    "q",
    "z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    " ",
    "!",
    "?",
    ".",
    ",",
    ":",
    ";",
    "(",
    ")",
    "-",
    "&",
    "*",
    "\\",
    "'",
    "@",
    "#",
    "+",
    "=",
    "£",
    "$",
    "%",
    '"',
    "[",
    "]",
];
Misc.getDayOfYear = () => {
    let c = new Date();
    let year = c.getFullYear();
    let month = c.getMonth();
    let days = 0;
    let daysOfTheMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
        daysOfTheMonth[1] = 29;
    }
    days += c.getDate();
    for (let i = 0; i < daysOfTheMonth.length; i++) {
        if (i < month) {
            days += daysOfTheMonth[i];
        }
    }
    return days;
};
Misc.getYear = () => {
    let c = new Date();
    return c.getFullYear();
};
Misc.getElapsed = (day, year) => {
    if (year < 2013) {
        return 0;
    }
    let elapsed = 0;
    let currentYear = Misc.getYear();
    let currentDay = Misc.getDayOfYear();
    if (currentYear == year) {
        elapsed = currentDay - day;
    }
    else {
        elapsed = currentDay;
        for (let i = 1; i < 5; i++) {
            if (currentYear - i == year) {
                elapsed += 365 - day;
                break;
            }
            else {
                elapsed += 365;
            }
        }
    }
    return elapsed;
};
Misc.getTimeLeft = (start, timeAmount, timeUnit) => {
    const duration = moment_1.default.duration(Date.now() - start, "milliseconds");
    const timeUnitDuration = moment_1.default.duration(timeAmount, timeUnit);
    const remaining = timeUnitDuration.subtract(duration).as(timeUnit);
    return Math.max(remaining, 1);
};
//# sourceMappingURL=Misc.js.map