import * as fs from "fs";
import { GameConstants } from "../../../GameConstants";
import {
    ShopDefinition,
    ShopStockDefinition,
} from "../../ShopDefinition";
import { DefinitionLoader, LoadedDefinitionSource } from "../DefinitionLoader";

interface RawShopStockDefinition {
    id?: unknown;
    amount?: unknown;
    restockTicks?: unknown;
    restockTime?: unknown;
    restock?: unknown;
    price?: unknown;
}

interface RawShopDefinition {
    id?: unknown;
    name?: unknown;
    currency?: unknown;
    originalStock?: unknown;
    defaultRestockTicks?: unknown;
    restockTicks?: unknown;
    defaultDestockTicks?: unknown;
    soldItemDestockTicks?: unknown;
}

export class ShopDefinitionLoader extends DefinitionLoader {
    public static readonly DEFINITION_TYPE = "shops";
    public static readonly CORE_SOURCE = "core";
    public static readonly DEFAULT_STOCK_CHANGE_TICKS = 4;
    public static readonly GENERAL_STORE_SOLD_ITEM_DESTOCK_TICKS = 100;

    public load(): boolean {
        const contributed = this.loadSources<RawShopDefinition>(
            ShopDefinitionLoader.DEFINITION_TYPE
        );
        const sources: LoadedDefinitionSource<RawShopDefinition>[] = [
            {
                name: ShopDefinitionLoader.CORE_SOURCE,
                owner: ShopDefinitionLoader.CORE_SOURCE,
                priority: 0,
                definitions: this.readCoreDefinitions(),
            },
            ...contributed.sources,
        ].sort((a, b) => {
            const priorityDifference = a.priority - b.priority;
            return priorityDifference !== 0
                ? priorityDifference
                : a.name.localeCompare(b.name);
        });

        const definitionsById = new Map<number, ShopDefinition>();
        let candidates = 0;
        let invalid = 0;
        for (const source of sources) {
            candidates += source.definitions.length;
            for (const raw of source.definitions) {
                const definition = this.toDefinition(raw, source.name);
                if (!definition) {
                    invalid++;
                    continue;
                }
                definitionsById.set(definition.getId(), definition);
            }
        }

        const definitions = Array.from(definitionsById.values());
        ShopDefinition.replace(definitions);
        console.info(
            `[shops] Loaded ${definitions.length} definitions from ` +
            `${sources.map((source) => source.name).join("+")} ` +
            `(candidates=${candidates}, invalid=${invalid})`
        );
        return contributed.failures === 0;
    }

    public file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "shops.json";
    }

    private readCoreDefinitions(): RawShopDefinition[] {
        const parsed: unknown = JSON.parse(fs.readFileSync(this.file(), "utf8"));
        if (!Array.isArray(parsed)) {
            throw new Error("shops.json must contain an array");
        }
        return parsed as RawShopDefinition[];
    }

    private toDefinition(raw: RawShopDefinition, source: string): ShopDefinition | null {
        const id = Number(raw?.id);
        if (!Number.isInteger(id) || id < 0) {
            return null;
        }

        const defaultRestockTicks =
            this.parseTicks(raw.defaultRestockTicks) ??
            this.parseTicks(raw.restockTicks) ??
            ShopDefinitionLoader.DEFAULT_STOCK_CHANGE_TICKS;
        const defaultDestockTicks =
            this.parseTicks(raw.defaultDestockTicks) ?? defaultRestockTicks;
        const soldItemDestockTicks =
            this.parseTicks(raw.soldItemDestockTicks) ??
            ShopDefinitionLoader.GENERAL_STORE_SOLD_ITEM_DESTOCK_TICKS;

        const stock: ShopStockDefinition[] = [];
        if (Array.isArray(raw.originalStock)) {
            for (const entry of raw.originalStock as RawShopStockDefinition[]) {
                const itemId = Number(entry?.id);
                const amount = this.normalizeAmount(entry?.amount ?? 1);
                if (!Number.isInteger(itemId) || itemId <= 0 || amount <= 0) {
                    continue;
                }
                const price = Number(entry?.price);
                stock.push({
                    id: itemId,
                    amount,
                    restockTicks:
                        this.parseTicks(entry.restockTicks) ??
                        this.parseTicks(entry.restockTime) ??
                        this.parseTicks(entry.restock),
                    price: Number.isFinite(price) && price > 0
                        ? Math.floor(price)
                        : null,
                });
            }
        }

        const name = typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : "Shop";
        const currency = typeof raw.currency === "string" && raw.currency.trim()
            ? raw.currency.trim().toUpperCase()
            : "COINS";
        return new ShopDefinition(
            id,
            name,
            currency,
            stock,
            defaultRestockTicks,
            defaultDestockTicks,
            soldItemDestockTicks,
            source
        );
    }

    private normalizeAmount(value: unknown): number {
        const amount = Number(value);
        return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    }

    private parseTicks(value: unknown): number | null {
        if (Number.isFinite(value)) {
            const ticks = Math.floor(Number(value));
            return ticks > 0 ? ticks : null;
        }
        if (typeof value !== "string" || !value.trim()) {
            return null;
        }

        const tickMatch = value.trim().match(/(\d+)\s*t\b/i);
        if (tickMatch) {
            const ticks = Number.parseInt(tickMatch[1], 10);
            return Number.isFinite(ticks) && ticks > 0 ? ticks : null;
        }
        const minuteMatch = value.trim().match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/i);
        if (minuteMatch) {
            const minutes = Number.parseFloat(minuteMatch[1]);
            return Number.isFinite(minutes) && minutes > 0
                ? Math.max(1, Math.round((minutes * 60) / 0.6))
                : null;
        }
        const secondMatch = value.trim().match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i);
        if (secondMatch) {
            const seconds = Number.parseFloat(secondMatch[1]);
            return Number.isFinite(seconds) && seconds > 0
                ? Math.max(1, Math.round(seconds / 0.6))
                : null;
        }
        return null;
    }
}
