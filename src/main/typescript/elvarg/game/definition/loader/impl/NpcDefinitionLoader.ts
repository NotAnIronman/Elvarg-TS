import fs = require("fs");
import path = require("path");
import { CacheDefinitions } from "../../../cache/CacheDefinitions";
import { GameConstants } from "../../../GameConstants";
import { NpcDefinition } from "../../NpcDefinition";
import { DefinitionLoader } from "../DefinitionLoader";

type CombatStats = {
    name?: string;
    hitpoints?: number;
    attackLevel?: number;
    strengthLevel?: number;
    defenceLevel?: number;
    rangedLevel?: number;
    magicLevel?: number;
    attackSpeed?: number;
    maxHit?: number;
    aggressive?: boolean;
    poisonous?: boolean;
    slayerLevel?: number;
    aggressiveRadius?: number;
    defenceBonuses?: {
        stab?: number;
        slash?: number;
        crush?: number;
        magic?: number;
        ranged?: number;
    };
};

type CombatAnimation = {
    name?: string;
    anims?: { attack?: number; block?: number; death?: number };
};

const normalizeName = (value?: string) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export class NpcDefinitionLoader extends DefinitionLoader {
    load(): boolean {
        NpcDefinition.definitions.clear();
        const directory = path.resolve(GameConstants.DEFINITIONS_DIRECTORY);
        const stats = this.read(directory, "npc-combat-stats.json").npcs ?? {};
        const animationFile = this.read(directory, "npc-combat-defs.json");
        const aggression = this.read(directory, "npc-aggression.json").npcs ?? {};
        const animations: Record<string, CombatAnimation> = {};

        for (const row of animationFile.refs?.npcs ?? []) {
            const [id, attack, block, death] = row;
            animations[String(id)] = { anims: { attack, block, death } };
        }
        Object.assign(animations, animationFile.npcs ?? {});

        const ids = new Set([...Object.keys(stats), ...Object.keys(animations), ...Object.keys(aggression)]);
        let applied = 0;
        let mismatched = 0;
        const count = CacheDefinitions.getCounts().npcs;
        for (const key of ids) {
            const id = Number(key);
            if (!Number.isInteger(id) || id < 0 || id >= count) continue;
            const cached = CacheDefinitions.getNpc(id);
            const definition = NpcDefinition.forId(id) as any;
            const stat = stats[key] as CombatStats | undefined;
            if (stat && normalizeName(stat.name) === normalizeName(cached.name)) {
                const levels = definition.getStats().slice();
                for (const [index, value] of [
                    [0, stat.attackLevel], [1, stat.strengthLevel], [2, stat.defenceLevel],
                    [3, stat.rangedLevel], [4, stat.magicLevel],
                    [10, stat.defenceBonuses?.stab], [11, stat.defenceBonuses?.slash],
                    [12, stat.defenceBonuses?.crush], [13, stat.defenceBonuses?.magic],
                    [14, stat.defenceBonuses?.ranged],
                ]) {
                    if (Number.isFinite(value)) levels[index] = Math.trunc(value as number);
                }
                Object.assign(definition, {
                    stats: levels,
                    hitpoints: stat.hitpoints ?? definition.getHitpoints(),
                    attackSpeed: stat.attackSpeed ?? definition.getAttackSpeed(),
                    maxHit: stat.maxHit ?? definition.getMaxHit(),
                    aggressive: stat.aggressive ?? definition.isAggressive(),
                    poisonous: stat.poisonous ?? definition.isPoisonous(),
                    slayerLevel: stat.slayerLevel ?? definition.getSlayerLevel(),
                    combatFollowDistance: stat.aggressiveRadius ?? definition.getCombatFollowDistance(),
                });
                applied++;
            } else if (stat) {
                mismatched++;
            }

            const animation = animations[key];
            if (animation && (!animation.name || normalizeName(animation.name) === normalizeName(cached.name))) {
                Object.assign(definition, {
                    attackAnim: animation.anims?.attack ?? definition.getAttackAnim(),
                    defenceAnim: animation.anims?.block ?? definition.getDefenceAnim(),
                    deathAnim: animation.anims?.death ?? definition.getDeathAnim(),
                });
            } else if (animation) {
                mismatched++;
            }

            if (typeof aggression[key]?.aggressive === "boolean") {
                definition.aggressive = aggression[key].aggressive;
            }
        }
        console.info(`[npc-definitions] cache-backed; server profiles applied=${applied}, mismatched=${mismatched}`);
        return true;
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY;
    }

    private read(directory: string, name: string): any {
        return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    }
}
