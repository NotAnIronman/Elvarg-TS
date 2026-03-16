import { Player } from "../entity/impl/player/Player";
import { Skill } from "../model/Skill";
import { PrayerHandler } from "./PrayerHandler";
import { PrayerData } from "./PrayerHandler";

export class QuickPrayers {
    private static readonly PRAYER_VALUES: PrayerData[] = Array.from(PrayerData.values());
    private static get PRAYER_HANDLER() {
        return PrayerHandler;
    }
    public static get THICK_SKIN() {
        return QuickPrayers.PRAYER_HANDLER.THICK_SKIN;
    }
    public static get ROCK_SKIN() {
        return QuickPrayers.PRAYER_HANDLER.ROCK_SKIN;
    }
    public static get STEEL_SKIN() {
        return QuickPrayers.PRAYER_HANDLER.STEEL_SKIN;
    }
    public static get BURST_OF_STRENGTH() {
        return QuickPrayers.PRAYER_HANDLER.BURST_OF_STRENGTH;
    }
    public static get SUPERHUMAN_STRENGTH() {
        return QuickPrayers.PRAYER_HANDLER.SUPERHUMAN_STRENGTH;
    }
    public static get ULTIMATE_STRENGTH() {
        return QuickPrayers.PRAYER_HANDLER.ULTIMATE_STRENGTH;
    }
    public static get CLARITY_OF_THOUGHT() {
        return QuickPrayers.PRAYER_HANDLER.CLARITY_OF_THOUGHT;
    }
    public static get IMPROVED_REFLEXES() {
        return QuickPrayers.PRAYER_HANDLER.IMPROVED_REFLEXES;
    }
    public static get INCREDIBLE_REFLEXES() {
        return QuickPrayers.PRAYER_HANDLER.INCREDIBLE_REFLEXES;
    }
    public static get SHARP_EYE() {
        return QuickPrayers.PRAYER_HANDLER.SHARP_EYE;
    }
    public static get HAWK_EYE() {
        return QuickPrayers.PRAYER_HANDLER.HAWK_EYE;
    }
    public static get EAGLE_EYE() {
        return QuickPrayers.PRAYER_HANDLER.EAGLE_EYE;
    }
    public static get MYSTIC_WILL() {
        return QuickPrayers.PRAYER_HANDLER.MYSTIC_WILL;
    }
    public static get MYSTIC_LORE() {
        return QuickPrayers.PRAYER_HANDLER.MYSTIC_LORE;
    }
    public static get MYSTIC_MIGHT() {
        return QuickPrayers.PRAYER_HANDLER.MYSTIC_MIGHT;
    }
    public static get CHIVALRY() {
        return QuickPrayers.PRAYER_HANDLER.CHIVALRY;
    }
    public static get PIETY() {
        return QuickPrayers.PRAYER_HANDLER.PIETY;
    }
    public static get RIGOUR() {
        return QuickPrayers.PRAYER_HANDLER.RIGOUR;
    }
    public static get AUGURY() {
        return QuickPrayers.PRAYER_HANDLER.AUGURY;
    }
    public static get PROTECT_FROM_MAGIC() {
        return QuickPrayers.PRAYER_HANDLER.PROTECT_FROM_MAGIC;
    }
    public static get PROTECT_FROM_MISSILES() {
        return QuickPrayers.PRAYER_HANDLER.PROTECT_FROM_MISSILES;
    }
    public static get PROTECT_FROM_MELEE() {
        return QuickPrayers.PRAYER_HANDLER.PROTECT_FROM_MELEE;
    }
    public static get RETRIBUTION() {
        return QuickPrayers.PRAYER_HANDLER.RETRIBUTION;
    }
    public static get REDEMPTION() {
        return QuickPrayers.PRAYER_HANDLER.REDEMPTION;
    }
    public static get SMITE() {
        return QuickPrayers.PRAYER_HANDLER.SMITE;
    }
    public static get DEFENCE_PRAYERS() {
        return QuickPrayers.PRAYER_HANDLER.DEFENCE_PRAYERS;
    }
    public static get STRENGTH_PRAYERS() {
        return QuickPrayers.PRAYER_HANDLER.STRENGTH_PRAYERS;
    }
    public static get ATTACK_PRAYERS() {
        return QuickPrayers.PRAYER_HANDLER.ATTACK_PRAYERS;
    }
    public static get RANGED_PRAYERS() {
        return QuickPrayers.PRAYER_HANDLER.RANGED_PRAYERS;
    }
    public static get MAGIC_PRAYERS() {
        return QuickPrayers.PRAYER_HANDLER.MAGIC_PRAYERS;
    }
    public static get OVERHEAD_PRAYERS() {
        return QuickPrayers.PRAYER_HANDLER.OVERHEAD_PRAYERS;
    }

