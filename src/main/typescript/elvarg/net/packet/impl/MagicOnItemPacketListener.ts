import { ItemOnGroundManager } from "../../../game/entity/impl/grounditem/ItemOnGroundManager";
import { State } from "../../../game/entity/impl/grounditem/ItemOnGround";
import { ItemDefinition } from "../../../game/definition/ItemDefinition";
import { Animation } from "../../../game/model/Animation";
import { Graphic } from "../../../game/model/Graphic";
import { GraphicHeight } from "../../../game/model/GraphicHeight";
import { Item } from "../../../game/model/Item";
import { Location } from "../../../game/model/Location";
import { Projectile } from "../../../game/model/Projectile";
import { Skill } from "../../../game/model/Skill";
import { ItemIdentifiers } from "../../../util/ItemIdentifiers";
import { World } from "../../../game/World";
import { Packet } from "../Packet";
import { PacketConstants } from "../PacketConstants";

export class MagicOnItemPacketListener {
  private static readonly TELEKINETIC_GRAB_SPELL_ID = 1168;
  private static readonly TELEKINETIC_GRAB_LEVEL = 33;
  private static readonly TELEKINETIC_GRAB_XP = 3988;
  private static readonly TELEKINETIC_GRAB_RANGE = 15;
  private static readonly AIR_STAVES = new Set<number>([1381, 1397, 1405, 6562, 6563, 3053, 3054]);

  private hasInfiniteAirRune(player: any): boolean {
    const weapon = player?.getEquipment?.()?.getWeapon?.();
    const weaponId = weapon?.getId?.() ?? -1;
    return MagicOnItemPacketListener.AIR_STAVES.has(weaponId);
  }

  private hasTelegrabRunes(player: any): boolean {
    const inventory = player.getInventory();
    if (!inventory.contains(ItemIdentifiers.LAW_RUNE)) {
      return false;
    }
    if (this.hasInfiniteAirRune(player)) {
      return true;
    }
    return inventory.contains(ItemIdentifiers.AIR_RUNE);
  }

  private consumeTelegrabRunes(player: any): void {
    const inventory = player.getInventory();
    inventory.deletes(new Item(ItemIdentifiers.LAW_RUNE, 1));
    if (!this.hasInfiniteAirRune(player)) {
      inventory.deletes(new Item(ItemIdentifiers.AIR_RUNE, 1));
    }
  }

  private canReceiveGroundItem(player: any, itemId: number): boolean {
    const inventory = player.getInventory();
    if (inventory.getFreeSlots() > 0) {
      return true;
    }
    const definition = ItemDefinition.forId(itemId);
    return definition?.isStackable?.() && inventory.contains(itemId);
  }

  private castTelekineticGrab(player: any, packet: Packet): void {
    const y = packet.readLEShort();
    const groundItemId = packet.readShort();
    const x = packet.readLEShort();
    const spellId = packet.readShortA();

    if (spellId !== MagicOnItemPacketListener.TELEKINETIC_GRAB_SPELL_ID) {
      return;
    }
    if (!player || player.getHitpoints?.() <= 0) {
      return;
    }
    if (!player.getClickDelay().elapsedTime(500)) {
      return;
    }
    if (player.getSkillManager().getCurrentLevel(Skill.MAGIC) < MagicOnItemPacketListener.TELEKINETIC_GRAB_LEVEL) {
      player
        .getPacketSender()
        .sendMessage(
          `You need a Magic level of ${MagicOnItemPacketListener.TELEKINETIC_GRAB_LEVEL} to cast this spell.`
        );
      return;
    }
    if (!this.hasTelegrabRunes(player)) {
      player.getPacketSender().sendMessage("You do not have the required items to cast this spell.");
      return;
    }

    const position = new Location(x, y, player.getLocation().getZ());
    if (!player.getLocation().isWithinDistance(position, MagicOnItemPacketListener.TELEKINETIC_GRAB_RANGE)) {
      player.getPacketSender().sendMessage("You can't reach that.");
      return;
    }

    const groundItem = this.findVisibleGroundItem(player, groundItemId, position);
    if (!groundItem) {
      player.getPacketSender().sendMessage("Nothing interesting happens.");
      return;
    }
    if (!this.canReceiveGroundItem(player, groundItemId)) {
      player.getInventory().full();
      return;
    }

    this.consumeTelegrabRunes(player);
    player.getSkillManager().stopSkillable();

    player.setPositionToFace(position);
    player.performAnimation(new Animation(711));
    player.performGraphic(new Graphic(142, GraphicHeight.HIGH));
    new Projectile(
      player.getLocation().clone(),
      position.clone(),
      null,
      143,
      40,
      80,
      43,
      31,
      player.getPrivateArea()
    ).sendProjectile();

    ItemOnGroundManager.deregister(groundItem);
    player.getInventory().addItem(groundItem.getItem().clone());
    player.getSkillManager().addExperiences(Skill.MAGIC, MagicOnItemPacketListener.TELEKINETIC_GRAB_XP);
    player.getClickDelay().reset();
  }

