import { Player } from "../../entity/impl/player/Player";
import { DynamicDialogueBuilder } from "./builders/DynamicDialogueBuilder";
import { DialogueBuilder } from "./builders/DialogueBuilder";
import { Dialogue } from "./entries/Dialogue";
import { TestStaticDialogue } from '../../model/dialogues/builders/impl/TestStaticDialogue'
import { BankerDialogue } from "./builders/impl/BankedDialogue";
import { NieveDialogue } from "./builders/impl/NieveDialogue";
import { ParduDialogue } from "./builders/impl/ParduDialogue";
import { DialogueOption } from "./DialogueOption";
import { OptionsDialogue } from "./entries/impl/OptionsDialogue";
import { OptionDialogue } from "./entries/impl/OptionDialogue";
import { DialogueExpression } from "./DialogueExpression";
import { DialogueIdentifiers } from "../../../util/DialogueIdentifiers";

interface StaticDialogueDefinition {
    create: () => DialogueBuilder;
    startIndex: number;
}

/** A single dialogue, or a pool of variants to pick from at random - for
 * generic NPCs (villagers etc.) that say one of several different lines
 * rather than always the same fixed conversation. */
type StaticDialogueEntry = StaticDialogueDefinition | StaticDialogueDefinition[];

export class DialogueManager {
    public static readonly STATIC_DIALOGUES: Map<number, StaticDialogueEntry> = new Map([
        [DialogueIdentifiers.TEST, { create: () => new TestStaticDialogue(), startIndex: 0 }],
        [DialogueIdentifiers.BANKER, { create: () => new BankerDialogue(), startIndex: 0 }],
        [DialogueIdentifiers.PERDU, { create: () => new ParduDialogue(), startIndex: 0 }],
        [DialogueIdentifiers.NIEVE, { create: () => new NieveDialogue(), startIndex: 0 }],
        [DialogueIdentifiers.NIEVE_ASSIGNMENT, { create: () => new NieveDialogue(), startIndex: 2 }],
        [2814, { create: () => new LumbridgeShopAssistant(), startIndex: 0}],
        [2813, { create: () => new LumbridgeShopKeeper(), startIndex: 0}],
    ]);

    private readonly player: Player;

    /**
     * A {@link Map} which holds all of the current dialogue entries and indexes.
     */
    private dialogues: Map<number, Dialogue> = new Map<number, Dialogue>();

    /**
     * The current dialogue's index.
     */
    private index: number;

    /**
     * Creates a new {@link DialogueManager} for the given {@link Player}.
     *
     * @param player
     */
    constructor(player: Player) {
        this.player = player;
    }

    /**
     * Resets all of the attributes of the {@link DialogueManager}.
     */
    public reset() {
        this.dialogues.clear();
        this.index = -1;
    }

    public isActive(): boolean {
        return this.dialogues.has(this.index);
    }

    public canContinue(widgetId: number): boolean {
        return this.isActive() && this.player.getPacketSender().isChatboxInterface(widgetId >>> 16);
    }

    /**
     * Advances, starting the next dialogue.
     */
    public advance() {
        let current = this.dialogues.get(this.index);
        if (current == null) {
            this.reset();
            this.player.getPacketSender().sendInterfaceRemoval();
            return;
        }

        let continueAction = current.getContinueAction();
        if (continueAction != null) {
            // This dialogue has a custom continue action
            // Clear the old entry before executing it. Actions are allowed to
            // start a new dialogue; resetting afterwards would erase that new
            // dialogue immediately.
            this.reset();
            continueAction.execute(this.player);
            return;
        }

        this.startDialogue(this.index + 1);
    }

    public startDialogue(index: number) {
        this.index = index;
        this.startDialogueOption();
    }

    public startStaticDialogue(id: number): boolean {
        const entry = DialogueManager.STATIC_DIALOGUES.get(id);
        if (!entry) {
            return false;
        }
        const definition = Array.isArray(entry)
        ? entry[Math.floor(Math.random() * entry.length)]
        : entry;
        this.startDialog(definition.create(), definition.startIndex);
        return true;
    }

    public startDialogues(builder: DialogueBuilder) {
        this.startDialog(builder, 0);
    }

    public startDialog(builder: DialogueBuilder, index: number): DialogueExpression {
        if (builder instanceof DynamicDialogueBuilder) {
            (builder as DynamicDialogueBuilder).build(this.player);
        }
        this.startDialogueMap(builder.getDialogues(), index);

        return new DialogueExpression(index);
    }

    private startDialogueMap(entries: Map<number, Dialogue>, index: number) {
        this.reset();
        this.dialogues.clear();
        entries.forEach((value, key) => {
            this.dialogues.set(key, value);
        });
        this.index = index;
        this.startDialogueOption();
    }

    private startDialogueOption() {
        const dialogue = this.dialogues.get(this.index);
        if (!dialogue) {
            this.player.getPacketSender().sendInterfaceRemoval();
            return;
        }
        dialogue.send(this.player);
    }

    public handleOption(option: DialogueOption): void {
        const dialogue = this.dialogues.get(this.index);
        if (dialogue instanceof OptionsDialogue) {
            (dialogue as OptionsDialogue).execute(option, this.player);
            return;
        }
        if (!(dialogue instanceof OptionDialogue)) {
            this.player.getPacketSender().sendInterfaceRemoval();
            return;
        }
        (dialogue as OptionDialogue).execute(option, this.player);
    }

    }