    public static canUse(player: Player, prayer: PrayerData, msg: boolean): boolean {
        return PrayerHandler.canUse(player, prayer, msg);
    }

    public static isActivated(player: Player, prayerId: number): boolean {
        return PrayerHandler.isActivated(player, prayerId);
    }

    public static activatePrayerPrayerId(player: Player, prayerId: number): void {
        PrayerHandler.activatePrayerPrayerId(player, prayerId);
    }

    public static deactivatePrayer(player: Player, prayerId: number): void {
        PrayerHandler.deactivatePrayer(player, prayerId);
    }
    private static readonly TOGGLE_QUICK_PRAYERS = 1500;
    private static readonly SETUP_BUTTON = 1506;
    private static readonly CONFIRM_BUTTON = 17232;
    private static readonly QUICK_PRAYERS_TAB_INTERFACE_ID = 17200;
    private static readonly CONFIG_START = 620;

    private player: Player;
    public prayers: PrayerData[] = Array.from(
        { length: QuickPrayers.PRAYER_VALUES.length },
        () => null
    );
    private selectingPrayers: boolean;
    private enabled: boolean;

    constructor(player: Player) {
        this.player = player;
    }

    public sendChecks(): void {
        for (const prayer of QuickPrayers.PRAYER_VALUES) {
            this.sendCheck(prayer);
        }
    }

    private sendCheck(prayer: PrayerData): void {
        const prayerIndex = QuickPrayers.PRAYER_VALUES.indexOf(prayer);
        if (prayerIndex === -1) {
            return;
        }
        this.player
            .getPacketSender()
            .sendConfig(
                QuickPrayers.CONFIG_START + prayerIndex,
                this.prayers[prayerIndex] != null ? 0 : 1
            );
    }

    private uncheckSelect(toDeselect: number[], exception: number): void {
        for (const i of toDeselect) {
            if (i === exception) {
                continue;
            }
            this.uncheck(PrayerData.values()[i]);
        }
    }

    private uncheck(prayer: PrayerData): void {
        const prayerIndex = QuickPrayers.PRAYER_VALUES.indexOf(prayer);
        if (prayerIndex !== -1 && this.prayers[prayerIndex] != null) {
            this.prayers[prayerIndex] = null;
            this.sendCheck(prayer);
        }
    }

    private toggle(index: number): void {
        const prayer: PrayerData = QuickPrayers.PRAYER_VALUES[index];
        if (prayer == null) {
            return;
        }

        if (this.prayers[index] != null) {
            this.uncheck(prayer);
            return;
        }

        if (!QuickPrayers.canUse(this.player, prayer, true)) {
            this.uncheck(prayer);
            return;
        }

        this.prayers[index] = prayer;
        this.sendCheck(prayer);

        switch (index) {
            case QuickPrayers.THICK_SKIN:
            case QuickPrayers.ROCK_SKIN:
            case QuickPrayers.STEEL_SKIN:
                this.uncheckSelect(QuickPrayers.DEFENCE_PRAYERS, index);
                break;
            case QuickPrayers.BURST_OF_STRENGTH:
            case QuickPrayers.SUPERHUMAN_STRENGTH:
            case QuickPrayers.ULTIMATE_STRENGTH:
                this.uncheckSelect(QuickPrayers.STRENGTH_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.RANGED_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.MAGIC_PRAYERS, index);
                break;
            case QuickPrayers.CLARITY_OF_THOUGHT:
            case QuickPrayers.IMPROVED_REFLEXES:
            case QuickPrayers.INCREDIBLE_REFLEXES:
                this.uncheckSelect(QuickPrayers.ATTACK_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.RANGED_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.MAGIC_PRAYERS, index);
                break;
            case QuickPrayers.SHARP_EYE:
            case QuickPrayers.HAWK_EYE:
            case QuickPrayers.EAGLE_EYE:
            case QuickPrayers.MYSTIC_WILL:
            case QuickPrayers.MYSTIC_LORE:
            case QuickPrayers.MYSTIC_MIGHT:
                this.uncheckSelect(QuickPrayers.STRENGTH_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.ATTACK_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.RANGED_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.MAGIC_PRAYERS, index);
                break;
            case QuickPrayers.CHIVALRY:
            case QuickPrayers.PIETY:
            case QuickPrayers.RIGOUR:
            case QuickPrayers.AUGURY:
                this.uncheckSelect(QuickPrayers.DEFENCE_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.STRENGTH_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.ATTACK_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.RANGED_PRAYERS, index);
                this.uncheckSelect(QuickPrayers.MAGIC_PRAYERS, index);
                break;
            case QuickPrayers.PROTECT_FROM_MAGIC:
            case QuickPrayers.PROTECT_FROM_MISSILES:
            case QuickPrayers.PROTECT_FROM_MELEE:
                this.uncheckSelect(QuickPrayers.OVERHEAD_PRAYERS, index);
                break;
            case QuickPrayers.RETRIBUTION:
            case QuickPrayers.REDEMPTION:
            case QuickPrayers.SMITE:
                this.uncheckSelect(QuickPrayers.OVERHEAD_PRAYERS, index);
                break;
        }
    }

