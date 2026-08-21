import { state } from "./state";

/**
 * Base URL for the game server's read-only JSON endpoints. They are served by the same
 * process and port as the game socket, so the address is derived from the live connection
 * rather than configured separately.
 */
export function getContentApiBase(): string | undefined {
    const url = state.lastUrl;
    if (typeof url !== "string" || url.length === 0) {
        return undefined;
    }
    try {
        const parsed = new URL(url);
        parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
        parsed.pathname = "";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return undefined;
    }
}

/**
 * Fetches a server-defined interface definition - the widget group plus the behaviour the
 * runtime drives it with. Definitions are static per build, so the browser's own ETag
 * revalidation keeps repeat opens to a 304; nothing here caches by hand.
 */
export async function fetchInterfaceDefinition(groupId: number): Promise<any | undefined> {
    const base = getContentApiBase();
    if (!base) {
        return undefined;
    }
    try {
        const response = await fetch(`${base}/api/interfaces/${groupId | 0}`);
        if (!response.ok) {
            return undefined;
        }
        return await response.json();
    } catch (error) {
        console.warn(`[content-api] interface ${groupId} fetch failed`, error);
        return undefined;
    }
}
