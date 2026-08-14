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
    anims?: { attack?: number; block?: number; death?: number };
    sounds?: { death?: number };
};

type CombatAnimationRole = keyof NonNullable<CombatAnimation["anims"]>;

const ANIMATION_FALLBACKS: Record<number, CombatAnimation> = {
    7: { anims: { attack: 6184, block: 6188, death: 6182 } },
    15: { anims: { attack: 390, block: 391, death: 392 } },
};

const normalizeName = (value?: string) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export class NpcDefinitionLoader extends DefinitionLoader {
    load(): boolean {
        NpcDefinition.definitions.clear();
        const directory = path.resolve(GameConstants.DEFINITIONS_DIRECTORY);
        const stats = this.read(directory, "npc-combat-stats.json").npcs ?? {};
        const animationFile = this.read(directory, "npc-combat-defs.json");
        const observedAnimations = this.read(directory, "npc-animations.json") as Record<string, number[]>;
        const aggression = this.read(directory, "npc-aggression.json").npcs ?? {};
        const animations: Record<string, CombatAnimation> = {};

        for (const row of animationFile.refs?.npcs ?? []) {
            const [id, attack, block, death] = row;
            animations[String(id)] = { anims: { attack, block, death } };
        }
        Object.assign(animations, animationFile.npcs ?? {});
        for (const [id, fallback] of Object.entries(ANIMATION_FALLBACKS)) {
            if (!animations[id]) animations[id] = fallback;
        }
        const configuredAnimationIds = new Set(Object.keys(animations));

        const roleByAnimation = new Map<number, CombatAnimationRole>();
        for (const animation of Object.values(animations)) {
            for (const role of ["attack", "block", "death"] as const) {
                const id = animation.anims?.[role];
                if (Number.isInteger(id)) roleByAnimation.set(id!, role);
            }
        }
        let inferredAnimations = 0;
        let guessedAnimations = 0;
        for (const [npcId, observed] of Object.entries(observedAnimations)) {
            if (!Array.isArray(observed) || observed.length === 0) continue;
            const inferred: NonNullable<CombatAnimation["anims"]> = {};
            for (const animationId of observed) {
                const role = roleByAnimation.get(animationId);
                if (role && inferred[role] === undefined) inferred[role] = animationId;
            }
            const explicit = animations[npcId]?.anims ?? {};
            const resolved = { ...inferred, ...explicit };
            inferredAnimations += Object.keys(inferred).length;
            if (!configuredAnimationIds.has(npcId)) {
                const ids = Array.from(new Set(observed.filter((id) => Number.isInteger(id) && id >= 0)));
                const indexes = ids.map((_, index) => index);
                const preferences: Record<CombatAnimationRole, number[]> = {
                    attack: ids.length <= 2 ? indexes : [1, ...indexes.filter((index) => index !== 1)],
                    block: indexes,
                    death: ids.length >= 3 ? [...indexes].reverse() : [],
                };
                const used = new Set(Object.values(resolved));
                for (const role of ["attack", "block", "death"] as const) {
                    if (resolved[role] !== undefined) continue;
                    const guess = preferences[role].map((index) => ids[index]).find((id) => !used.has(id));
                    if (guess === undefined) continue;
                    resolved[role] = guess;
                    used.add(guess);
                    guessedAnimations++;
                }
            }
            if (Object.keys(resolved).length > 0) animations[npcId] = { ...animations[npcId], anims: resolved };
        }

        const ids = new Set([
            ...Object.keys(stats), ...Object.keys(animations), ...Object.keys(observedAnimations),
            ...Object.keys(aggression),
        ]);
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
            if (animation) {
                Object.assign(definition, {
                    attackAnim: animation.anims?.attack ?? definition.getAttackAnim(),
                    defenceAnim: animation.anims?.block ?? definition.getDefenceAnim(),
                    deathAnim: animation.anims?.death ?? definition.getDeathAnim(),
                    deathSound: animation.sounds?.death ?? definition.getDeathSound(),
                });
            }
            if (typeof aggression[key]?.aggressive === "boolean") {
                definition.aggressive = aggression[key].aggressive;
            }
        }
        console.info(
            `[npc-definitions] cache-backed; configured stats applied=${applied}, mismatched=${mismatched}, ` +
            `service animations inferred=${inferredAnimations}, guessed=${guessedAnimations}`
        );
        return true;
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY;
    }

    private read(directory: string, name: string): any {
        return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    }
}
