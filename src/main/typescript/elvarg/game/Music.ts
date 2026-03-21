import { LostCityMidiId } from "./LostCityAudioIds";

export class Music {
    public static readonly SCAPE_RUNE = LostCityMidiId.SCAPE_MAIN;
    public static readonly OLD_THEME = LostCityMidiId.THEME;
    public static readonly HWEEN_THEME = LostCityMidiId.SPOOKY2;
    public static readonly XMAS_THEME = LostCityMidiId.SEA_SHANTY_XMAS;
    public static readonly FARMING_THEME = LostCityMidiId.GARDEN;
    public static readonly HUNTER_THEME = LostCityMidiId.HUNTING;
    public static readonly SUMMON_THEME = 457;

    public static readonly QUEST_COMPLETE_JINGLES: ReadonlyArray<number> = [
        LostCityMidiId.QUEST_COMPLETE_1,
        LostCityMidiId.QUEST_COMPLETE_2,
        LostCityMidiId.QUEST_COMPLETE_3,
    ];
}
