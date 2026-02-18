import { PacketExecutor } from "../PacketExecutor";
import { Packet } from "../Packet";
import { Misc } from "../../../util/Misc";
import { Server } from "../../../Server";
import { PluginManager } from "../../../plugins/PluginManager";

const getWeaponInterfaces = () =>
  require("../../../game/content/combat/WeaponInterfaces")
    .WeaponInterfaces as typeof import("../../../game/content/combat/WeaponInterfaces").WeaponInterfaces;
const getInventoryCtor = () =>
  require("../../../game/model/container/impl/Inventory")
    .Inventory as typeof import("../../../game/model/container/impl/Inventory").Inventory;
const getEquipmentCtor = () =>
  require("../../../game/model/container/impl/Equipment")
    .Equipment as typeof import("../../../game/model/container/impl/Equipment").Equipment;
const getItemCtor = () =>
  require("../../../game/model/Item")
    .Item as typeof import("../../../game/model/Item").Item;
const getSkillCtor = () =>
  require("../../../game/model/Skill")
    .Skill as typeof import("../../../game/model/Skill").Skill;
const getFlagEnum = () =>
  require("../../../game/model/Flag")
    .Flag as typeof import("../../../game/model/Flag").Flag;
const getBonusManager = () =>
  require("../../../game/model/equipment/BonusManager")
    .BonusManager as typeof import("../../../game/model/equipment/BonusManager").BonusManager;

export class EquipPacketListener implements PacketExecutor {
  public static resetWeapon(player: any, deactivateSpecialAttack: boolean) {
    if (deactivateSpecialAttack) {
      player.setSpecialActivated(false);
    }
    player.getPacketSender().sendSpecialAttackState(false);
    getWeaponInterfaces().assign(player);
  }

  execute(player: any, packet: Packet) {
    const id = packet.readShort();
    const slot = packet.readShortA();
    const interfaceId = packet.readShortA();

    EquipPacketListener.equip(player, id, slot, interfaceId);
  }

  public static equipFromInventory(player: any, itemInSlot: any) {
    if (!player || !itemInSlot) {
      return;
    }
    const Inventory = getInventoryCtor();
    EquipPacketListener.equip(
      player,
      itemInSlot.getId(),
      itemInSlot.getSlot(),
      Inventory.INTERFACE_ID
    );
  }

  public static equip(
    player: any,
    id: number,
    slot: number,
    interfaceId: number
  ): void {
    if (!player || player.getHitpoints() <= 0) {
      return;
    }

    const Inventory = getInventoryCtor();
    const Equipment = getEquipmentCtor();
    const Item = getItemCtor();
    const Skill = getSkillCtor();
    const Flag = getFlagEnum();

    if (slot < 0 || slot >= player.getInventory().capacity()) {
      return;
    }

    const inventory = player.getInventory();
    const equipment = player.getEquipment();
    const itemInSlot = inventory.getItems()[slot];
    if (!itemInSlot || itemInSlot.getId() !== id) {
      return;
    }

    if (
      player.getInterfaceId() > 0 &&
      player.getInterfaceId() !== Equipment.EQUIPMENT_SCREEN_INTERFACE_ID
    ) {
      player.getPacketSender().sendInterfaceRemoval();
    }

    player.getSkillManager().stopSkillable();

    if (interfaceId !== Inventory.INTERFACE_ID) {
      return;
    }

    const item = itemInSlot.clone();
    const requirements = item.getDefinition().getRequirements();
    if (requirements != null) {
      for (const skill of Skill.values()) {
        const requiredLevel = requirements[skill.getIndex()] ?? 0;
        if (requiredLevel > player.getSkillManager().getMaxLevel(skill)) {
          const skillName = Misc.formatText(skill.getName());
          const vowel = /^[aeiou]/i.test(skillName) ? "an" : "a";
          player
            .getPacketSender()
            .sendMessage(
              `You need ${vowel} ${skillName} level of at least ${requiredLevel} to wear this.`
            );
          return;
        }
      }
    }

    const equipmentSlot = item.getDefinition().getEquipmentType().getSlot();
    if (equipmentSlot === -1) {
      Server.getLogger().info(
        `Attempting to equip item ${item.getId()} which has no defined equipment slot.`
      );
      return;
    }

    if (PluginManager.emitCanEquip(player, equipmentSlot, item) === false) {
      return;
    }
    if (
      PluginManager.emitCanEquip(player, equipmentSlot, item) === null &&
      player.getArea() &&
      !player.getArea().canEquipItem(player, equipmentSlot, item)
    ) {
      return;
    }

    const currentlyEquipped = equipment.forSlot(equipmentSlot).clone();
    const stackableAndSameItem =
      currentlyEquipped.getId() === item.getId() &&
      item.getDefinition().isStackable();

    if (stackableAndSameItem) {
      const amount = Math.min(
        Number.MAX_SAFE_INTEGER,
        currentlyEquipped.getAmount() + item.getAmount()
      );
      inventory.deleteBoolean(item, false);
      equipment.getItems()[equipmentSlot].setId(item.getId()).setAmount(amount);
    } else if (
      item.getDefinition().isDoubleHanded() &&
      equipmentSlot === Equipment.WEAPON_SLOT
    ) {
      const occupiedShield = equipment.isSlotOccupied(Equipment.SHIELD_SLOT);
      const slotsRequired = occupiedShield ? 1 : 0;
      if (inventory.getFreeSlots() < slotsRequired) {
        inventory.full();
        return;
      }

      const shield = equipment.getItems()[Equipment.SHIELD_SLOT].clone();
      const weapon = equipment.getItems()[Equipment.WEAPON_SLOT].clone();
      equipment.setItem(Equipment.SHIELD_SLOT, new Item(-1, 0));
      equipment.setItem(Equipment.WEAPON_SLOT, item);

      if (weapon.getId() !== -1) {
        inventory.setItem(slot, weapon);
      } else {
        inventory.setItem(slot, new Item(-1, 0));
      }

      if (shield.getId() !== -1) {
        inventory.add(shield, false);
      }
    } else if (
      equipmentSlot === Equipment.SHIELD_SLOT &&
      equipment.getItems()[Equipment.WEAPON_SLOT].getDefinition().isDoubleHanded()
    ) {
      const weapon = equipment.getItems()[Equipment.WEAPON_SLOT].clone();
      inventory.setItem(slot, weapon);
      equipment.setItem(Equipment.WEAPON_SLOT, new Item(-1, 0));
      equipment.setItem(Equipment.SHIELD_SLOT, item);
      EquipPacketListener.resetWeapon(player, true);
    } else {
      if (
        currentlyEquipped.getId() !== -1 &&
        currentlyEquipped.getDefinition().getEquipmentType().getSlot() ===
          equipmentSlot
      ) {
        if (inventory.contains(currentlyEquipped.getId())) {
          inventory.deleteBoolean(item, false);
          inventory.add(currentlyEquipped, false);
        } else {
          inventory.setItem(slot, currentlyEquipped);
        }
        equipment.setItem(equipmentSlot, item);
      } else {
        inventory.setItem(slot, new Item(-1, 0));
        equipment.setItem(equipmentSlot, item);
      }
    }

    if (equipmentSlot === Equipment.WEAPON_SLOT) {
      EquipPacketListener.resetWeapon(player, true);
    }

    if (equipment.get(Equipment.WEAPON_SLOT)?.getId() !== 4153) {
      player.getCombat().reset();
    }

    getBonusManager().update(player);
    equipment.refreshItems();
    inventory.refreshItems();
    player.getUpdateFlag().flag(Flag.APPEARANCE);
  }
}
