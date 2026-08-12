export class PacketConstants {
  public static readonly SPECIAL_ATTACK_OPCODE = 184;
  public static readonly BUTTON_CLICK_OPCODE = 185;
  public static readonly INTERFACE_ACTION_CLICK_OPCODE = 186;
  public static readonly SPAWN_TAB_ACTION_OPCODE = 187;
  public static readonly REGULAR_CHAT_OPCODE = 4;
  public static readonly CLAN_CHAT_OPCODE = 104;
  public static readonly DROP_ITEM_OPCODE = 87;
  public static readonly FINALIZED_MAP_REGION_OPCODE = 121;
  public static readonly CHANGE_MAP_REGION_OPCODE = 210;
  public static readonly INTERFACE_TAB_ID_OPCODE = 239;
  public static readonly CLOSE_INTERFACE_OPCODE = 130;
  public static readonly EXAMINE_ITEM_OPCODE = 2;
  public static readonly EXAMINE_NPC_OPCODE = 6;
  public static readonly CHANGE_APPEARANCE = 11;
  public static readonly DIALOGUE_OPCODE = 40;
  public static readonly ENTER_AMOUNT_OPCODE = 208;
  public static readonly ENTER_SYNTAX_OPCODE = 60;
  public static readonly EQUIP_ITEM_OPCODE = 41;
  public static readonly PLAYER_INACTIVE_OPCODE = 202;
  public static readonly CHAT_SETTINGS_OPCODE = 95;
  public static readonly COMMAND_OPCODE = 103;
  public static readonly MAP_STATE_OPCODE = 99;
  public static readonly SOUND_AREA_OPCODE = 209;
  public static readonly PICKUP_ITEM_OPCODE = 236;
  public static readonly SECOND_GROUNDITEM_OPTION_OPCODE = 235;
  public static readonly FIRST_ITEM_CONTAINER_ACTION_OPCODE = 145;
  public static readonly SECOND_ITEM_CONTAINER_ACTION_OPCODE = 117;
  public static readonly THIRD_ITEM_CONTAINER_ACTION_OPCODE = 43;
  public static readonly FOURTH_ITEM_CONTAINER_ACTION_OPCODE = 129;
  public static readonly FIFTH_ITEM_CONTAINER_ACTION_OPCODE = 135;
  public static readonly SIXTH_ITEM_CONTAINER_ACTION_OPCODE = 138;
  public static readonly ADD_FRIEND_OPCODE = 188;
  public static readonly REMOVE_FRIEND_OPCODE = 215;
  public static readonly ADD_IGNORE_OPCODE = 133;
  public static readonly REMOVE_IGNORE_OPCODE = 74;
  public static readonly SEND_PM_OPCODE = 126;
  public static readonly ATTACK_PLAYER_OPCODE = 153;
  public static readonly PLAYER_OPTION_1_OPCODE = 128;
  public static readonly PLAYER_OPTION_2_OPCODE = 37;
  public static readonly PLAYER_OPTION_3_OPCODE = 227;
  public static readonly SWITCH_ITEM_SLOT_OPCODE = 214;
  public static readonly FOLLOW_PLAYER_OPCODE = 73;
  public static readonly MAGIC_ON_PLAYER_OPCODE = 249;
  public static readonly MAGIC_ON_ITEM_OPCODE = 237;
  public static readonly MAGIC_ON_GROUND_ITEM_OPCODE = 181;
  public static readonly BANK_TAB_CREATION_OPCODE = 216;
  public static readonly TRADE_REQUEST_OPCODE = 139;
  public static readonly DUEL_REQUEST_OPCODE = 128;
  public static readonly CREATION_MENU_OPCODE = 166;
  public static readonly SEND_GRAND_EXCHANGE_UPDATE = 200;
  public static readonly OBJECT_FIRST_CLICK_OPCODE = 132;
  public static readonly OBJECT_SECOND_CLICK_OPCODE = 252;
  public static readonly OBJECT_THIRD_CLICK_OPCODE = 70;
  public static readonly OBJECT_FOURTH_CLICK_OPCODE = 234;
  public static readonly OBJECT_FIFTH_CLICK_OPCODE = 228;
  public static readonly ATTACK_NPC_OPCODE = 72;
  public static readonly FIRST_CLICK_NPC_OPCODE = 155;
  public static readonly MAGE_NPC_OPCODE = 131;
  public static readonly SECOND_CLICK_NPC_OPCODE = 17;
  public static readonly THIRD_CLICK_NPC_OPCODE = 21;
  public static readonly FOURTH_CLICK_NPC_OPCODE = 18;
  public static readonly FIRST_ITEM_ACTION_OPCODE = 122;
  public static readonly SECOND_ITEM_ACTION_OPCODE = 75;
  public static readonly THIRD_ITEM_ACTION_OPCODE = 16;
  public static readonly ITEM_ON_NPC = 57;
  public static readonly ITEM_ON_ITEM = 53;
  public static readonly ITEM_ON_OBJECT = 192;
  public static readonly ITEM_ON_GROUND_ITEM = 25;
  public static readonly ITEM_ON_PLAYER = 14;
  // NOTE: this used to also export a numeric opcode dispatch map.
  // for a raw-opcode dispatch system modeled on the real Jagex OSRS wire protocol.
  // elvarg now speaks xrsps-typescript's own protocol instead, dispatched by
  // NetworkBuilder.ts's message-type switch - nothing feeds that map anymore, so
  // it was removed. These constants remain in use for other purposes (e.g. some
  // PacketListener impl classes reference their own opcode for the specific
  // raw-byte-layout variant to decode). See docs/networking-protocol-gaps.md for
  // the small number of features that lost their only handler when the old
  // dispatch was confirmed dead, and what happened to each.
}
