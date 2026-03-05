import * as fs from "fs";
import * as path from "path";
import { GameConstants } from "../game/GameConstants";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "packets.log");
let initialized = false;

function ensureLogFile() {
  if (!GameConstants.SERVER_LOG_WRITES_ENABLED) {
    return;
  }
  if (initialized) {
    return;
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, "", { encoding: "utf8" });
  initialized = true;
}

export interface PacketLogMeta {
  direction: "IN" | "OUT";
  opcode: number;
  stage?: string;
  label?: string;
  player?: string;
  encOpcode?: number;
  rand?: number;
  payloadLength: number;
  payloadPreview?: string;
}

function formatEntry(meta: PacketLogMeta): string {
  const parts = [
    new Date().toISOString(),
    `[${meta.direction}]`,
    `opcode=${meta.opcode}`,
    `len=${meta.payloadLength}`,
  ];
  if (meta.stage) {
    parts.push(`stage=${meta.stage}`);
  }
  if (meta.player) {
    parts.push(`player=${meta.player}`);
  }
  if (meta.label) {
    parts.push(`label=${meta.label}`);
  }
  if (meta.encOpcode !== undefined) {
    parts.push(`enc=${meta.encOpcode}`);
  }
  if (meta.rand !== undefined) {
    parts.push(`rand=${meta.rand}`);
  }
  if (meta.payloadPreview) {
    parts.push(`preview=${meta.payloadPreview}`);
  }
  return parts.join(" ");
}

function writeEntry(meta: PacketLogMeta) {
  if (!GameConstants.SERVER_LOG_WRITES_ENABLED) {
    return;
  }
  try {
    ensureLogFile();
    fs.appendFileSync(LOG_FILE, formatEntry(meta) + "\n", { encoding: "utf8" });
  } catch (err) {
    // Swallow write errors; logging should not crash the server.
    console.warn("[PacketLogger] failed to write packet log", err);
  }
}

export const PacketLogger = {
  logIncoming(meta: PacketLogMeta) {
    writeEntry(meta);
  },
  logOutgoing(meta: PacketLogMeta) {
    writeEntry(meta);
  },
};
