import { PacketExecutor } from "../PacketExecutor";
import { Packet } from "../Packet";
import { PluginManager } from "../../../plugins/PluginManager";

// class ItemActionTask extends Task{
class ItemActionTask {
  // constructor(n1: number, p: Player, b: boolean, private readonly execFunc: Function){
  //     super(n1,p,b)
  // }
  // execute(): void {
  //     this.execFunc();
  //     this.stop()
  // }
}

const getInventoryCtor = () =>
  require("../../../game/model/container/impl/Inventory")
    .Inventory as typeof import("../../../game/model/container/impl/Inventory").Inventory;
const getEquipPacketListener = () =>
  require("./EquipPacketListener")
    .EquipPacketListener as typeof import("./EquipPacketListener").EquipPacketListener;

export class ItemActionPacketListener implements PacketExecutor {
  /**
   * Decode 16-bit short values in all layouts we have seen across client builds.
   * We keep this logic centralized so inventory click decoding is deterministic.
   */
  private static readShortVariants(
    payload: Buffer,
    offset: number
  ): number[] {
    const readShortA = (): number => {
      const value =
        ((payload[offset] & 0xff) << 8) | ((payload[offset + 1] - 128) & 0xff);
      return value > 32767 ? value - 0x10000 : value;
    };

    const readLEShortA = (): number => {
      const value =
        ((payload[offset] - 128) & 0xff) | ((payload[offset + 1] & 0xff) << 8);
      return value > 32767 ? value - 0x10000 : value;
    };

    const variants = [
      payload.readInt16BE(offset), // Java/default
      payload.readInt16LE(offset),
      readShortA(),
      readLEShortA(),
    ];

    return [...new Set(variants)];
  }

  private static matchInventorySlotAndItem(
    player: any,
    candidates: Array<{ slot: number; itemId: number }>
  ): { slot: number; itemId: number } | null {
    const inventory = player?.getInventory?.();
    const items = inventory?.getItems?.();
    const capacity = inventory?.capacity?.();
    if (!items || !Number.isInteger(capacity) || capacity <= 0) {
      return null;
    }

    for (const candidate of candidates) {
      const slot = candidate.slot;
      const itemId = candidate.itemId < 0 ? candidate.itemId + 0x10000 : candidate.itemId;
      if (!Number.isInteger(slot) || slot < 0 || slot >= capacity) {
        continue;
      }
      if (items[slot]?.getId?.() === candidate.itemId || items[slot]?.getId?.() === itemId) {
        return { slot, itemId };
      }
    }

    return null;
  }

