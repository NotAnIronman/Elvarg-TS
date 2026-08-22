import { getConfiguredServers, getWebRtcRelayConfig } from "../../../config/clientEnv";
import { SERVER_LIST_URL } from "./constants";
import type { LoginRendererHost } from "./host";
import type { ServerListEntry } from "./types";

function filterServersForCurrentHost(servers: ServerListEntry[]) {

        if (typeof window === "undefined") return servers;
        const pageHost = window.location.hostname.toLowerCase();
        const pageIsLocal =
            pageHost === "localhost" ||
            pageHost === "127.0.0.1" ||
            pageHost === "[::1]" ||
            pageHost === "::1";
        if (pageIsLocal) return servers;

        return servers.filter((s) => {
            const address = s.address.trim().toLowerCase();
            return !(
                address === "localhost" ||
                address.startsWith("localhost:") ||
                address === "127.0.0.1" ||
                address.startsWith("127.0.0.1:") ||
                address === "[::1]" ||
                address.startsWith("[::1]:") ||
                address === "::1"
            );
        });
    
}

function serverEntry(server: any): ServerListEntry {
    const transport = server?.transport === "webrtc" ? "webrtc" : "websocket";
    const signalUrl = typeof server?.signalUrl === "string" ? server.signalUrl : undefined;
    return {
        name: server?.name ?? "Unknown",
        address:
            typeof server?.address === "string"
                ? server.address
                : transport === "webrtc" && signalUrl
                  ? new URL(signalUrl).host
                  : "",
        secure: server?.secure ?? false,
        playerCount: null,
        maxPlayers: server?.maxPlayers ?? 2047,
        transport,
        signalUrl,
        worldId: typeof server?.worldId === "string" ? server.worldId : undefined,
        iceServers: Array.isArray(server?.iceServers) ? server.iceServers : [],
    };
}

export function relayWorldEntries(
    signalUrl: string,
    iceServers: RTCIceServer[],
    payload: unknown,
): ServerListEntry[] {
    const worlds = (payload as any)?.worlds;
    if (!Array.isArray(worlds)) return [];
    const relayUrl = new URL(signalUrl);
    return worlds
        .filter((world: any) => typeof world?.worldId === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(world.worldId))
        .map((world: any) => ({
            name: world.worldId,
            address: relayUrl.host,
            secure: relayUrl.protocol === "wss:",
            playerCount: -1,
            maxPlayers: 2047,
            transport: "webrtc" as const,
            signalUrl,
            worldId: world.worldId,
            iceServers,
            relayDiscovered: true,
        }));
}

export function replaceRelayWorlds(
    current: ServerListEntry[],
    discovered: ServerListEntry[],
): ServerListEntry[] {
    const permanent = current.filter((server) => !server.relayDiscovered);
    const configured = new Set(
        permanent
            .filter((server) => server.transport === "webrtc" && server.signalUrl && server.worldId)
            .map((server) => `${server.signalUrl}|${server.worldId}`),
    );
    return [
        ...permanent,
        ...discovered.filter((server) => !configured.has(`${server.signalUrl}|${server.worldId}`)),
    ];
}

async function discoverRelayWorlds(): Promise<ServerListEntry[]> {
    const relay = getWebRtcRelayConfig();
    if (!relay) return [];
    try {
        const url = new URL(relay.signalUrl);
        url.protocol = url.protocol === "wss:" ? "https:" : "http:";
        url.pathname = "/worlds";
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        return response.ok
            ? relayWorldEntries(relay.signalUrl, relay.iceServers, await response.json())
            : [];
    } catch {
        return [];
    }
}

function probeWebSocket(url: string, timeoutMs: number) {

        return new Promise((resolve) => {
            let settled = false;
            const ws = new WebSocket(url);
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    ws.close();
                    resolve(false);
                }
            }, timeoutMs);
            ws.addEventListener("open", () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    ws.close();
                    resolve(true);
                }
            });
            ws.addEventListener("error", () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(false);
                }
            });
        });
    
}

export async function fetchServerList(host: LoginRendererHost): Promise<void> {

        if (host.serverListFetched) return;

        const configured = getConfiguredServers();
        if (configured && configured.length > 0) {
            host.serverList = filterServersForCurrentHost(
                configured.map(serverEntry),
            );
            host.serverListFetched = true;
            return;
        }

        try {
            const res = await fetch(SERVER_LIST_URL, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    host.serverList = filterServersForCurrentHost(
                        data.map(serverEntry),
                    );
                }
            }
        } catch {
            // keep fallback
        }
        host.serverListFetched = true;
    
}

export function refreshServerList(host: LoginRendererHost) {

        if (host.probing) return;
        host.probed = false;
        host.probing = true;

        const visibleServers = host.serverList.filter((server) => !server.relayDiscovered);
        const promises = visibleServers.map(async (server) => {
            if (server.transport === "webrtc" && server.signalUrl && server.worldId) {
                try {
                    const statusUrl = new URL(server.signalUrl);
                    statusUrl.protocol = statusUrl.protocol === "wss:" ? "https:" : "http:";
                    statusUrl.pathname = "/worlds";
                    const response = await fetch(statusUrl, { signal: AbortSignal.timeout(8000) });
                    const data = response.ok ? await response.json() : undefined;
                    server.playerCount = data?.worlds?.some(
                        (world: any) => world?.worldId === server.worldId,
                    )
                        ? -1
                        : null;
                } catch {
                    server.playerCount = null;
                }
                return;
            }
            const protocol = server.secure ? "https" : "http";
            let httpOk = false;
            try {
                const res = await fetch(`${protocol}://${server.address}/status`, {
                    signal: AbortSignal.timeout(8000),
                });
                if (res.ok) {
                    const data = await res.json();
                    server.playerCount =
                        typeof data.playerCount === "number" ? data.playerCount : null;
                    if (typeof data.maxPlayers === "number") server.maxPlayers = data.maxPlayers;
                    if (typeof data.serverName === "string") server.name = data.serverName;
                    httpOk = true;
                }
            } catch {
                /* fall through to ws probe */
            }

            if (!httpOk) {
                const wsProto = server.secure ? "wss" : "ws";
                const alive = await probeWebSocket(`${wsProto}://${server.address}`, 5000);
                server.playerCount = alive ? -1 : null;
            }
        });

        Promise.all([Promise.all(promises), discoverRelayWorlds()]).then(([, discovered]) => {
            host.serverList = replaceRelayWorlds(visibleServers, discovered);
        }).finally(() => {
            host.probing = false;
            host.probed = true;
        });
    
}
