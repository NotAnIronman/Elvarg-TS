"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PacketConstants = void 0;
const SpecialAttackPacketListener_1 = require("../packet/impl/SpecialAttackPacketListener");
const ButtonClickPacketListener_1 = require("../packet/impl/ButtonClickPacketListener");
const InterfaceActionClickOpcode_1 = require("../packet/impl/InterfaceActionClickOpcode");
const ChatPacketListener_1 = require("../packet/impl/ChatPacketListener");
const DropItemPacketListener_1 = require("../packet/impl/DropItemPacketListener");
const FinalizedMapRegionChangePacketListener_1 = require("../packet/impl/FinalizedMapRegionChangePacketListener");
const RegionChangePacketListener_1 = require("../packet/impl/RegionChangePacketListener");
const CloseInterfacePacketListener_1 = require("../packet/impl/CloseInterfacePacketListener");
const ExamineItemPacketListener_1 = require("../packet/impl/ExamineItemPacketListener");
const ExamineNpcPacketListener_1 = require("../packet/impl/ExamineNpcPacketListener");
const ChangeAppearancePacketListener_1 = require("../packet/impl/ChangeAppearancePacketListener");
const EnterInputPacketListener_1 = require("../packet/impl/EnterInputPacketListener");
const EquipPacketListener_1 = require("../packet/impl/EquipPacketListener");
const DialoguePacketListener_1 = require("../packet/impl/DialoguePacketListener");
const PlayerInactivePacketListener_1 = require("../packet/impl/PlayerInactivePacketListener");
const ChatSettingsPacketListener_1 = require("../packet/impl/ChatSettingsPacketListener");
const CommandPacketListener_1 = require("../packet/impl/CommandPacketListener");
const MovementPacketListener_1 = require("../packet/impl/MovementPacketListener");
const PickupItemPacketListener_1 = require("../packet/impl/PickupItemPacketListener");
const SecondGroundItemOptionPacketListener_1 = require("../packet/impl/SecondGroundItemOptionPacketListener");
const SwitchItemSlotPacketListener_1 = require("../packet/impl/SwitchItemSlotPacketListener");
const FollowPlayerPacketListener_1 = require("../packet/impl/FollowPlayerPacketListener");
const MagicOnPlayerPacketListener_1 = require("../packet/impl/MagicOnPlayerPacketListener");
const MagicOnItemPacketListener_1 = require("../packet/impl/MagicOnItemPacketListener");
const BankTabCreationPacketListener_1 = require("../packet/impl/BankTabCreationPacketListener");
const SpawnItemPacketListener_1 = require("../packet/impl/SpawnItemPacketListener");
const PlayerOptionPacketListener_1 = require("../packet/impl/PlayerOptionPacketListener");
const ObjectActionPacketListener_1 = require("../../net/packet/impl/ObjectActionPacketListener");
const NPCOptionPacketListener_1 = require("../../net/packet/impl/NPCOptionPacketListener");
const ItemActionPacketListener_1 = require("../../net/packet/impl/ItemActionPacketListener");
const UseItemPacketListener_1 = require("../../net/packet/impl/UseItemPacketListener");
const PlayerRelationPacketListener_1 = require("../../net/packet/impl/PlayerRelationPacketListener");
const TradeRequestPacketListener_1 = require("../../net/packet/impl/TradeRequestPacketListener");
const CreationMenuPacketListener_1 = require("../../net/packet/impl/CreationMenuPacketListener");
const TeleportPacketListener_1 = require("../../net/packet/impl/TeleportPacketListener");
const ItemContainerActionPacketListener_1 = require("../../net/packet/impl/ItemContainerActionPacketListener");
const NOPPacketListener_1 = require("../../net/packet/impl/NOPPacketListener");
class PacketConstants {
}
exports.PacketConstants = PacketConstants;
PacketConstants.TELEPORT_OPCODE = 183;
PacketConstants.SPECIAL_ATTACK_OPCODE = 184;
PacketConstants.BUTTON_CLICK_OPCODE = 185;
PacketConstants.INTERFACE_ACTION_CLICK_OPCODE = 186;
PacketConstants.SPAWN_TAB_ACTION_OPCODE = 187;
PacketConstants.REGULAR_CHAT_OPCODE = 4;
PacketConstants.CLAN_CHAT_OPCODE = 104;
PacketConstants.DROP_ITEM_OPCODE = 87;
PacketConstants.FINALIZED_MAP_REGION_OPCODE = 121;
PacketConstants.CHANGE_MAP_REGION_OPCODE = 210;
PacketConstants.INTERFACE_TAB_ID_OPCODE = 239;
PacketConstants.CLOSE_INTERFACE_OPCODE = 130;
PacketConstants.EXAMINE_ITEM_OPCODE = 2;
PacketConstants.EXAMINE_NPC_OPCODE = 6;
PacketConstants.CHANGE_APPEARANCE = 11;
PacketConstants.DIALOGUE_OPCODE = 40;
PacketConstants.ENTER_AMOUNT_OPCODE = 208;
PacketConstants.ENTER_SYNTAX_OPCODE = 60;
PacketConstants.EQUIP_ITEM_OPCODE = 41;
PacketConstants.PLAYER_INACTIVE_OPCODE = 202;
PacketConstants.CHAT_SETTINGS_OPCODE = 95;
PacketConstants.COMMAND_OPCODE = 103;
PacketConstants.COMMAND_MOVEMENT_OPCODE = 98;
PacketConstants.GAME_MOVEMENT_OPCODE = 164;
PacketConstants.MINIMAP_MOVEMENT_OPCODE = 248;
PacketConstants.MAP_STATE_OPCODE = 99;
PacketConstants.SOUND_AREA_OPCODE = 209;
PacketConstants.PICKUP_ITEM_OPCODE = 236;
PacketConstants.SECOND_GROUNDITEM_OPTION_OPCODE = 235;
PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE = 145;
PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE = 117;
PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE = 43;
PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE = 129;
PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE = 135;
PacketConstants.SIXTH_ITEM_CONTAINER_ACTION_OPCODE = 138;
PacketConstants.ADD_FRIEND_OPCODE = 188;
PacketConstants.REMOVE_FRIEND_OPCODE = 215;
PacketConstants.ADD_IGNORE_OPCODE = 133;
PacketConstants.REMOVE_IGNORE_OPCODE = 74;
PacketConstants.SEND_PM_OPCODE = 126;
PacketConstants.ATTACK_PLAYER_OPCODE = 153;
PacketConstants.PLAYER_OPTION_1_OPCODE = 128;
PacketConstants.PLAYER_OPTION_2_OPCODE = 37;
PacketConstants.PLAYER_OPTION_3_OPCODE = 227;
PacketConstants.SWITCH_ITEM_SLOT_OPCODE = 214;
PacketConstants.FOLLOW_PLAYER_OPCODE = 73;
PacketConstants.MAGIC_ON_PLAYER_OPCODE = 249;
PacketConstants.MAGIC_ON_ITEM_OPCODE = 237;
PacketConstants.MAGIC_ON_GROUND_ITEM_OPCODE = 181;
PacketConstants.BANK_TAB_CREATION_OPCODE = 216;
PacketConstants.TRADE_REQUEST_OPCODE = 139;
PacketConstants.DUEL_REQUEST_OPCODE = 128;
PacketConstants.CREATION_MENU_OPCODE = 166;
PacketConstants.SEND_GRAND_EXCHANGE_UPDATE = 200;
PacketConstants.OBJECT_FIRST_CLICK_OPCODE = 132;
PacketConstants.OBJECT_SECOND_CLICK_OPCODE = 252;
PacketConstants.OBJECT_THIRD_CLICK_OPCODE = 70;
PacketConstants.OBJECT_FOURTH_CLICK_OPCODE = 234;
PacketConstants.OBJECT_FIFTH_CLICK_OPCODE = 228;
PacketConstants.ATTACK_NPC_OPCODE = 72;
PacketConstants.FIRST_CLICK_NPC_OPCODE = 155;
PacketConstants.MAGE_NPC_OPCODE = 131;
PacketConstants.SECOND_CLICK_NPC_OPCODE = 17;
PacketConstants.THIRD_CLICK_NPC_OPCODE = 21;
PacketConstants.FOURTH_CLICK_NPC_OPCODE = 18;
PacketConstants.FIRST_ITEM_ACTION_OPCODE = 122;
PacketConstants.SECOND_ITEM_ACTION_OPCODE = 75;
PacketConstants.THIRD_ITEM_ACTION_OPCODE = 16;
PacketConstants.ITEM_ON_NPC = 57;
PacketConstants.ITEM_ON_ITEM = 53;
PacketConstants.ITEM_ON_OBJECT = 192;
PacketConstants.ITEM_ON_GROUND_ITEM = 25;
PacketConstants.ITEM_ON_PLAYER = 14;
PacketConstants.PACKETS = new Map([
    [PacketConstants.TELEPORT_OPCODE, new TeleportPacketListener_1.TeleportPacketListener()],
    [PacketConstants.SPECIAL_ATTACK_OPCODE, new SpecialAttackPacketListener_1.SpecialAttackPacketListener()],
    [PacketConstants.BUTTON_CLICK_OPCODE, new ButtonClickPacketListener_1.ButtonClickPacketListener()],
    [PacketConstants.INTERFACE_ACTION_CLICK_OPCODE, new InterfaceActionClickOpcode_1.InterfaceActionClickOpcode()],
    [PacketConstants.SPAWN_TAB_ACTION_OPCODE, new SpawnItemPacketListener_1.SpawnItemPacketListener()],
    [PacketConstants.REGULAR_CHAT_OPCODE, new ChatPacketListener_1.ChatPacketListener()],
    [PacketConstants.CLAN_CHAT_OPCODE, new ChatPacketListener_1.ChatPacketListener()],
    [PacketConstants.DROP_ITEM_OPCODE, new DropItemPacketListener_1.DropItemPacketListener()],
    [PacketConstants.FINALIZED_MAP_REGION_OPCODE, new FinalizedMapRegionChangePacketListener_1.FinalizedMapRegionChangePacketListener()],
    [PacketConstants.CHANGE_MAP_REGION_OPCODE, new RegionChangePacketListener_1.RegionChangePacketListener()],
    [PacketConstants.CLOSE_INTERFACE_OPCODE, new CloseInterfacePacketListener_1.CloseInterfacePacketListener()],
    [PacketConstants.EXAMINE_ITEM_OPCODE, new ExamineItemPacketListener_1.ExamineItemPacketListener()],
    [PacketConstants.EXAMINE_NPC_OPCODE, new ExamineNpcPacketListener_1.ExamineNpcPacketListener()],
    [PacketConstants.CHANGE_APPEARANCE, new ChangeAppearancePacketListener_1.ChangeAppearancePacketListener()],
    [PacketConstants.DIALOGUE_OPCODE, new DialoguePacketListener_1.DialoguePacketListener()],
    [PacketConstants.ENTER_AMOUNT_OPCODE, new EnterInputPacketListener_1.EnterInputPacketListener()],
    [PacketConstants.ENTER_SYNTAX_OPCODE, new EnterInputPacketListener_1.EnterInputPacketListener()],
    [PacketConstants.EQUIP_ITEM_OPCODE, new EquipPacketListener_1.EquipPacketListener()],
    [PacketConstants.PLAYER_INACTIVE_OPCODE, new PlayerInactivePacketListener_1.PlayerInactivePacketListener()],
    [PacketConstants.CHAT_SETTINGS_OPCODE, new ChatSettingsPacketListener_1.ChatSettingsPacketListener()],
    [PacketConstants.COMMAND_OPCODE, new CommandPacketListener_1.CommandPacketListener()],
    [PacketConstants.COMMAND_MOVEMENT_OPCODE, new MovementPacketListener_1.MovementPacketListener()],
    [PacketConstants.GAME_MOVEMENT_OPCODE, new MovementPacketListener_1.MovementPacketListener()],
    [PacketConstants.MINIMAP_MOVEMENT_OPCODE, new MovementPacketListener_1.MovementPacketListener()],
    [PacketConstants.MAP_STATE_OPCODE, new NOPPacketListener_1.NOPPacketListener()],
    [PacketConstants.PICKUP_ITEM_OPCODE, new PickupItemPacketListener_1.PickupItemPacketListener()],
    [PacketConstants.SECOND_GROUNDITEM_OPTION_OPCODE, new SecondGroundItemOptionPacketListener_1.SecondGroundItemOptionPacketListener()],
    [PacketConstants.SWITCH_ITEM_SLOT_OPCODE, new SwitchItemSlotPacketListener_1.SwitchItemSlotPacketListener()],
    [PacketConstants.FOLLOW_PLAYER_OPCODE, new FollowPlayerPacketListener_1.FollowPlayerPacketListener()],
    [PacketConstants.MAGIC_ON_PLAYER_OPCODE, new MagicOnPlayerPacketListener_1.MagicOnPlayerPacketListener()],
    [PacketConstants.MAGIC_ON_ITEM_OPCODE, new MagicOnItemPacketListener_1.MagicOnItemPacketListener()],
    [PacketConstants.MAGIC_ON_GROUND_ITEM_OPCODE, new MagicOnItemPacketListener_1.MagicOnItemPacketListener()],
    [PacketConstants.BANK_TAB_CREATION_OPCODE, new BankTabCreationPacketListener_1.BankTabCreationPacketListener()],
    [PacketConstants.INTERFACE_TAB_ID_OPCODE, new NOPPacketListener_1.NOPPacketListener()],
    [PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE, new ItemContainerActionPacketListener_1.ItemContainerActionPacketListener()],
    [PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE, new ItemContainerActionPacketListener_1.ItemContainerActionPacketListener()],
    [PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE, new ItemContainerActionPacketListener_1.ItemContainerActionPacketListener()],
    [PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE, new ItemContainerActionPacketListener_1.ItemContainerActionPacketListener()],
    [PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE, new ItemContainerActionPacketListener_1.ItemContainerActionPacketListener()],
    [PacketConstants.SIXTH_ITEM_CONTAINER_ACTION_OPCODE, new ItemContainerActionPacketListener_1.ItemContainerActionPacketListener()],
    [PacketConstants.ATTACK_PLAYER_OPCODE, new PlayerOptionPacketListener_1.PlayerOptionPacketListener()],
    [PacketConstants.PLAYER_OPTION_1_OPCODE, new PlayerOptionPacketListener_1.PlayerOptionPacketListener()],
    [PacketConstants.PLAYER_OPTION_2_OPCODE, new PlayerOptionPacketListener_1.PlayerOptionPacketListener()],
    [PacketConstants.PLAYER_OPTION_3_OPCODE, new PlayerOptionPacketListener_1.PlayerOptionPacketListener()],
    [PacketConstants.OBJECT_FIRST_CLICK_OPCODE, new ObjectActionPacketListener_1.ObjectActionPacketListener()],
    [PacketConstants.OBJECT_SECOND_CLICK_OPCODE, new ObjectActionPacketListener_1.ObjectActionPacketListener()],
    [PacketConstants.OBJECT_THIRD_CLICK_OPCODE, new ObjectActionPacketListener_1.ObjectActionPacketListener()],
    [PacketConstants.OBJECT_FOURTH_CLICK_OPCODE, new ObjectActionPacketListener_1.ObjectActionPacketListener()],
    [PacketConstants.OBJECT_FIFTH_CLICK_OPCODE, new ObjectActionPacketListener_1.ObjectActionPacketListener()],
    [PacketConstants.ATTACK_NPC_OPCODE, new NPCOptionPacketListener_1.NPCOptionPacketListener()],
    [PacketConstants.FIRST_CLICK_NPC_OPCODE, new NPCOptionPacketListener_1.NPCOptionPacketListener()],
    [PacketConstants.MAGE_NPC_OPCODE, new NPCOptionPacketListener_1.NPCOptionPacketListener()],
    [PacketConstants.SECOND_CLICK_NPC_OPCODE, new NPCOptionPacketListener_1.NPCOptionPacketListener()],
    [PacketConstants.THIRD_CLICK_NPC_OPCODE, new NPCOptionPacketListener_1.NPCOptionPacketListener()],
    [PacketConstants.FOURTH_CLICK_NPC_OPCODE, new NPCOptionPacketListener_1.NPCOptionPacketListener()],
    [PacketConstants.FIRST_ITEM_ACTION_OPCODE, new ItemActionPacketListener_1.ItemActionPacketListener()],
    [PacketConstants.SECOND_ITEM_ACTION_OPCODE, new ItemActionPacketListener_1.ItemActionPacketListener()],
    [PacketConstants.THIRD_ITEM_ACTION_OPCODE, new ItemActionPacketListener_1.ItemActionPacketListener()],
    [PacketConstants.ITEM_ON_NPC, new UseItemPacketListener_1.UseItemPacketListener()],
    [PacketConstants.ITEM_ON_ITEM, new UseItemPacketListener_1.UseItemPacketListener()],
    [PacketConstants.ITEM_ON_OBJECT, new UseItemPacketListener_1.UseItemPacketListener()],
    [PacketConstants.ITEM_ON_GROUND_ITEM, new UseItemPacketListener_1.UseItemPacketListener()],
    [PacketConstants.ITEM_ON_PLAYER, new UseItemPacketListener_1.UseItemPacketListener()],
    [PacketConstants.ADD_FRIEND_OPCODE, new PlayerRelationPacketListener_1.PlayerRelationPacketListener()],
    [PacketConstants.REMOVE_FRIEND_OPCODE, new PlayerRelationPacketListener_1.PlayerRelationPacketListener()],
    [PacketConstants.ADD_IGNORE_OPCODE, new PlayerRelationPacketListener_1.PlayerRelationPacketListener()],
    [PacketConstants.REMOVE_IGNORE_OPCODE, new PlayerRelationPacketListener_1.PlayerRelationPacketListener()],
    [PacketConstants.SEND_PM_OPCODE, new PlayerRelationPacketListener_1.PlayerRelationPacketListener()],
    [PacketConstants.TRADE_REQUEST_OPCODE, new TradeRequestPacketListener_1.TradeRequestPacketListener()],
    [PacketConstants.CREATION_MENU_OPCODE, new CreationMenuPacketListener_1.CreationMenuPacketListener()],
    // Stubs for remaining opcodes we see from the client but have no gameplay hooked yet.
    [3, new NOPPacketListener_1.NOPPacketListener()], // idle
    [57, new UseItemPacketListener_1.UseItemPacketListener()], // item on npc (already mapped)
    [64, new NOPPacketListener_1.NOPPacketListener()],
    [65, new NOPPacketListener_1.NOPPacketListener()],
    [80, new NOPPacketListener_1.NOPPacketListener()],
    [93, new NOPPacketListener_1.NOPPacketListener()],
    [94, new NOPPacketListener_1.NOPPacketListener()],
    [100, new NOPPacketListener_1.NOPPacketListener()],
    [101, new NOPPacketListener_1.NOPPacketListener()],
    [115, new NOPPacketListener_1.NOPPacketListener()],
    [126, new PlayerRelationPacketListener_1.PlayerRelationPacketListener()], // send pm
    [139, new TradeRequestPacketListener_1.TradeRequestPacketListener()],
    [144, new UseItemPacketListener_1.UseItemPacketListener()],
    [155, new NPCOptionPacketListener_1.NPCOptionPacketListener()],
    [162, new NOPPacketListener_1.NOPPacketListener()],
    [174, new NOPPacketListener_1.NOPPacketListener()],
    [177, new NOPPacketListener_1.NOPPacketListener()],
    [181, new MagicOnItemPacketListener_1.MagicOnItemPacketListener()],
    [182, new NOPPacketListener_1.NOPPacketListener()],
    [200, new NOPPacketListener_1.NOPPacketListener()],
    [209, new NOPPacketListener_1.NOPPacketListener()],
    [210, new RegionChangePacketListener_1.RegionChangePacketListener()],
    [248, new MovementPacketListener_1.MovementPacketListener()],
]);
//# sourceMappingURL=PacketConstants.js.map