  /**
   * IMPORTANT: inventory first-click packets can arrive with field order/endianness
   * differences depending on the web client build. We try known layouts and only
   * accept a decode that matches the authoritative server inventory state.
   */
  private static resolveSlotAndItemFromPayload(
    player: any,
    payload: Buffer,
    firstOffset: number,
    secondOffset: number,
    primaryLayout: "item_slot" | "slot_item"
  ): { slot: number; itemId: number } | null {
    if (!Buffer.isBuffer(payload) || payload.length < secondOffset + 2) {
      return null;
    }

    const firstVariants = ItemActionPacketListener.readShortVariants(payload, firstOffset);
    const secondVariants = ItemActionPacketListener.readShortVariants(payload, secondOffset);
    const candidates: Array<{ slot: number; itemId: number }> = [];
    const seen = new Set<string>();

    const pushCandidate = (slot: number, itemId: number): void => {
      const key = `${slot}:${itemId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({ slot, itemId });
    };

    const pushFromValues = (first: number, second: number): void => {
      if (primaryLayout === "item_slot") {
        // Java/default opcode 122 layout: interfaceId, itemId, slot
        pushCandidate(second, first);
        // Alternate layout: interfaceId, slot, itemId
        pushCandidate(first, second);
        return;
      }

      // Java/default opcode 145 layout: interfaceId, slot, itemId
      pushCandidate(first, second);
      // Alternate layout: interfaceId, itemId, slot
      pushCandidate(second, first);
    };

    // Prefer the Java/default decode first to keep behavior stable.
    pushFromValues(payload.readInt16BE(firstOffset), payload.readInt16BE(secondOffset));

    for (const first of firstVariants) {
      for (const second of secondVariants) {
        pushFromValues(first, second);
      }
    }

    return ItemActionPacketListener.matchInventorySlotAndItem(player, candidates);
  }

  public static resolveSlotAndItemFromItemFirstActionPayload(
    player: any,
    payload: Buffer
  ): { slot: number; itemId: number } | null {
    return ItemActionPacketListener.resolveSlotAndItemFromPayload(
      player,
      payload,
      2,
      4,
      "item_slot"
    );
  }

  public static resolveSlotAndItemFromContainerFirstActionPayload(
    player: any,
    payload: Buffer
  ): { slot: number; itemId: number } | null {
    return ItemActionPacketListener.resolveSlotAndItemFromPayload(
      player,
      payload,
      4,
      6,
      "slot_item"
    );
  }

  /**
   * Handles inventory first-click semantics once interface/id/slot are decoded.
   * Some client builds route inventory clicks through different opcodes, so this
   * method is shared by both ItemAction and ItemContainer listeners.
   */
  public static handleFirstAction(
    player: any,
    interfaceId: number,
    itemId: number,
    slot: number
  ): void {
    if (!player) {
      return;
    }
    if (slot < 0 || slot >= player.getInventory().capacity()) {
      return;
    }
    if (player.getInventory().getItems()[slot].getId() != itemId) {
      return;
    }

    if (player.isTeleportingReturn() || player.getHitpoints() <= 0) {
      return;
    }

    const currentItem = player.getInventory().getItems()[slot];
    if (!currentItem || currentItem.getId() !== itemId) {
      return;
    }

    const pluginHandled = PluginManager.emitItemAction({
      player,
      interfaceId,
      item: currentItem,
      itemId,
      slot,
      clickType: 1,
      handled: false,
    });
    if (pluginHandled) {
      return;
    }

    // Match Java: clear modal/overlay interface context before item action.
    player.getPacketSender().sendInterfaceRemoval();

    // Left-click inventory action for wieldables should behave like clicking "Wield/Wear".
    const Inventory = getInventoryCtor();
    if (interfaceId === Inventory.INTERFACE_ID) {
      const item = player.getInventory().getItems()[slot];
      const equipSlot = item
        ?.getDefinition?.()
        ?.getEquipmentType?.()
        ?.getSlot?.();
      if (Number.isInteger(equipSlot) && equipSlot >= 0) {
        getEquipPacketListener().equip(player, itemId, slot, interfaceId);
        return;
      }
    }

    // Herblore
    // if (Herblore.cleanHerb(player, itemId)) {
    //     return;
    // }

    // // Prayer
    // if (Prayer.buryBone(player, itemId)) {
    //     return;
    // }

    // // Runecrafting pouches..
    // if (Runecrafting.handlePouch(player, itemId, 1)) {
    //     return;
    // }

    // // Teleport tablets..
    // if (TeleportTablets.init(player, itemId)) {
    //     return;
    // }

    switch (itemId) {
      // case ItemIdentifiers.BIRD_NEST:
      // case ItemIdentifiers.BIRD_NEST_2:
      // case ItemIdentifiers.BIRD_NEST_3:
      // case ItemIdentifiers.BIRD_NEST_4:
      // case ItemIdentifiers.BIRD_NEST_5:
      //     BirdNest.handleSearchNest(player, itemId);
      //     break;
      // case Gambling.MITHRIL_SEEDS:
      //     Gambling.plantFlower(player);
      //     break;
      case 9520:
        player
          .getPacketSender()
          .sendMessage("You cannot use this in the Wilderness!");
        break;
      // case ItemIdentifiers.TELEPORT_TO_HOUSE:
      //     if (TeleportHandler.checkReqs(player, GameConstants.DEFAULT_LOCATION)) {
      //         TeleportHandler.teleport(player, GameConstants.DEFAULT_LOCATION, TeleportType.TELE_TAB, false);
      //         player.getInventory().deleteNumber(ItemIdentifiers.TELEPORT_TO_HOUSE, 1);
      //     }
      //     break;

      case 2542:
      case 2543:
      case 2544:
        if (player.busy()) {
          player.getPacketSender().sendMessage("You cannot do that right now.");
          return;
        }
        if (
          (itemId == 2542 && player.isPreserveUnlocked()) ||
          (itemId == 2543 && player.isRigourUnlocked()) ||
          (itemId == 2544 && player.getAuguryUnlocked())
        ) {
          player
            .getPacketSender()
            .sendMessage("You have already unlocked that prayer.");
          return;
        }

        break;
      case 2545:
        if (player.busy()) {
          player.getPacketSender().sendMessage("You cannot do that right now.");
          return;
        }
        if (player.isTargetTeleportUnlocked()) {
          player
            .getPacketSender()
            .sendMessage("You have already unlocked that teleport.");
          return;
        }
        break;
      case 12873:
      case 12875:
      case 12879:
      case 12881:
      case 12883:
      case 12877:
    }
  }

  // execute(player: Player, packet: Packet): void {
  execute(player: any, packet: Packet): void {
    if (player == null || player.getHitpoints() <= 0) return;
    switch (packet.getOpcode()) {
      case 122: // FIRST_ITEM_ACTION_OPCODE
        ItemActionPacketListener.firstAction(player, packet);
        break;
      case 75: // SECOND_ITEM_ACTION_OPCODE
        ItemActionPacketListener.secondAction(player, packet);
        break;
      case 16: // THIRD_ITEM_ACTION_OPCODE
        this.thirdClickAction(player, packet);
        break;
      default:
        break;
    }
  }
  // private static firstAction(player: Player, packet: Packet) {
  private static firstAction(player: any, packet: Packet) {
    const payload = packet.getBuffer();
    if (!Buffer.isBuffer(payload) || payload.length < 6) {
      return;
    }

    const interfaceId = payload.readUInt16BE(0);
    const resolved =
      ItemActionPacketListener.resolveSlotAndItemFromItemFirstActionPayload(
        player,
        payload
      );
    if (!resolved) {
      return;
    }
    const { itemId, slot } = resolved;

    ItemActionPacketListener.handleFirstAction(player, interfaceId, itemId, slot);
  }

  // static secondAction(player: Player, packet: Packet) {
  static secondAction(player: any, packet: Packet) {
    let interfaceId = packet.readLEShortA();
    let slot = packet.readLEShort();
    let itemId = packet.readShortA();
    if (slot < 0 || slot >= player.getInventory().capacity()) return;
    if (player.getInventory().getItems()[slot].getId() != itemId) return;

    const item = player.getInventory().getItems()[slot];
    const pluginHandled = PluginManager.emitItemAction({
      player,
      interfaceId,
      item,
      itemId,
      slot,
      clickType: 2,
      handled: false,
    });
    if (pluginHandled) {
      return;
    }

    // if (Runecrafting.handleTalisman(player, itemId)) {
    //     return;
    // }
    // if (Runecrafting.handlePouch(player, itemId, 2)) {
    //     return;
    // }

    switch (itemId) {
      case 2550:
        /*player.setDialogueOptions(new DialogueOptions() {
                    @Override
                    public void handleOption(Player player, int option) {
                        player.getPacketSender().sendInterfaceRemoval();
                        if (option == 1) {
                            if (player.getInventory().contains(2550)) {
                                player.getInventory().delete(2550, 1);
                                player.setRecoilDamage(0);
                                player.getPacketSender().sendMessage("Your Ring of recoil has degraded.");
                            }
                        }
                    }
                });
                player.setDialogue(DialogueManager.getDialogues().get(10)); // Yes / no option
                DialogueManager.sendStatement(player,
                        "You still have " + (40 - player.getRecoilDamage()) + " damage before it breaks. Continue?");*/
        break;
    }
  }

  // public thirdClickAction(player: Player, packet: Packet) {
  public thirdClickAction(player: any, packet: Packet) {
    let itemId = packet.readShortA();
    let slot = packet.readLEShortA();
    let interfaceId = packet.readLEShortA();
    if (slot < 0 || slot >= player.getInventory().capacity()) return;
    if (player.getInventory().getItems()[slot].getId() != itemId) return;

    const item = player.getInventory().getItems()[slot];
    const pluginHandled = PluginManager.emitItemAction({
      player,
      interfaceId,
      item,
      itemId,
      slot,
      clickType: 3,
      handled: false,
    });
    if (pluginHandled) {
      return;
    }

    // if (Runecrafting.handlePouch(player, itemId, 3)) {
    //     return;
    // }

    switch (itemId) {
      case 12926:
        player
          .getPacketSender()
          .sendMessage(
            "Your Toxic blowpipe has " +
              player.getBlowpipeScales() +
              " Zulrah scales left."
          );
        break;
    }
  }
}
