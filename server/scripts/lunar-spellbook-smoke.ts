import * as assert from "node:assert/strict";
import { LunarSpells } from "../src/main/typescript/elvarg/game/content/combat/magic/LunarSpells";
import { MagicSpellbook } from "../src/main/typescript/elvarg/game/model/MagicSpellbook";

function spellbookPlayer() {
    let runesDeleted = 0;
    let experience = 0;
    const inventory = {
        containsAllItem: () => true,
        deletes: () => { runesDeleted++; },
    };
    const player: any = {
        getSpellbook: () => MagicSpellbook.LUNAR,
        getSkillManager: () => ({
            getCurrentLevel: () => 99,
            getMaxLevel: () => 99,
            addExperiences: (_skill: unknown, xp: number) => { experience += xp; },
        }),
        getInventory: () => inventory,
        getEquipment: () => ({ getItems: () => Array.from({ length: 14 }, () => ({ getId: () => -1 })), containsAllItem: () => true, hasStaffEquipped: () => false }),
        getCombat: () => ({ reset: () => {}, setCastSpell: () => {}, setAutocastSpell: () => {}, getPoisonImmunityTimer: () => ({ start: () => {} }) }),
        performAnimation: () => {}, performGraphic: () => {},
        setPoisonDamage: () => {}, setVenomed: () => {},
        getPacketSender: () => ({ sendPoisonType: () => {}, sendMessage: () => {} }),
    };
    return { player, getRunesDeleted: () => runesDeleted, getExperience: () => experience };
}

const cure = spellbookPlayer();
assert.equal(LunarSpells.handleSelf(cure.player, "Cure Me"), true);
assert.equal(cure.getRunesDeleted(), 3, "Cure Me consumes its three rune requirements");
assert.equal(cure.getExperience(), 69);

const lunar: any = LunarSpells;
const requirements = (name: string) => Array.from(lunar.SELF.get(name).itemsRequired()).map((item: any) => [item.getId(), item.getAmount()]);
assert.deepEqual(requirements("cure me"), [[9075, 2], [564, 2], [563, 1]]);
assert.deepEqual(lunar.TELEPORTS.get("waterbirth teleport").itemsRequired().map((item: any) => [item.getId(), item.getAmount()]), [[9075, 1], [555, 2], [563, 1]]);

assert.equal(LunarSpells.handleSelf(cure.player, "not a lunar spell"), false);

console.info("Lunar spellbook support definitions OK");
