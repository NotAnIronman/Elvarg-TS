import { CacheDefinitions } from "./CacheDefinitions";

export type ItemSearchEntry = {
    itemId: number;
    name: string;
    normalizedName: string;
};

export function normalizeSearchTerm(value: string | undefined): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Item name search over the active cache, ranked the way a player expects: exact name
 * first, then prefix, then phrase, then scattered token matches.
 *
 * This used to live in the client so its search UI could filter locally. It belongs here
 * so any interface - a spawner, a shop editor, a lookup command - can search without the
 * client needing to know what it is searching for.
 */
export class ItemSearchIndex {
    private static entries?: ItemSearchEntry[];

    public static search(query: string, limit: number): { total: number; rows: ItemSearchEntry[] } {
        const normalizedQuery = normalizeSearchTerm(query);
        if (normalizedQuery.length === 0) {
            return { total: 0, rows: [] };
        }

        const tokens = normalizedQuery.split(" ").filter((token) => token.length > 0);
        const scored: Array<{ entry: ItemSearchEntry; score: number }> = [];
        for (const entry of this.getEntries()) {
            const score = this.scoreEntry(entry, normalizedQuery, tokens);
            if (score === Number.NEGATIVE_INFINITY) {
                continue;
            }
            scored.push({ entry, score });
        }

        scored.sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            if (left.entry.name.length !== right.entry.name.length) {
                return left.entry.name.length - right.entry.name.length;
            }
            return left.entry.itemId - right.entry.itemId;
        });

        return {
            total: scored.length,
            rows: scored.slice(0, Math.max(0, limit)).map((result) => result.entry),
        };
    }

    /** Built once on first search; the cache does not change while the server is up. */
    private static getEntries(): ItemSearchEntry[] {
        if (this.entries) {
            return this.entries;
        }
        const entries: ItemSearchEntry[] = [];
        const count = Math.max(0, CacheDefinitions.getCounts().items | 0);
        for (let itemId = 0; itemId < count; itemId++) {
            let objType: { name?: string; noteTemplate?: number } | undefined;
            try {
                objType = CacheDefinitions.getItem(itemId) as any;
            } catch {
                objType = undefined;
            }
            // Noted variants share their parent's name and are not separately spawnable.
            if (!objType || (objType.noteTemplate ?? -1) !== -1) {
                continue;
            }
            const name = String(objType.name ?? "").trim();
            if (name.length === 0 || name.toLowerCase() === "null") {
                continue;
            }
            const normalizedName = normalizeSearchTerm(name);
            if (normalizedName.length === 0) {
                continue;
            }
            entries.push({ itemId, name, normalizedName });
        }
        this.entries = entries;
        return entries;
    }

    private static scoreEntry(
        entry: ItemSearchEntry,
        normalizedQuery: string,
        tokens: string[]
    ): number {
        const normalizedName = entry.normalizedName;
        for (const token of tokens) {
            if (!normalizedName.includes(token)) {
                return Number.NEGATIVE_INFINITY;
            }
        }

        let score = 0;
        if (normalizedName === normalizedQuery) score += 5000;
        if (normalizedName.startsWith(normalizedQuery)) score += 2500;
        const wholePhraseIndex = normalizedName.indexOf(` ${normalizedQuery}`);
        if (wholePhraseIndex >= 0) {
            score += 1800 - Math.min(wholePhraseIndex, 1800);
        } else {
            const firstIndex = normalizedName.indexOf(normalizedQuery);
            if (firstIndex >= 0) score += 1200 - Math.min(firstIndex, 1200);
        }

        let tokenOrderScore = 0;
        let orderedTokenMatches = 0;
        let lastOrderedIndex = -1;
        for (const token of tokens) {
            const index = normalizedName.indexOf(token);
            if (index < 0) return Number.NEGATIVE_INFINITY;
            tokenOrderScore += Math.max(0, 200 - index);
            if (index >= lastOrderedIndex) {
                orderedTokenMatches++;
                lastOrderedIndex = index + token.length;
            }
        }
        score += tokenOrderScore;
        score += orderedTokenMatches * 50;
        score -= normalizedName.length;
        score -= Math.min(entry.itemId, 2000) / 10;
        return score;
    }
}
