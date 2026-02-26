// import { Player } from "../../../game/entity/impl/player/Player";
import { Packet } from "../Packet";
// import { Bank } from "../../../game/model/container/impl/Bank";
// import { DepositBox } from "../../../game/content/DepositBox";
// import { Dueling } from "../../../game/content/Duelling";
// import { Trading } from "../../../game/content/Trading";
// import { PriceChecker } from "../../../game/model/container/impl/PriceChecker";
// import { Shop } from "../../../game/model/container/shop/Shop";
// import { ShopManager } from "../../../game/model/container/shop/ShopManager";
// import { PlayerStatus } from "../../../game/model/PlayerStatus";
// import { Equipment } from "../../../game/model/container/impl/Equipment";
// import { BonusManager } from "../../../game/model/equipment/BonusManager";
// import { WeaponInterfaces } from "../../../game/content/combat/WeaponInterfaces";
// import { CombatSpecial } from "../../../game/content/combat/CombatSpecial";
// import { Autocasting } from "../../../game/content/combat/magic/Autocasting";
import { PacketConstants } from "../PacketConstants";
// import { Item } from "../../../game/model/Item";
// import { Flag } from "../../../game/model/Flag";
// import { EnteredAmountAction } from "../../../game/model/EnteredAmountAction";

const getInventoryCtor = () =>
  require("../../../game/model/container/impl/Inventory")
    .Inventory as typeof import("../../../game/model/container/impl/Inventory").Inventory;
const getEquipmentCtor = () =>
  require("../../../game/model/container/impl/Equipment")
    .Equipment as typeof import("../../../game/model/container/impl/Equipment").Equipment;
const getItemCtor = () =>
  require("../../../game/model/Item")
    .Item as typeof import("../../../game/model/Item").Item;
const getFlagEnum = () =>
  require("../../../game/model/Flag")
    .Flag as typeof import("../../../game/model/Flag").Flag;
const getBonusManager = () =>
  require("../../../game/model/equipment/BonusManager")
    .BonusManager as typeof import("../../../game/model/equipment/BonusManager").BonusManager;
const getWeaponInterfaces = () =>
  require("../../../game/content/combat/WeaponInterfaces")
    .WeaponInterfaces as typeof import("../../../game/content/combat/WeaponInterfaces").WeaponInterfaces;
const getCombatSpecial = () =>
  require("../../../game/content/combat/CombatSpecial")
    .CombatSpecial as typeof import("../../../game/content/combat/CombatSpecial").CombatSpecial;
const getAutocasting = () =>
  require("../../../game/content/combat/magic/Autocasting")
    .Autocasting as typeof import("../../../game/content/combat/magic/Autocasting").Autocasting;
const getEquipPacketListener = () =>
  require("./EquipPacketListener")
    .EquipPacketListener as typeof import("./EquipPacketListener").EquipPacketListener;
const getItemActionPacketListener = () =>
  require("./ItemActionPacketListener")
    .ItemActionPacketListener as typeof import("./ItemActionPacketListener").ItemActionPacketListener;

// class ItemContainerEnteredAmountAction implements EnteredAmountAction{
class ItemContainerEnteredAmountAction {
  constructor(private readonly execFunc: Function) {}
  execute(amount: number): void {
    this.execFunc();
  }
}