    public checkActive(): void {
        if (this.enabled) {
            for (const prayer of this.prayers) {
                if (prayer === null) continue;
                const prayerIndex = QuickPrayers.PRAYER_VALUES.indexOf(prayer);
                if (prayerIndex !== -1 && QuickPrayers.isActivated(this.player, prayerIndex)) {
                    return;
                }
            }
            this.enabled = false;
            this.player.getPacketSender().sendQuickPrayersState(false);
        }
    }


    public handleButton(button: number): boolean {
        switch (button) {
            case QuickPrayers.TOGGLE_QUICK_PRAYERS:
                if (this.player.getSkillManager().getCurrentLevel(Skill.PRAYER) <= 0) {
                    this.player.getPacketSender().sendMessage("You don't have enough Prayer points.");
                    return true;
                }
                if (this.enabled) {
                    for (const prayer of this.prayers) {
                        if (prayer === null) continue;
                        const prayerIndex = QuickPrayers.PRAYER_VALUES.indexOf(prayer);
                        if (prayerIndex !== -1) {
                            QuickPrayers.deactivatePrayer(this.player, prayerIndex);
                        }
                    }
                    this.enabled = false;
                } else {
                    let found = false;
                    for (const prayer of this.prayers) {
                        if (prayer === null) continue;
                        const prayerIndex = QuickPrayers.PRAYER_VALUES.indexOf(prayer);
                        if (prayerIndex !== -1) {
                            QuickPrayers.activatePrayerPrayerId(this.player, prayerIndex);
                            found = true;
                        }
                    }
                    if (!found) {
                        this.player.getPacketSender().sendMessage("You have not setup any quick-prayers yet.");
                    }
                    this.enabled = found;
                }
                this.player.getPacketSender().sendQuickPrayersState(this.enabled);
                break;
            case QuickPrayers.SETUP_BUTTON:
                if (this.selectingPrayers) {
                    this.player.getPacketSender().sendTabInterface(5, 5608).sendTab(5);
                    this.selectingPrayers = false;
                } else {
                    this.sendChecks();
                    this.player.getPacketSender().sendTabInterface(5, QuickPrayers.QUICK_PRAYERS_TAB_INTERFACE_ID).sendTab(5);
                    this.selectingPrayers = true;
                }
                break;
            case QuickPrayers.CONFIRM_BUTTON:
                if (this.selectingPrayers) {
                    this.player.getPacketSender().sendTabInterface(5, 5608);
                    this.selectingPrayers = false;
                }
                break;
        }
        if (button >= 17202 && button <= 17230) {
            if (this.selectingPrayers) {
                const index = button - 17202;
                this.toggle(index);
            }
            return true;
        }
        return false;
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    public getPrayers(): PrayerData[] {
        return this.prayers;
    }

    public setPrayers(prayers: PrayerData[]): void {
        const normalized = Array.from(
            { length: QuickPrayers.PRAYER_VALUES.length },
            (_, index) => prayers?.[index] ?? null
        );
        this.prayers = normalized;
    }
}
