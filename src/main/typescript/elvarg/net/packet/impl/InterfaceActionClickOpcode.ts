import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { PluginManager } from "../../../plugins/PluginManager";
import { WeaponInterfaces } from "../../../game/content/combat/WeaponInterfaces";
import { Autocasting } from "../../../game/content/combat/magic/Autocasting";
import { BonusManager } from "../../../game/model/equipment/BonusManager";
import { FightType } from "../../../game/content/combat/FightType";

export class InterfaceActionClickOpcode implements PacketExecutor {
  execute(player: any, packet: Packet) {
    InterfaceActionClickOpcode.handle(player, packet.readInt(), packet.readByte());
  }

  public static handle(player: any, interfaceId: number, action: number): void {

    if (
      player == null ||
      player.getHitpoints() <= 0 ||
      player.isTeleportingReturn()
    ) {
      return;
    }

    if (
      Autocasting.handleWeaponInterface(player, interfaceId) ||
      Autocasting.handleAutocastTab(player, interfaceId)
    ) {
      return;
    }

    if (WeaponInterfaces.changeCombatSettings(player, interfaceId)) {
      BonusManager.update(player);
      return;
    }

    // Some clients send combat style clicks via interface-action packets
    // where buttonId is the combat interface id and action is style index (1-based).
    const weapon = player.getWeapon?.();
    if (
      weapon &&
      typeof weapon.getInterfaceId === "function" &&
      typeof weapon.getFightType === "function" &&
      interfaceId === weapon.getInterfaceId() &&
      Number.isInteger(action)
    ) {
      if (weapon === WeaponInterfaces.UNARMED) {
        const unarmedTypes = [
          FightType.UNARMED_PUNCH,
          FightType.UNARMED_KICK,
          FightType.UNARMED_BLOCK,
        ];
        const candidateChildIds = [action, action - 1, action - 2];
        const selectedUnarmed =
          unarmedTypes.find((type) => candidateChildIds.includes(type.getChildId())) ??
          null;
        if (selectedUnarmed) {
          player.setFightType(selectedUnarmed);
          player
            .getPacketSender()
            .sendConfig(selectedUnarmed.getParentId(), selectedUnarmed.getChildId());
          BonusManager.update(player);
          return;
        }
      }

      const fightTypes = Object.values(weapon.getFightType()).filter(
        (type: any) => type && typeof type.getParentId === "function"
      ) as any[];
      const candidateChildIds = [action, action - 1, action - 2];
      let selectedType: any =
        fightTypes.find((type) => candidateChildIds.includes(type.getChildId?.())) ??
        null;

      if (!selectedType) {
        const candidateIndexes = [action, action - 1, action - 2];
        for (const idx of candidateIndexes) {
          if (idx >= 0 && idx < fightTypes.length) {
            selectedType = fightTypes[idx];
            break;
          }
        }
      }

      if (selectedType) {
        player.setFightType(selectedType);
        player
          .getPacketSender()
          .sendConfig(selectedType.getParentId(), selectedType.getChildId());
        BonusManager.update(player);
        return;
      }
    }

    if (
      PluginManager.emitInterfaceActionClick({
        player,
        buttonId: interfaceId,
        action,
        handled: false,
      })
    ) {
      return;
    }
  }
}
