import { Dialogue } from "../Dialogue";
import { Player } from "../../../../entity/impl/player/Player";
import { DialogueExpression } from "../../DialogueExpression";
import { Misc } from "../../../../../util/Misc";
import { NpcDefinition } from "../../../../definition/NpcDefinition";
import { DialogueAction } from '../../../../model/dialogues/DialogueAction'

export class NpcDialogue extends Dialogue {
    private static readonly GROUP_ID = 231;
    private static readonly HEAD_UID = (NpcDialogue.GROUP_ID << 16) | 2;
    private static readonly NAME_UID = (NpcDialogue.GROUP_ID << 16) | 4;
    private static readonly TEXT_UID = (NpcDialogue.GROUP_ID << 16) | 6;
    private npcId: number;
    private text: string;
    private expression: DialogueExpression;

    constructor(index: number, npcId: number, text: string, expression: DialogueExpression);
    constructor(index: number, npcId: number, text: string);
    constructor(index: number, npcId: number, text: string, expression: DialogueExpression, continueAction: DialogueAction);

    constructor(index: number, npcId: number, text: string, expression?: DialogueExpression, continueAction?: DialogueAction) {
        super(index);
        this.npcId = npcId;
        this.text = text;
        this.expression = expression || DialogueExpression.CALM;
        if (continueAction) {
            this.setContinueAction(continueAction);
        }
    }
    public send(player: Player): void {
        NpcDialogue.send(player, this.npcId, this.text, this.expression);
    }
    
    public static send(player: Player, npcId: number, text: string, expression: DialogueExpression): void {
        const sender = player.getPacketSender();
        sender
            .sendChatboxInterface(NpcDialogue.GROUP_ID)
            .sendNpcHeadOnInterface(npcId, NpcDialogue.HEAD_UID)
            .sendInterfaceAnimation(NpcDialogue.HEAD_UID, expression.getExpression())
            .sendString(
                NpcDefinition.forId(npcId)?.getName()?.replace(/_/g, " ") || "",
                NpcDialogue.NAME_UID
            )
            .sendString(Misc.wrapText(text, 53).slice(0, 4).join("<br>"), NpcDialogue.TEXT_UID);
    }

    public static sendStatement(player: Player, npcId: number, lines: string[], expression: DialogueExpression): void {
        NpcDialogue.send(player, npcId, lines.join(" "), expression);
    }
}