export class ItemContainerActionPacketListener {
  static firstAction(player: any, packet: Packet) {
    // static firstAction(player: Player, packet: Packet) {
    const payload = packet.getBuffer();
    let containerId = packet.readInt();
    let slot = packet.readShortA();
    let id = packet.readShortA();

    // Some clients emit inventory first-clicks on container opcode 145 instead
    // of opcode 122. Route it through the same first-action handler so left-click
    // behavior stays consistent across client builds.
    //
    // IMPORTANT: do not trust raw (slot,id) decode blindly for inventory clicks.
    // The web client can vary short layout/order for this opcode, so we resolve
    // against live inventory contents before dispatching.
    const Inventory = getInventoryCtor();
    if (containerId === Inventory.INTERFACE_ID) {
      const resolved =
        getItemActionPacketListener().resolveSlotAndItemFromContainerFirstActionPayload(
          player,
          payload
        );
      if (!resolved) {
        return;
      }
      slot = resolved.slot;
      id = resolved.itemId;
      getItemActionPacketListener().handleFirstAction(player, containerId, id, slot);
      return;
    }

    const Equipment = getEquipmentCtor();
    if (containerId === Equipment.INVENTORY_INTERFACE_ID) {
      const equipment = player.getEquipment();
      if (slot < 0 || slot >= equipment.capacity()) {
        return;
      }

      const item = equipment.getItems()[slot];
      if (!item || item.getId() !== id) {
        return;
      }

      if (player.getArea() && !player.getArea().canUnequipItem(player, slot, item)) {
        return;
      }

      const inventory = player.getInventory();
      const stackIntoExisting =
        item.getDefinition().isStackable() && inventory.getAmount(item.getId()) > 0;
      const inventorySlot = inventory.getEmptySlot();
      if (!stackIntoExisting && inventorySlot === -1) {
        inventory.full();
        return;
      }

      const Item = getItemCtor();
      equipment.setItem(slot, new Item(-1, 0));

      if (stackIntoExisting) {
        inventory.adds(item.getId(), item.getAmount());
      } else {
        inventory.setItem(inventorySlot, item);
      }

      getBonusManager().update(player);
      if (slot === Equipment.WEAPON_SLOT) {
        getWeaponInterfaces().assign(player);
        player.setSpecialActivated(false);
        getCombatSpecial().updateBar(player);
        if (player.getCombat().getAutocastSpell() != null) {
          getAutocasting().setAutocast(player, null);
          player.getPacketSender().sendMessage("Autocast spell cleared.");
        }
      }

      equipment.refreshItems();
      inventory.refreshItems();
      player.getUpdateFlag().flag(getFlagEnum().APPEARANCE);
      return;
    }

    // Bank withdrawal..
    // if (containerId >= Bank.CONTAINER_START && containerId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS) {
    //     Bank.withdraw(player, id, slot, 1, containerId - Bank.CONTAINER_START);
    //     return;
    // }

    // if (containerId == 7423) {
    //     DepositBox.deposit(player, slot, id, 1);
    //     return;
    // }

    // switch (containerId) {
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_1:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_2:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_3:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_4:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_5:
    //         if (player.getInterfaceId() == EquipmentMaking.EQUIPMENT_CREATION_INTERFACE_ID) {
    //             EquipmentMaking.initialize(player, id, containerId, slot, 1);
    //         }
    //         break;
    //     // Withdrawing items from duel
    //     case Dueling.MAIN_INTERFACE_CONTAINER:
    //         if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.getDueling().handleItem(id, 1, slot, player.getDueling().getContainer(), player.getInventory());
    //         }
    //         break;

    //     case Trading.INVENTORY_CONTAINER_INTERFACE: // Duel/Trade inventory
    //         if (player.getStatus() == PlayerStatus.PRICE_CHECKING) {
    //             player.getPriceChecker().deposit(id, 1, slot);
    //         } else if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, 1, slot, player.getInventory(), player.getTrading().getContainer());
    //         } else if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.getDueling().handleItem(id, 1, slot, player.getInventory(), player.getDueling().getContainer());
    //         }
    //         break;
    //     case Trading.CONTAINER_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, 1, slot, player.getTrading().getContainer(), player.getInventory());
    //         }
    //         break;
    //     case PriceChecker.CONTAINER_ID:
    //         player.getPriceChecker().withdraw(id, 1, slot);
    //         break;

    //     case Bank.INVENTORY_INTERFACE_ID:
    //         Bank.deposits(player, id, slot, 1);
    //         break;

    //     case Shop.ITEM_CHILD_ID:
    //     case Shop.INVENTORY_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.SHOPPING) {
    //             ShopManager.priceCheck(player, id, slot, (containerId == Shop.ITEM_CHILD_ID));
    //         }
    //         break;
    //     case Equipment.INVENTORY_INTERFACE_ID:
    //         let item = player.getEquipment().getItems()[slot];
    //         if (!item || item.getId() !== id) return;

    //         if (player.getArea() && !player.getArea().canUnequipItem(player, slot, item)) {
    //             return;
    //         }

    //         let stackItem = item.getDefinition().isStackable() && player.getInventory().getAmount(item.getId()) > 0;
    //         let inventorySlot = player.getInventory().getEmptySlot();
    //         if (inventorySlot !== -1) {
    //             player.getEquipment().setItem(slot, new Item(-1, 0));

    //             if (stackItem) {
    //                 player.getInventory().adds(item.getId(), item.getAmount());
    //             } else {
    //                 player.getInventory().setItem(inventorySlot, item);
    //             }

    //             BonusManager.update(player);
    //             if (item.getDefinition().getEquipmentType().getSlot() === Equipment.WEAPON_SLOT) {
    //                 WeaponInterfaces.assign(player);
    //                 player.setSpecialActivated(false);
    //                 CombatSpecial.updateBar(player);
    //                 if (player.getCombat().getAutocastSpell() != null) {
    //                     Autocasting.setAutocast(player, null);
    //                     player.getPacketSender().sendMessage("Autocast spell cleared.");
    //                 }
    //             }
    //             player.getEquipment().refreshItems();
    //             player.getInventory().refreshItems();
    //             player.getUpdateFlag().flag(Flag.APPEARANCE);
    //         } else {
    //             player.getInventory().full();
    //         }
    //         break;
    // }
  }

