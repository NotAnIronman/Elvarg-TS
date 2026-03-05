

import { CombatSpells } from "./CombatSpells";
import { Player } from "../../../entity/impl/player/Player";
import { MagicSpellbook } from "../../../model/MagicSpellbook";
import { ItemIdentifiers } from "../../../../util/ItemIdentifiers";
import { CombatSpell } from "./CombatSpell";
import { Spell } from "./Spell";
import { FightType } from "../FightType";
import { FightStyle } from "../FightStyle";
const getBonusManager = () => require("../../../model/equipment/BonusManager").BonusManager as typeof import("../../../model/equipment/BonusManager").BonusManager;
const getWeaponInterfaces = () => require("../WeaponInterfaces").WeaponInterfaces as typeof import("../WeaponInterfaces").WeaponInterfaces;




export class Autocasting {



    // Autocast buttons
    private static readonly REGULAR_AUTOCAST_BUTTON = 349;
    private static readonly DEFENSIVE_AUTOCAST_BUTTON = 24111;
    private static readonly CLOSE_REGULAR_AUTOCAST_BUTTON = 2004;
    private static readonly CLOSE_ANCIENT_AUTOCAST_BUTTON = 6161;
    private static readonly REGULAR_AUTOCAST_TAB = 1829;
    private static readonly ANCIENT_AUTOCAST_TAB = 1689;
    private static readonly IBANS_AUTOCAST_TAB = 12050;

    public static readonly ANCIENT_SPELL_AUTOCAST_STAFFS = new Set<number>([ItemIdentifiers.KODAI_WAND, ItemIdentifiers.MASTER_WAND,
    ItemIdentifiers.ANCIENT_STAFF, ItemIdentifiers.NIGHTMARE_STAFF, ItemIdentifiers.VOLATILE_NIGHTMARE_STAFF, ItemIdentifiers.ELDRITCH_NIGHTMARE_STAFF, ItemIdentifiers.TOXIC_STAFF_OF_THE_DEAD, ItemIdentifiers.ELDER_WAND, ItemIdentifiers.STAFF_OF_THE_DEAD, ItemIdentifiers.STAFF_OF_LIGHT]);

    public static readonly AUTOCAST_SPELLS: Map<number, CombatSpell> = new Map<number, CombatSpell>([
        [1830, CombatSpells.WIND_STRIKE],
        [1831, CombatSpells.WATER_STRIKE],
        [1832, CombatSpells.EARTH_STRIKE],
        [1833, CombatSpells.FIRE_STRIKE],
        [1834, CombatSpells.WIND_BOLT],
        [1835, CombatSpells.WATER_BOLT],
        [1836, CombatSpells.EARTH_BOLT],
        [1837, CombatSpells.FIRE_BOLT],
        [1838, CombatSpells.WIND_BLAST],
        [1839, CombatSpells.WATER_BLAST],
        [1840, CombatSpells.EARTH_BLAST],
        [1841, CombatSpells.FIRE_BLAST],
        [1842, CombatSpells.WIND_WAVE],
        [1843, CombatSpells.WATER_WAVE],
        [1844, CombatSpells.EARTH_WAVE],
        [1845, CombatSpells.FIRE_WAVE],
        [13189, CombatSpells.SMOKE_RUSH],
        [13241, CombatSpells.SHADOW_RUSH],
        // Web-client ancient autocast uses 13147 for Blood Rush.
        [13147, CombatSpells.BLOOD_RUSH],
        [13247, CombatSpells.BLOOD_RUSH],
        [6162, CombatSpells.ICE_RUSH],
        [13215, CombatSpells.SMOKE_BURST],
        [13267, CombatSpells.SHADOW_BURST],
        [13167, CombatSpells.BLOOD_BURST],
        [13125, CombatSpells.ICE_BURST],
        [13202, CombatSpells.SMOKE_BLITZ],
        [13254, CombatSpells.SHADOW_BLITZ],
        [13158, CombatSpells.BLOOD_BLITZ],
        [13114, CombatSpells.ICE_BLITZ],
        [13228, CombatSpells.SMOKE_BARRAGE],
        [13280, CombatSpells.SHADOW_BARRAGE],
        [13178, CombatSpells.BLOOD_BARRAGE],
        [13136, CombatSpells.ICE_BARRAGE],
    ]);

    public static handleAutocastTab(player: Player, actionButtonId: number) {
        if (Autocasting.AUTOCAST_SPELLS.has(actionButtonId)) {
            Autocasting.setAutocast(player, Autocasting.AUTOCAST_SPELLS.get(actionButtonId) ?? null);
            getWeaponInterfaces().assign(player);
            return true;
        }
        switch (actionButtonId) {
            case Autocasting.CLOSE_REGULAR_AUTOCAST_BUTTON:
            case Autocasting.CLOSE_ANCIENT_AUTOCAST_BUTTON:
                Autocasting.setAutocast(player, null); // When clicking cancel, remove autocast?
                player.getPacketSender().sendTabInterface(0, player.getWeapon().getInterfaceId());
                return true;
        }

        return false;
    }

