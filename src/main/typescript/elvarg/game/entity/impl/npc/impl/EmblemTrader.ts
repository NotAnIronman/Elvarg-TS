import { NPC } from "../NPC";
import { Player } from "../../player/Player";
import { EmblemTraderDialogue } from "../../../../model/dialogues/builders/impl/EmblemTraderDialogue"
import { NPCInteraction } from "../NPCInteraction"
import { ShopIdentifiers } from "../../../../../util/ShopIdentifiers"
const { openShopById } = require("../../../../../../../../../plugins/interface/Shops.plugin.js");

export class EmblemTrader implements NPCInteraction {

    public firstOptionClick(player: Player, npc: NPC): void {
        player.getDialogueManager().startDialogues(new EmblemTraderDialogue());
    }

    public secondOptionClick(player: Player, npc: NPC): void {
        openShopById(player, ShopIdentifiers.PVP_SHOP);
    }

    public thirdOptionClick(player: Player, npc: NPC): void {
        player.getDialogueManager().startDialog(new EmblemTraderDialogue(), 2);
    }

    public forthOptionClick(player: Player, npc: NPC): void {
        player.getDialogueManager().startDialog(new EmblemTraderDialogue(), 5);
    }

    public useItemOnNpc(player: Player, npc: NPC, itemId: number, slot: number): void {
        
    }
}