  // private static secondAction(player: Player, packet: Packet): void {
  private static secondAction(player: any, packet: Packet): void {
    let interfaceId = packet.readInt();
    let id = packet.readLEShortA();
    let slot = packet.readLEShort();

    // Some clients can emit inventory "Wield/Wear" through container option 2
    // instead of the dedicated equip opcode. Keep this tolerant.
    const Inventory = getInventoryCtor();
    if (interfaceId === Inventory.INTERFACE_ID) {
      if (slot < 0 || slot >= player.getInventory().capacity()) {
        return;
      }
      const item = player.getInventory().getItems()[slot];
      if (!item || item.getId() !== id) {
        return;
      }
      const equipSlot = item
        ?.getDefinition?.()
        ?.getEquipmentType?.()
        ?.getSlot?.();
      if (Number.isInteger(equipSlot) && equipSlot >= 0) {
        getEquipPacketListener().equip(player, id, slot, interfaceId);
      }
      return;
    }

    // Bank withdrawal..
    // if (interfaceId >= Bank.CONTAINER_START && interfaceId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS) {
    //     Bank.withdraw(player, id, slot, 5, interfaceId - Bank.CONTAINER_START);
    //     return;
    // }

    // if (interfaceId == 7423) {
    //     DepositBox.deposit(player, slot, id, 5);
    //     return;
    // }

    // switch (interfaceId) {
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_1:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_2:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_3:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_4:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_5:
    //         if (player.getInterfaceId() == EquipmentMaking.EQUIPMENT_CREATION_INTERFACE_ID) {
    //             EquipmentMaking.initialize(player, id, interfaceId, slot, 5);
    //         }
    //         break;
    //     case Shop.INVENTORY_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.SHOPPING) {
    //             ShopManager.sellItem(player, slot, id, 1);
    //         }
    //         break;
    //     case Shop.ITEM_CHILD_ID:
    //         if (player.getStatus() == PlayerStatus.SHOPPING) {
    //             ShopManager.buyItem(player, slot, id, 1);
    //         }
    //         break;
    //     case Bank.INVENTORY_INTERFACE_ID:
    //         Bank.deposits(player, id, slot, 5);
    //         break;
    //     case Dueling.MAIN_INTERFACE_CONTAINER:
    //         if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.getDueling().handleItem(id, 5, slot, player.getDueling().getContainer(), player.getInventory());
    //         }
    //         break;
    //     case Trading.INVENTORY_CONTAINER_INTERFACE: // Duel/Trade inventory
    //         if (player.getStatus() == PlayerStatus.PRICE_CHECKING) {
    //             player.getPriceChecker().deposit(id, 5, slot);
    //         } else if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, 5, slot, player.getInventory(), player.getTrading().getContainer());
    //         } else if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.getDueling().handleItem(id, 5, slot, player.getInventory(), player.getDueling().getContainer());
    //         }
    //         break;
    //     case Trading.CONTAINER_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, 5, slot, player.getTrading().getContainer(), player.getInventory());
    //         }
    //         break;
    //     case PriceChecker.CONTAINER_ID:
    //         player.getPriceChecker().withdraw(id, 5, slot);
    //         break;
    // }
  }

