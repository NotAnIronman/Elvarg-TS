"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpawnItemPacketListener = void 0;
// import { EnteredAmountAction } from "../../../game/model/EnteredAmountAction";
class SpawnItemPacketListener {
    // static spawn(player: Player, item: number, amount: number, toBank: boolean) {
    static spawn(player, item, amount, toBank) {
        if (amount < 0) {
            return;
        }
        else if (amount > Number.MAX_SAFE_INTEGER) {
            amount = Number.MAX_SAFE_INTEGER;
        }
        // if (player.busy() || player.getArea() instanceof WildernessArea) {
        //     player.getPacketSender().sendMessage("You cannot do that right now.");
        //     return;
        // }
        // let spawnable = Array.from(GameConstants.ALLOWED_SPAWNS).includes(item);
        // let def = ItemDefinition.forId(item);
        // if (!def || !spawnable) {
        //     player.getPacketSender().sendMessage("This item is currently unavailable.");
        //     return;
        // }
        if (toBank) {
            // player.getBank(Bank.getTabForItem(player, item)).adds(item, amount);
        }
        else {
            if (amount > player.getInventory().getFreeSlots()) {
                amount = player.getInventory().getFreeSlots();
            }
            if (amount <= 0) {
                player.getInventory().full();
                return;
            }
            player.getInventory().adds(item, amount);
        }
        player.getPacketSender().sendMessage(
        // `Spawned ${def.getName()} to ${toBank ? "bank" : "inventory"}.`
        `Spawned to ${toBank ? "bank" : "inventory"}.`);
    }
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let item = packet.readInt();
        let spawnX = packet.readByte() == 1;
        let toBank = packet.readByte() == 1;
        // let def = ItemDefinition.forId(item);
        // if (!def) {
        //     player.getPacketSender().sendMessage("This item is currently unavailable.");
        //     return;
        // }
        if (spawnX) {
            player.setEnteredAmountAction(new SpawnEntered((amount) => {
                SpawnItemPacketListener.spawn(player, item, amount, toBank);
            }));
            player.getPacketSender().sendEnterAmountPrompt(
            //   `How many ${def.getName()} would you like to spawn?`
            `How many  would you like to spawn?`);
        }
        else {
            SpawnItemPacketListener.spawn(player, item, 1, toBank);
        }
    }
}
exports.SpawnItemPacketListener = SpawnItemPacketListener;
// class SpawnEntered implements EnteredAmountAction{
class SpawnEntered {
    constructor(execFunc) {
        this.execFunc = execFunc;
    }
    execute(amount) {
        this.execFunc();
    }
}
//# sourceMappingURL=SpawnItemPacketListener.js.map