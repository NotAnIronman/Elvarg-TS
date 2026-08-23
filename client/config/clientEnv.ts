/**
 * Build-time client config from CRA `REACT_APP_*` env vars.
 * IMPORTANT: CRA only inlines env vars referenced as static property access
 * (`process.env.REACT_APP_FOO`). Dynamic `process.env[key]` is left undefined.
 */

function read(value: string | undefined): string | undefined {
    // Strip BOM + whitespace; Windows/PowerShell env writes often include U+FEFF.
    const trimmed = value?.replace(/^\uFEFF/, "").trim();
    return trimmed ? trimmed : undefined;
}

export type ConfiguredServer = {
    name: string;
    address: string;
    secure: boolean;
    maxPlayers: number;
    transport?: "websocket" | "webrtc";
    signalUrl?: string;
    worldId?: string;
    iceServers?: RTCIceServer[];
};

export type WebRtcRelayConfig = {
    signalUrl: string;
    iceServers: RTCIceServer[];
};

const DEFAULT_WEBRTC_SIGNAL_URL = "wss://worlds.rsps.app";
const DEFAULT_WEBRTC_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.rsps.app:3478" }];

function readBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0") return false;
    }
    return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isIceServer(value: unknown): value is RTCIceServer {
    if (!isRecord(value)) return false;
    return typeof value.urls === "string"
        || (Array.isArray(value.urls) && value.urls.every((url) => typeof url === "string"));
}

/** Base URL for OSRS cache files. Trailing slash always present. */
export function getCacheBaseUrl(): string {
    const fromEnv = read(process.env.REACT_APP_CACHE_BASE_URL);
    if (!fromEnv) return "/caches/";
    return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
}

/** Default WebSocket URL used before the player picks a server. */
export function getDefaultWsUrl(): string {
    return read(process.env.REACT_APP_DEFAULT_WS_URL) ?? "ws://localhost:43594";
}

export function getDefaultServerAddress(): string {
    return read(process.env.REACT_APP_DEFAULT_SERVER_ADDRESS) ?? "localhost:43594";
}

export function getDefaultServerName(): string {
    return read(process.env.REACT_APP_DEFAULT_SERVER_NAME) ?? "Local Development";
}

export function getDefaultServerSecure(): boolean {
    const raw = read(process.env.REACT_APP_DEFAULT_SERVER_SECURE)?.toLowerCase();
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return getDefaultWsUrl().startsWith("wss://");
}

/**
 * Optional full server list baked in at build time (JSON array).
 * When set, this takes precedence over fetching `/servers.json`.
 */
export function getConfiguredServers(): ConfiguredServer[] | undefined {
    const raw = read(process.env.REACT_APP_SERVERS_JSON);
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return undefined;
        return parsed.map((entry): ConfiguredServer => {
            const server = isRecord(entry) ? entry : {};
            const transport = server.transport === "webrtc" ? "webrtc" : "websocket";
            const signalUrl = typeof server.signalUrl === "string" ? server.signalUrl : undefined;
            return {
                name: typeof server.name === "string" ? server.name : "Server",
                address:
                    typeof server.address === "string"
                        ? server.address
                        : transport === "webrtc" && signalUrl
                          ? new URL(signalUrl).host
                          : "localhost:43594",
                secure: readBoolean(server.secure, false),
                maxPlayers: typeof server.maxPlayers === "number" ? server.maxPlayers : 2047,
                transport,
                signalUrl,
                worldId: typeof server.worldId === "string" ? server.worldId : undefined,
                iceServers: Array.isArray(server.iceServers)
                    ? server.iceServers.filter(isIceServer)
                    : [],
            };
        });
    } catch {
        console.warn("[clientEnv] Failed to parse REACT_APP_SERVERS_JSON");
        return undefined;
    }
}

/** Public relay directory used to discover WebRTC worlds. */
export function getWebRtcRelayConfig(): WebRtcRelayConfig | undefined {
    const signalUrl = read(process.env.REACT_APP_WEBRTC_SIGNAL_URL) ?? DEFAULT_WEBRTC_SIGNAL_URL;

    const rawIceServers = read(process.env.REACT_APP_WEBRTC_ICE_SERVERS);
    if (!rawIceServers) return { signalUrl, iceServers: DEFAULT_WEBRTC_ICE_SERVERS };
    try {
        const parsed = JSON.parse(rawIceServers);
        return {
            signalUrl,
            iceServers: Array.isArray(parsed) ? parsed.filter(isIceServer) : [],
        };
    } catch {
        console.warn("[clientEnv] Failed to parse REACT_APP_WEBRTC_ICE_SERVERS");
        return { signalUrl, iceServers: DEFAULT_WEBRTC_ICE_SERVERS };
    }
}

/** Optional override for the remote server-list URL. */
export function getServerListUrl(): string {
    return (
        read(process.env.REACT_APP_SERVER_LIST_URL) ??
        (typeof window !== "undefined"
            ? `${window.location.origin}/servers.json`
            : "/servers.json")
    );
}