  // private static thirdAction(player: Player, packet: Packet) {
  private static thirdAction(player: any, packet: Packet) {
    let interfaceId = packet.readInt();
    let id = packet.readShortA();
    let slot = packet.readShortA();

    // Bank withdrawal..
    // if (interfaceId >= Bank.CONTAINER_START && interfaceId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS) {
    //     Bank.withdraw(player, id, slot, 10, interfaceId - Bank.CONTAINER_START);
    //     return;
    // }

    // if (interfaceId == 7423) {
    //     DepositBox.deposit(player, slot, id, 10);
    //     return;
    // }

    // switch (interfaceId) {
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_1:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_2:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_3:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_4:
    //     case EquipmentMaking.EQUIPMENT_CREATION_COLUMN_5:
    //         if (player.getInterfaceId() == EquipmentMaking.EQUIPMENT_CREATION_INTERFACE_ID) {
    //             EquipmentMaking.initialize(player, id, interfaceId, slot, 10);
    //         }
    //         break;
    //     case Shop.INVENTORY_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.PRICE_CHECKING) {
    //             player.getPriceChecker().deposit(id, 10, slot);
    //         } else if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, 10, slot, player.getInventory(), player.getTrading().getContainer());
    //         } else if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.getDueling().handleItem(id, 10, slot, player.getInventory(), player.getDueling().getContainer());
    //         }
    //         break;
    //     case Trading.CONTAINER_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, 10, slot, player.getTrading().getContainer(), player.getInventory());
    //         }
    //         break;
    //     case PriceChecker.CONTAINER_ID:
    //         player.getPriceChecker().withdraw(id, 10, slot);
    //         break;
    // }
  }

  // private static fourthAction(player: Player, packet: Packet) {
  private static fourthAction(player: any, packet: Packet) {
    let slot = packet.readShortA();
    let interfaceId = packet.readInt();
    let id = packet.readShortA();

    // Bank withdrawal..
    // if (interfaceId >= Bank.CONTAINER_START && interfaceId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS) {
    //     Bank.withdraw(player, id, slot, -1, interfaceId - Bank.CONTAINER_START);
    //     return;
    // }

    // if (interfaceId == 7423) {
    //     DepositBox.deposit(player, slot, id, Number.MAX_SAFE_INTEGER);
    //     return;
    // }

    // switch (interfaceId) {
    //     case Shop.INVENTORY_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.SHOPPING) {
    //             ShopManager.sellItem(player, slot, id, 10);
    //         }
    //         break;
    //     case Shop.ITEM_CHILD_ID:
    //         if (player.getStatus() == PlayerStatus.SHOPPING) {
    //             ShopManager.buyItem(player, slot, id, 10);
    //         }
    //         break;
    //     case Bank.INVENTORY_INTERFACE_ID:
    //         Bank.deposits(player, id, slot, -1);
    //         break;
    //     // Withdrawing items from duel
    //     case Dueling.MAIN_INTERFACE_CONTAINER:
    //         if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.getDueling().handleItem(id, player.getDueling().getContainer().getAmount(id), slot,
    //                 player.getDueling().getContainer(), player.getInventory());
    //         }
    //         break;
    //     case Trading.INVENTORY_CONTAINER_INTERFACE: // Duel/Trade inventory
    //         if (player.getStatus() == PlayerStatus.PRICE_CHECKING) {
    //             player.getPriceChecker().deposit(id, player.getInventory().getAmount(id), slot);
    //         } else if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, player.getInventory().getAmount(id), slot, player.getInventory(),
    //                 player.getTrading().getContainer());
    //         } else if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.getDueling().handleItem(id, player.getInventory().getAmount(id), slot, player.getInventory(),
    //                 player.getDueling().getContainer());
    //         }
    //         break;
    //     case Trading.CONTAINER_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.getTrading().handleItem(id, player.getTrading().getContainer().getAmount(id), slot,
    //                 player.getTrading().getContainer(), player.getInventory());
    //         }
    //         break;
    //     case PriceChecker.CONTAINER_ID:
    //         player.getPriceChecker().withdraw(id, player.getPriceChecker().getAmount(id), slot);
    //         break;

    // }
  }

