// import { Player } from "../../../game/entity/impl/player/Player";
// import { WildernessArea } from "../../../game/model/areas/impl/WildernessArea";
// import { GameConstants } from "../../../game/GameConstants";
import { ItemDefinition } from "../../../game/definition/ItemDefinition";
// import { Bank } from "../../../game/model/container/impl/Bank";
import { Packet } from "../Packet";
// import { EnteredAmountAction } from "../../../game/model/EnteredAmountAction";

export class SpawnItemPacketListener {
  // static spawn(player: Player, item: number, amount: number, toBank: boolean) {
  static spawn(player: any, item: number, amount: number, toBank: boolean) {
    if (amount < 0) {
      return;
    } else if (amount > Number.MAX_SAFE_INTEGER) {
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
    } else {
      const inventory = player.getInventory();
      const isStackable = ItemDefinition.forId(item).isStackable();

      if (isStackable) {
        // Stackables need one free slot only when creating a new stack.
        const hasExistingStack = inventory.containsNumber(item);
        if (!hasExistingStack && inventory.getFreeSlots() <= 0) {
          inventory.full();
          return;
        }
      } else if (amount > inventory.getFreeSlots()) {
        amount = inventory.getFreeSlots();
      }

      if (amount <= 0) {
        inventory.full();
        return;
      }

      inventory.adds(item, amount);
    }

    player.getPacketSender().sendMessage(
      // `Spawned ${def.getName()} to ${toBank ? "bank" : "inventory"}.`
      `Spawned to ${toBank ? "bank" : "inventory"}.`
    );
  }

  // execute(player: Player, packet: Packet) {
  execute(player: any, packet: Packet) {
    let item = packet.readInt();
    let spawnX = packet.readByte() == 1;
    let toBank = packet.readByte() == 1;
    // let def = ItemDefinition.forId(item);
    // if (!def) {
    //     player.getPacketSender().sendMessage("This item is currently unavailable.");
    //     return;
    // }
    if (spawnX) {
      player.setEnteredAmountAction(
        new SpawnEntered((amount) => {
          SpawnItemPacketListener.spawn(player, item, amount, toBank);
        })
      );
      player.getPacketSender().sendEnterAmountPrompt(
        //   `How many ${def.getName()} would you like to spawn?`
        `How many  would you like to spawn?`
      );
    } else {
      SpawnItemPacketListener.spawn(player, item, 1, toBank);
    }
  }
}

// class SpawnEntered implements EnteredAmountAction{
class SpawnEntered {
  constructor(private readonly execFunc: Function) {}
  execute(amount: number): void {
    this.execFunc(amount);
  }
}