  private findVisibleGroundItem(player: any, groundItemId: number, position: Location): any | null {
    const exact = ItemOnGroundManager.getGroundItem(player.getUsername(), groundItemId, position);
    if (exact) {
      return exact;
    }

    for (const item of World.getItems()) {
      if (!item || item.isPendingRemoval?.()) {
        continue;
      }
      if (item.getItem?.().getId?.() !== groundItemId) {
        continue;
      }
      if (!item.getPosition?.().equals?.(position)) {
        continue;
      }
      if (item.getPrivateArea?.() !== player.getPrivateArea?.()) {
        continue;
      }
      if (item.getState?.() === State.SEEN_BY_PLAYER && item.getOwner?.() !== player.getUsername?.()) {
        continue;
      }
      return item;
    }
    return null;
  }

  public execute(player: any, packet: Packet) {
    switch (packet.getOpcode()) {
      case PacketConstants.MAGIC_ON_ITEM_OPCODE:
        let slot = packet.readShort();
        let itemId = packet.readShortA();
        let childId = packet.readShort();
        let spellId = packet.readShortA();
        if (!player.getClickDelay().elapsedTime(1300)) return;
        if (slot < 0 || slot >= player.getInventory().capacity()) return;
        if (player.getInventory().getItems()[slot].getId() != itemId) return;
        // let spell = EffectSpells.forSpellId(spellId);
        // if (!spell) {
        //     return;
        // }
        let item = player.getInventory().getItems()[slot];
      // switch (spell) {
      //     case EffectSpells.LOW_ALCHEMY:
      //     case EffectSpells.HIGH_ALCHEMY:
      //         if (!item.getDefinition().isTradeable() || !item.getDefinition().isSellable() || item.getId() == 995
      //                 || item.getDefinition().getHighAlchValue() <= 0 || item.getDefinition().getLowAlchValue() <= 0) {
      //             player.getPacketSender().sendMessage("This spell can not be cast on this item.");
      //             return;
      //         }
      //         if (!EffectSpells.getSpell().canCast(player, true)) {
      //             return;
      //         }
      //         player.getInventory().deleteNumber(itemId, 1);
      //         player.performAnimation(new Animation(712));
      //         if (spell == EffectSpells.LOW_ALCHEMY) {
      //             player.getInventory().adds(995, item.getDefinition().getLowAlchValue());
      //         } else {
      //             player.getInventory().adds(995, item.getDefinition().getHighAlchValue());
      //         }
      //         player.performGraphic(new Graphic(112, GraphicHeight.HIGH));
      //         player.getSkillManager().addExperiences(Skill.MAGIC, EffectSpells.getSpell().baseExperience());
      //         player.getPacketSender().sendTab(6);
      //         break;
      //     default:
      //         break;
      // }
        break;
      case PacketConstants.MAGIC_ON_GROUND_ITEM_OPCODE:
        this.castTelekineticGrab(player, packet);
        break;
    }
  }
}