  // private static fifthAction(player: Player, packet: Packet) {
  private static fifthAction(player: any, packet: Packet) {
    let interfaceId = packet.readInt();
    let slot = packet.readLEShort();
    let id = packet.readLEShort();

    // Bank withdrawal..
    // if (interfaceId >= Bank.CONTAINER_START && interfaceId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS) {
    //     player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount: number) => {
    //         Bank.withdraw(player, id, slot, amount, interfaceId - Bank.CONTAINER_START);
    //     }));
    //     player.getPacketSender().sendEnterAmountPrompt("How many would you like to withdraw?");
    //     return;
    // }

    if (interfaceId == 7423) {
      // player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => DepositBox.deposit(player, slot, id, amount)));
      player
        .getPacketSender()
        .sendEnterAmountPrompt("How many would you like to deposit?");
      return;
    }

    // switch (interfaceId) {
    //     case Shop.INVENTORY_INTERFACE_ID:
    //         player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //             ShopManager.sellItem(player, slot, id, amount);
    //         }));
    //         player.getPacketSender().sendEnterAmountPrompt("How many would you like to sell?");
    //         break;
    //     case Shop.ITEM_CHILD_ID:
    //         player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //             ShopManager.buyItem(player, slot, id, amount);
    //         }));
    //         player.getPacketSender().sendEnterAmountPrompt("How many would you like to buy?");
    //         break;

    //     case Bank.INVENTORY_INTERFACE_ID:
    //         player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //             Bank.deposits(player, id, slot, amount);
    //         }));
    //         player.getPacketSender().sendEnterAmountPrompt("How many would you like to bank?");
    //         break;
    //     case Trading.INVENTORY_CONTAINER_INTERFACE: // Duel/Trade inventory
    //         if (player.getStatus() == PlayerStatus.PRICE_CHECKING) {
    //             player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //                 player.getPriceChecker().deposit(id, amount, slot);
    //             }));
    //             player.getPacketSender().sendEnterAmountPrompt("How many would you like to deposit?");
    //         } else if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //                 player.getTrading().handleItem(id, amount, slot, player.getInventory(), player.getTrading().getContainer());
    //             }));
    //             player.getPacketSender().sendEnterAmountPrompt("How many would you like to offer?");
    //         } else if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //                 player.getDueling().handleItem(id, amount, slot, player.getInventory(), player.getDueling().getContainer());
    //             }));
    //             player.getPacketSender().sendEnterAmountPrompt("How many would you like to offer?");
    //         }
    //         break;
    //     case Trading.CONTAINER_INTERFACE_ID:
    //         if (player.getStatus() == PlayerStatus.TRADING) {
    //             player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //                 player.getTrading().handleItem(id, amount, slot, player.getTrading().getContainer(), player.getInventory());
    //             }));
    //             player.getPacketSender().sendEnterAmountPrompt("How many would you like to remove?");
    //         }
    //         break;
    //     case Dueling.MAIN_INTERFACE_CONTAINER:
    //         if (player.getStatus() == PlayerStatus.DUELING) {
    //             player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //                 player.getDueling().handleItem(id, amount, slot, player.getDueling().getContainer(), player.getInventory());
    //             }));
    //             player.getPacketSender().sendEnterAmountPrompt("How many would you like to remove?");
    //         }
    //         break;
    //     case PriceChecker.CONTAINER_ID:
    //         player.setEnteredAmountAction(new ItemContainerEnteredAmountAction((amount) => {
    //             player.getPriceChecker().withdraw(id, amount, slot);
    //         }));
    //         player.getPacketSender().sendEnterAmountPrompt("How many would you like to withdraw?");
    //         break;
    // }
  }

  // private static sixthAction(player: Player, packet: Packet) {
  private static sixthAction(player: any, packet: Packet) {}

  // public execute(player: Player, packet: Packet) {
  public execute(player: any, packet: Packet) {
    if (player == null || player.getHitpoints() <= 0) {
      return;
    }

    switch (packet.getOpcode()) {
      case PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE:
        ItemContainerActionPacketListener.firstAction(player, packet);
        break;
      case PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE:
        ItemContainerActionPacketListener.secondAction(player, packet);
        break;
      case PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE:
        ItemContainerActionPacketListener.thirdAction(player, packet);
        break;
      case PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE:
        ItemContainerActionPacketListener.fourthAction(player, packet);
        break;
      case PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE:
        ItemContainerActionPacketListener.fifthAction(player, packet);
        break;
      case PacketConstants.SIXTH_ITEM_CONTAINER_ACTION_OPCODE:
        ItemContainerActionPacketListener.sixthAction(player, packet);
        break;
    }
  }
}
