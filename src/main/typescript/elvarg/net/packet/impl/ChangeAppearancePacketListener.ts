// import { Player } from '../../../game/entity/impl/player/Player';
// import { Appearance } from '../../../game/model/Appearance';
// import { Flag } from '../../../game/model/Flag';
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { Appearance } from "../../../game/model/Appearance";

export class ChangeAppearancePacketListener implements PacketExecutor {
  private static readonly ALLOWED_COLORS: number[][] = [
    [0, 11], // hair color
    [0, 15], // torso color
    [0, 15], // legs color
    [0, 5], // feet color
    [0, 7], // skin color
  ];
  private static readonly FEMALE_VALUES: number[][] = [
    [45, 54], // head
    [-1, -1], // jaw
    [56, 60], // torso
    [61, 65], // arms
    [67, 68], // hands
    [70, 77], // legs
    [79, 80], // feet
  ];
  private static readonly MALE_VALUES: number[][] = [
    [0, 8], // head
    [10, 17], // jaw
    [18, 25], // torso
    [26, 31], // arms
    [33, 34], // hands
    [36, 40], // legs
    [42, 43], // feet
  ];

  // public execute(player: Player, packet: Packet) {
  public execute(player: any, packet: Packet) {
    const gender = packet.readByte();
    const kits = Array.from({ length: 7 }, () => packet.readByte());
    const colors = Array.from({ length: 5 }, () => packet.readByte());
    ChangeAppearancePacketListener.apply(player, gender, kits, colors);
  }

  public static apply(player: any, gender: number, kits: number[], colors: number[]): void {
    if (!player?.getAppearance?.().getCanChangeAppearance() || player.getInterfaceId() <= 0) return;
    if ((gender !== 0 && gender !== 1) || kits.length !== 7 || colors.length !== 5) return;
    const look = [...player.getAppearance().getLook()];
    look[Appearance.GENDER] = gender;
    [Appearance.HEAD, Appearance.BEARD, Appearance.CHEST, Appearance.ARMS,
      Appearance.HANDS, Appearance.LEGS, Appearance.FEET]
      .forEach((index, i) => look[index] = kits[i] === 255 ? -1 : kits[i]);
    [Appearance.HAIR_COLOUR, Appearance.TORSO_COLOUR, Appearance.LEG_COLOUR,
      Appearance.FEET_COLOUR, Appearance.SKIN_COLOUR]
      .forEach((index, i) => look[index] = colors[i]);
    player.getAppearance().setLookArray(look);
    player.getPacketSender().sendInterfaceRemoval();
    player.getAppearance().setCanChangeAppearance(false);
  }
}