    public static handleWeaponInterface(player: Player, actionButtonId: number) {
        if (actionButtonId != Autocasting.REGULAR_AUTOCAST_BUTTON && actionButtonId != Autocasting.DEFENSIVE_AUTOCAST_BUTTON) {
            return false;
        }
        if (player.getSpellbook() == MagicSpellbook.LUNAR) {
            player.getPacketSender().sendMessage("You can't autocast lunar spells.");
            return true;
        }

        if (!player.getEquipment().hasStaffEquipped()) {
            return true;
        }

        // Track autocast mode via staff fight style.
        // Defensive autocast maps to STAFF_FOCUS, regular autocast maps to STAFF_POUND.
        if (actionButtonId === Autocasting.DEFENSIVE_AUTOCAST_BUTTON) {
            player.setFightType(FightType.STAFF_FOCUS);
            player.getPacketSender().sendConfig(FightType.STAFF_FOCUS.getParentId(), FightType.STAFF_FOCUS.getChildId());
        } else if (actionButtonId === Autocasting.REGULAR_AUTOCAST_BUTTON) {
            player.setFightType(FightType.STAFF_POUND);
            player.getPacketSender().sendConfig(FightType.STAFF_POUND.getParentId(), FightType.STAFF_POUND.getChildId());
        }

        switch (player.getSpellbook()) {
            case MagicSpellbook.ANCIENT:
                if (!Autocasting.ANCIENT_SPELL_AUTOCAST_STAFFS.has(player.getEquipment().getWeapon().getId()) && player.getEquipment().getWeapon().getId() != ItemIdentifiers.AHRIMS_STAFF) {
                    // Ensure this is a staff capable of casting ancients. Ahrims staff can cast both regular and ancients.
                    player.getPacketSender().sendMessage("You can only autocast regular offensive spells with this staff.");
                    return true;
                }

                player.getPacketSender().sendTabInterface(0, Autocasting.ANCIENT_AUTOCAST_TAB);
                break;
            case MagicSpellbook.NORMAL:
                if (player.getEquipment().getWeapon().getId() == ItemIdentifiers.ANCIENT_STAFF) {
                    player.getPacketSender().sendMessage("You can only autocast ancient magicks with that.");
                    return true;
                }

                player.getPacketSender().sendTabInterface(0, Autocasting.REGULAR_AUTOCAST_TAB);
                break;
        }

        player.getPacketSender().sendMessage("You can set a default autocast spell any time from the magic tab.");
        return true;
    }

    public static toggleAutocast(player: Player, actionButtonId: number) {
        let cbSpell: CombatSpell | null = null;
        try {
            cbSpell = CombatSpells.getCombatSpell(actionButtonId);
        } catch (_err) {
            // Some legacy/incomplete spell definitions can throw while resolving by id.
            // For unrelated interface buttons we should simply ignore and let other handlers run.
            return false;
        }
        if (!cbSpell) {
            return false;
        }
        if (player.getCombat().getAutocastSpell() != null && player.getCombat().getAutocastSpell() == cbSpell) {

            //Player is already autocasting this spell. Turn it off.
            Autocasting.setAutocast(player, null);

        } else {

            // OSRS behavior: selecting an autocast spell is allowed even if current Magic
            // level is below requirement. Cast checks happen when combat tries to cast.
            Autocasting.setAutocast(player, cbSpell);

        }

        return true;
    }

    public static setAutocast(player: Player, spell: CombatSpell) {
        // First, set the Player's preferred autocast spell
        player.getCombat().setAutocastSpell(spell);

        if (!player.getEquipment().hasStaffEquipped() && spell != null) {
            player.getPacketSender().sendMessage("Default spell set. Please equip a staff to use autocast.");
            return;
        }

        const defensiveAutocast = player.getFightType()?.getStyle?.() == FightStyle.DEFENSIVE;

        if (spell == null) {
            // No autocast selected: clear both regular/defensive mode bits.
            player.getPacketSender().sendAutocastId(-1).sendConfig(108, 0);
        } else {
            const autocastButtonId = Autocasting.resolveAutocastButtonId(spell);
            // Interface cache truth (widgets 349/24111):
            // 108 == 1 -> regular autocast button highlighted
            // 108 == 2 -> defensive autocast button highlighted
            // 108 == 3 -> no autocast selected
            // Client highlights the currently selected autocast by matching this id
            // against spell button widget ids in the autocast tab, not spell ids.
            player.getPacketSender().sendAutocastId(autocastButtonId).sendConfig(108, defensiveAutocast ? 2 : 1);
        }

        getBonusManager().update(player);
        Autocasting.updateConfigsOnAutocast(player, spell != null);
    }

    private static updateConfigsOnAutocast(player: Player, autocast: boolean) {
        if (autocast) {
            const currentStyle = player.getFightType()?.getChildId?.();
            const childId = Number.isInteger(currentStyle) ? currentStyle : FightType.STAFF_POUND.getChildId();
            // Keep the weapon style config aligned with selected autocast mode (regular vs defensive).
            // Sending `3` here forces the plain autocast visual state in some client builds.
            player.getPacketSender().sendConfig(FightType.STAFF_BASH.getParentId(), childId);
        }
    }

    private static resolveAutocastButtonId(spell: CombatSpell): number {
        for (const [buttonId, mappedSpell] of Autocasting.AUTOCAST_SPELLS.entries()) {
            if (mappedSpell === spell) {
                return buttonId;
            }
        }
        // Fallback keeps behavior stable if a spell is missing from the button map.
        return spell?.spellId?.() ?? -1;
    }




}
