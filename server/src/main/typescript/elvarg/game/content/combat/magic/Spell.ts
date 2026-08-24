import { Misc } from "../../../../util/Misc";
import { Mobile } from "../../../entity/impl/Mobile";
import { Player } from "../../../entity/impl/player/Player";
import { Equipment } from "../../../model/container/impl/Equipment";
import { Item } from "../../../model/Item";
import { MagicSpellbook } from "../../../model/MagicSpellbook";
import { Skill } from "../../../model/Skill";
import { PluginManager } from "../../../../plugins/PluginManager";

export abstract class Spell {

    abstract spellId(): number;
    abstract levelRequired(): number;
    abstract itemsRequired(player: Player): Item[];
    abstract equipmentRequired(player: Player): Item[];
    abstract startCast(cast: Mobile, castOn: Mobile): void
    abstract baseExperience();

    public getSpellbook(): MagicSpellbook {
        return MagicSpellbook.NORMAL;
    }

    public itemsToConsume(player: Player, items = this.itemsRequired(player)): Item[] {
        if (!Array.isArray(items) || PluginManager.emitSpellRuneBypass(
            player, this.getSpellbook(), this.spellId()
        ) === true) {
            return [];
        }
        return items.filter((item) => item != null && PluginManager.emitSpellRuneBypass(
            player, this.getSpellbook(), this.spellId(), item.id
        ) !== true);
    }

    canCast(player: Player, del: boolean): boolean {
        if (player.getSkillManager().getCurrentLevel(Skill.MAGIC) < this.levelRequired()) {
            player.getPacketSender().sendMessage(`You need a Magic level of ${this.levelRequired()} to cast this spell.`);
            player.getCombat().reset();
            return false;
        }

        if (
            PluginManager.emitSpellDisabled(
                player,
                this.getSpellbook(),
                this.spellId()
            ) === true
        ) {
            player.getCombat().setCastSpell(null);
            player.getCombat().reset();
            return false;
        }

        if (player.getSpellbook() !== this.getSpellbook()) {
            const { Autocasting } = require("./Autocasting");
            Autocasting.setAutocast(player, null);
            player.getCombat().setCastSpell(null);
            player.getCombat().reset();
            return false;
        }

        const items = this.itemsRequired(player);
        if (Array.isArray(items) && items.length > 0) {
            const itemsToConsume = this.itemsToConsume(player, items);

            if (!player.getInventory().containsAllItem(itemsToConsume)) {
                player.getPacketSender().sendMessage("You do not have the required items to cast this spell.");
                player.getCombat().setCastSpell(null);
                player.getCombat().reset();
                return false;
            }

            const equipment = this.equipmentRequired(player);
            if (Array.isArray(equipment) && equipment.length > 0 && !player.getEquipment().containsAllItem(equipment)) {
                player.getPacketSender().sendMessage("You do not have the required equipment to cast this spell.");
                player.getCombat().setCastSpell(null);
                player.getCombat().reset();
                return false;
            }

            if (del && player.getEquipment().getItems()[Equipment.WEAPON_SLOT].getId() == 11791) {
                if (Misc.getRandom(7) == 1) {
                    player.getPacketSender().sendMessage("Your Staff of the dead negated your runes for this cast.");
                    del = false;
                }
            }

            if (del) {
                let item: Item
                for (item of itemsToConsume) {
                    player.getInventory().deletes(item);
                }
            }

            if (del && player.getAttribute?.("lunar:spellbook-swap")) {
                player.setAttribute("lunar:spellbook-swap", null);
                MagicSpellbook.changeSpellbook(player, MagicSpellbook.LUNAR, true);
            }
        }

        return true;
    }

}
