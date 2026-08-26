
import { Player } from "../../entity/impl/player/Player"
import { NPC } from "../../entity/impl/npc/NPC"
import { Music } from "../../Music";
import { Misc } from "../../../util/Misc";
import { Quest } from "./Quest";
import { CooksAssistant } from "./impl/CooksAssistant";

export class QuestHandler {
    public static NOT_STARTED = 0;

    public static updateQuestTab(player: Player) {
        player.getPacketSender().sendString("QP: " + player.getQuestPoints() + " ", 3985);

        const questRecords = Object.values(Quests)
            .filter((record): record is Quests => record instanceof Quests);
        const questRows = [];
        let slot = 0;

        // The client creates a heading row before the quest rows. Keep the
        // server slot numbers aligned with those dynamic children so clicks
        // can be resolved back to the same quest.
        if (questRecords.length > 0) {
            slot++;
        }

        for (const questRecord of questRecords) {
            const quest = questRecord.get();
            const progress = questRecord.getProgress(player);
            const status = progress === QuestHandler.NOT_STARTED
                ? 1 // side-journal client: not started
                : progress >= quest.completeStatus()
                    ? 2 // side-journal client: complete
                    : 0; // side-journal client: in progress

            player.getPacketSender().sendString(
                questRecord.getProgressColor(player) + questRecord.getName(),
                quest.questTabStringId(),
            );
            questRows.push({
                slot: slot++,
                status,
                key: `quest-${quest.questTabButtonId()}`,
                displayName: questRecord.getName(),
            });
        }

        player.getPacketSender().sendQuestList([{
            title: "Free Quests",
            quests: questRows,
        }]);
    }

    public static handleQuestListClick(player: Player, slot: number, action: number): boolean {
        if (!player || !Number.isInteger(slot) || slot < 0 || action !== 2) {
            return false;
        }

        const questRecords = Object.values(Quests)
            .filter((record): record is Quests => record instanceof Quests);
        let currentSlot = questRecords.length > 0 ? 1 : 0;
        for (const questRecord of questRecords) {
            if (currentSlot === slot) {
                questRecord.get().showQuestLog(player, questRecord.getProgress(player));
                return true;
            }
            currentSlot++;
        }
        return false;
    }

    public static firstClickNpc(player: Player, npc: NPC) {
        for (const questRecord of Object.values(Quests)
            .filter((record): record is Quests => record instanceof Quests)) {
            if (questRecord.get().firstClickNpc(player, npc)) {
                return true;
            }
        }

        // Return false if no Quest handled this NPC click
        return false;
    }
}

export class Quests {

    public static COOKS_ASSISTANT = new Quests("Cook's Assistant", new CooksAssistant());

    public readonly name: string;
	public readonly quest: Quest;
    private readonly progressKey: number;


    constructor(name: string, quest: Quest) {
        this.name = name;
        this.quest = quest;
        this.progressKey = quest.questTabButtonId();
    }

    public getName(): string {
        return this.name;
    }

    public get(): Quest {
        return this.quest;
    }

    public getQuest(): Quest {
        return this.quest;
    }

    public static getProgress(player: Player) {
        return Quests.COOKS_ASSISTANT.getProgress(player);
    }

    public getProgress(player: Player): number {
        return player.getQuestProgress().get(this.progressKey) ?? QuestHandler.NOT_STARTED;
    }

    public getQuestProgress(player: Player, questIndex: number): number {
        if (!player.getQuestProgress().has(questIndex)) {
            return 0;
        }
        return player.getQuestProgress().get(questIndex);
    }

    public setProgress(player: Player, progress: number) {
        player.getQuestProgress().set(this.progressKey, progress);
        QuestHandler.updateQuestTab(player);
    }

    public setQuestProgress(player: Player, questIndex: number, progress: number): void {
        player.getQuestProgress().set(questIndex, progress);
        QuestHandler.updateQuestTab(player);
    }

    /**
    
    Gets the progress colour for the Quest tab for the given quest.
    
    @param player The player to check status for
    
    @return progressColor The status colour prefix, e.g. "@red@"
    */
    public getProgressColor(player: Player): string {
        const questProgress = this.getProgress(player);
        if (questProgress == 0) {
            return "@red@";
        }

        const completeProgress = this.get().completeStatus();
        if (questProgress < completeProgress) {
            return "@yel@";
        }

        return "@gre@";
    }

    public static forButton(button: number): Quests | null {
        for (const q of Object.values(Quests)) {
            if (q.get().questTabButtonId() === button) {
                return q;
            }
        }
        return null;
    }

    public static getOrdinal(quest: Quest): number {
        const questRecords = Object.values(Quests)
            .filter((record): record is Quests => record instanceof Quests);
        for (let ordinal = 0; ordinal < questRecords.length; ordinal++) {
            const q = questRecords[ordinal];
            if (q.get() === quest) {
                return ordinal;
            }
        }
        return -1;
    }

    public showRewardInterface(player: Player, lines: string[], itemID: number): void {
        const questName: string = this.getName();

        const questCompleteJingles = Music.QUEST_COMPLETE_JINGLES;
        player
            .getPacketSender()
            .sendJingle(questCompleteJingles[Misc.getRandom(questCompleteJingles.length - 1)], 0);
        player.getPacketSender().sendString(`You have completed + ${ questName } !`, 12144);
        player.getPacketSender().sendString(`${ this.get().questPointsReward() } `, 12147);

        for (let i = 0; i < 5; i++) {
            player.getPacketSender().sendString(lines[i], 12150 + i);
        }

        if (itemID > 0) {
            player.getPacketSender().sendInterfaceModel(12145, itemID, 250);
        }

        player.getPacketSender().sendInterface(12140);
    }

    public static handleQuestButtonClick(player: Player, buttonId: number): boolean {
        let quest = Quests.forButton(buttonId);
        if (quest == null) {
            // There is no quest for this button ID
            return false;
        }

        const status: number = quest.getProgress(player);
        quest.get().showQuestLog(player, status);
        return true;
    }

    /**
     
    This function blanks out all lines on the Quest log interface.
    @param player
    */
    public static clearQuestLogInterface(player: Player): void {
        for (let i = 8144; i < 8195; i++) {
            player.getPacketSender().sendString("", i);
        }
    }
}

