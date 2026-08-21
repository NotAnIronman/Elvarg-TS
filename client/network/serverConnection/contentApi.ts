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
    const url = `${base}/api/interfaces/${groupId | 0}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[content-api] ${url} -> ${response.status}`);
            return undefined;
        }
        const definition = await response.json();
        console.log(
            `[content-api] loaded interface ${groupId} (${
                Array.isArray(definition?.widgets) ? definition.widgets.length : 0
            } widgets)`,
        );
        return definition;
    } catch (error) {
        console.warn(`[content-api] ${url} failed`, error);
        return undefined;
    }
}
