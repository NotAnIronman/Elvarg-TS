"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PacketSender = void 0;
// import { Player } from "../../game/entity/impl/player/Player";
const PacketBuilder_1 = require("./PacketBuilder");
const ValueType_1 = require("./ValueType");
const ByteOrder_1 = require("./ByteOrder");
// import { CreationMenu } from "../../game/model/menu/CreationMenu";
const PacketType_1 = require("./PacketType");
// import { Skill } from "../../game/model/Skill";
// import { GameConstants } from "../../game/GameConstants";
// import { PlayerBot } from "../../game/entity/impl/playerbot/PlayerBot";
// import { PlayerStatus } from "../../game/model/PlayerStatus";
// import { Bank } from "../../game/model/container/impl/Bank";
// import { PlayerInteractingOptions, PlayerInteractingOption } from "../../game/model/PlayerInteractingOption";
// import { GameObject } from "../../game/entity/impl/object/GameObject";
// import { ItemOnGround } from "../../game/entity/impl/grounditem/ItemOnGround";
// import { Graphic } from "../../game/model/Graphic";
// import { Inventory } from "../../game/model/container/impl/Inventory";
// import { Location } from "../../game/model/Location";
// import { Animation } from "../../game/model/Animation";
// import { Item } from "../../game/model/Item";
// import { Mobile } from "../../game/entity/impl/Mobile";
// import { EffectTimer } from "../../game/model/EffectTimer";
// import { DonatorRights } from "../../game/model/rights/DonatorRights";
class PacketSender {
    constructor(player) {
        this.player = player;
    }
    sendDetails() {
        let out = new PacketBuilder_1.PacketBuilder(249);
        out.put(1);
        out.putShort(this.player.getIndex());
        this.player.getSession().write(out);
        return this;
    }
    sendMapRegion() {
        this.player.setAllowRegionChangePacket(true);
        this.player.setLastKnownRegion(this.player.getLocation().clone());
        let out = new PacketBuilder_1.PacketBuilder(73);
        out.putShort(this.player.getLocation().getRegionX() + 6, ValueType_1.ValueType.A);
        out.putShort(this.player.getLocation().getRegionY() + 6);
        this.player.getSession().write(out);
        return this;
    }
    sendLogout() {
        const out = new PacketBuilder_1.PacketBuilder(109);
        this.player.getSession().write(out);
        return this;
    }
    sendRegionReload() {
        const out = new PacketBuilder_1.PacketBuilder(89);
        this.player.getSession().write(out);
        return this;
    }
    sendSystemUpdate(time) {
        const out = new PacketBuilder_1.PacketBuilder(114);
        const byteOrder = ByteOrder_1.ByteOrder.LITTLE;
        out.putShorts(time, byteOrder);
        this.player.getSession().write(out);
        return this;
    }
    sendTeleportInterface(menu) {
        this.player.setTeleportInterfaceOpen(true);
        const out = new PacketBuilder_1.PacketBuilder(183);
        out.put(menu);
        this.player.getSession().write(out);
        return this;
    }
    // sendCreationMenu(menu: CreationMenu): this {
    //     this.player.setCreationMenu(menu);
    //     this.sendString( menu.getTitle(), 31104);
    //     const out = new PacketBuilder(167);
    //     out.put(menu.getItems().length);
    //     for (const itemId of menu.getItems()) {
    //         out.putInt(itemId);
    //     }
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendSpecialAttackState(active) {
        const out = new PacketBuilder_1.PacketBuilder(186);
        out.put(active ? 1 : 0);
        this.player.getSession().write(out);
        return this;
    }
    sendSoundEffect(soundId, loopType, delay, volume) {
        const out = new PacketBuilder_1.PacketBuilder(174);
        out.putShort(soundId).put(loopType).putShort(delay).putShort(volume);
        this.player.getSession().write(out);
        return this;
    }
    sendSound(soundId, volume, delay) {
        const out = new PacketBuilder_1.PacketBuilder(175);
        out
            .putShort(soundId, ValueType_1.ValueType.A, ByteOrder_1.ByteOrder.LITTLE)
            .put(volume)
            .putShort(delay);
        this.player.getSession().write(out);
        return this;
    }
    sendSong(id) {
        const out = new PacketBuilder_1.PacketBuilder(74);
        out.putShorts(id, ByteOrder_1.ByteOrder.LITTLE);
        this.player.getSession().write(out);
        return this;
    }
    sendAutocastId(id) {
        const out = new PacketBuilder_1.PacketBuilder(38);
        out.putShort(id);
        this.player.getSession().write(out);
        return this;
    }
    sendEnableNoclip() {
        const out = new PacketBuilder_1.PacketBuilder(250);
        this.player.getSession().write(out);
        return this;
    }
    sendURL(url) {
        const out = new PacketBuilder_1.PacketBuilder(251, PacketType_1.PacketType.VARIABLE);
        out.putString(url);
        this.player.getSession().write(out);
        return this;
    }
    sendSpecialMessage(name, type, message) {
        const out = new PacketBuilder_1.PacketBuilder(252, PacketType_1.PacketType.VARIABLE);
        out.put(type);
        out.putString(name);
        out.putString(message);
        this.player.getSession().write(out);
        return this;
    }
    sendPoisonType(type) {
        this.player.getSession().write(new PacketBuilder_1.PacketBuilder(184).put(type));
        return this;
    }
    // sendSkill(skill: Skill): this {
    //     const out = new PacketBuilder(134);
    //     out.put(skill.getButton());
    //     out.putInt(this.player.getSkillManager().getCurrentLevel(Skill.AGILITY));
    //     out.putInt(this.player.getSkillManager().getMaxLevel(skill));
    //     out.putInt(this.player.getSkillManager().getExperience(skill));
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // sendExpDrop(skill: Skill, exp: number): this {
    //     const out = new PacketBuilder(116);
    //     out.put(skill.getButton());
    //     out.putInt(exp);
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendConfig(id, state) {
        const out = new PacketBuilder_1.PacketBuilder(36);
        out.putShorts(id, ByteOrder_1.ByteOrder.LITTLE);
        out.put(state);
        this.player.getSession().write(out);
        return this;
    }
    sendToggle(id, state) {
        const out = new PacketBuilder_1.PacketBuilder(87);
        out.putShorts(id, ByteOrder_1.ByteOrder.LITTLE);
        out.putsInt(state, ByteOrder_1.ByteOrder.MIDDLE);
        this.player.getSession().write(out);
        return this;
    }
    sendChatOptions(publicChat, privateChat, tradeChat) {
        const out = new PacketBuilder_1.PacketBuilder(206);
        out.put(publicChat).put(privateChat).put(tradeChat);
        this.player.getSession().write(out);
        return this;
    }
    sendRunEnergy() {
        const out = new PacketBuilder_1.PacketBuilder(110);
        out.put(this.player.getRunEnergy());
        this.player.getSession().write(out);
        return this;
    }
    sendQuickPrayersState(activated) {
        const out = new PacketBuilder_1.PacketBuilder(111);
        out.put(activated ? 1 : 0);
        this.player.getSession().write(out);
        return this;
    }
    updateSpecialAttackOrb() {
        const out = new PacketBuilder_1.PacketBuilder(137);
        out.put(this.player.getSpecialPercentage());
        this.player.getSession().write(out);
        return this;
    }
    sendDungeoneeringTabIcon(show) {
        const out = new PacketBuilder_1.PacketBuilder(103);
        out.put(show ? 1 : 0);
        this.player.getSession().write(out);
        return this;
    }
    sendHeight() {
        this.player
            .getSession()
            .write(new PacketBuilder_1.PacketBuilder(86).put(this.player.getLocation().getZ()));
        return this;
    }
    sendIronmanMode(ironmanMode) {
        const out = new PacketBuilder_1.PacketBuilder(112);
        out.put(ironmanMode);
        this.player.getSession().write(out);
        return this;
    }
    sendShowClanChatOptions(show) {
        const out = new PacketBuilder_1.PacketBuilder(115);
        out.put(show ? 1 : 0); // 0 = no right click options
        this.player.getSession().write(out);
        return this;
    }
    sendRunStatus() {
        const out = new PacketBuilder_1.PacketBuilder(113);
        out.put(this.player.isRunningReturn() ? 1 : 0);
        this.player.getSession().write(out);
        return this;
    }
    sendWeight(weight) {
        const out = new PacketBuilder_1.PacketBuilder(240);
        out.putShort(weight);
        this.player.getSession().write(out);
        return this;
    }
    commandFrame(i) {
        const out = new PacketBuilder_1.PacketBuilder(28);
        out.put(i);
        this.player.getSession().write(out);
        return this;
    }
    sendInterface(id) {
        if (this.player.isPlayerBot()) {
            return this;
        }
        const out = new PacketBuilder_1.PacketBuilder(97);
        out.putShort(id);
        this.player.getSession().write(out);
        this.player.setInterfaceId(id);
        return this;
    }
    sendWalkableInterface(interfaceId) {
        this.player.setWalkableInterfaceId(interfaceId);
        const out = new PacketBuilder_1.PacketBuilder(208);
        out.putInt(interfaceId);
        this.player.getSession().write(out);
        return this;
    }
    sendInterfaceDisplayState(interfaceId, hide) {
        const out = new PacketBuilder_1.PacketBuilder(171);
        out.put(hide ? 1 : 0);
        out.putInt(interfaceId);
        this.player.getSession().write(out);
        return this;
    }
    sendPlayerHeadOnInterface(id) {
        const out = new PacketBuilder_1.PacketBuilder(185);
        out.putShort(id, ValueType_1.ValueType.A, ByteOrder_1.ByteOrder.LITTLE);
        this.player.getSession().write(out);
        return this;
    }
    sendNpcHeadOnInterface(id, interfaceId) {
        const out = new PacketBuilder_1.PacketBuilder(75);
        out.putShort(id, ValueType_1.ValueType.A, ByteOrder_1.ByteOrder.LITTLE);
        out.putShort(interfaceId, ValueType_1.ValueType.A, ByteOrder_1.ByteOrder.LITTLE);
        this.player.getSession().write(out);
        return this;
    }
    sendEnterAmountPrompt(title) {
        const out = new PacketBuilder_1.PacketBuilder();
        out.putString(title);
        this.player.getSession().write(out);
        return this;
    }
    sendEnterInputPrompt(title) {
        const out = new PacketBuilder_1.PacketBuilder();
        out.putString(title);
        this.player.getSession().write(out);
        return this;
    }
    sendInterfaceReset() {
        const out = new PacketBuilder_1.PacketBuilder(68);
        this.player.getSession().write(out);
        return this;
    }
    sendExit() {
        const out = new PacketBuilder_1.PacketBuilder(62);
        this.player.getSession().write(out);
        return this;
    }
    sendInterfaceComponentMoval(x, y, id) {
        const out = new PacketBuilder_1.PacketBuilder(70);
        out.putShort(x);
        out.putShort(y);
        out.putShorts(id, ByteOrder_1.ByteOrder.LITTLE);
        this.player.getSession().write(out);
        return this;
    }
    sendInterfaceAnimation(interfaceId, animationId) {
        const out = new PacketBuilder_1.PacketBuilder(200);
        out.putShort(interfaceId);
        out.putShort(animationId);
        this.player.getSession().write(out);
        return this;
    }
    sendInterfaceModel(interfaceId, itemId, zoom) {
        const out = new PacketBuilder_1.PacketBuilder(246);
        out.putShorts(interfaceId, ByteOrder_1.ByteOrder.LITTLE);
        out.putShort(zoom).putShort(itemId);
        this.player.getSession().write(out);
        return this;
    }
    sendWidgetModel(widget, model) {
        const out = new PacketBuilder_1.PacketBuilder(8);
        out.putShort(widget);
        out.putShort(model);
        this.player.getSession().write(out);
        return this;
    }
    sendTabInterface(tabId, interfaceId) {
        const out = new PacketBuilder_1.PacketBuilder(71);
        out.putShort(interfaceId);
        out.puts(tabId, ValueType_1.ValueType.A);
        this.player.getSession().write(out);
        return this;
    }
    // public sendTabs() {
    //     for (let tab = 0; tab < GameConstants.TAB_INTERFACES.length; tab++) {
    //         let interface_ = GameConstants.TAB_INTERFACES[tab];
    //         if (tab === 6) {
    //             interface_ = this.player.getSpellbook().getInterfaceId();
    //         }
    //         this.sendTabInterface(tab, interface_);
    //     }
    //     return this;
    // }
    sendTab(id) {
        let out = new PacketBuilder_1.PacketBuilder(106);
        out.puts(id, ValueType_1.ValueType.C);
        this.player.getSession().write(out);
        return this;
    }
    sendFlashingSidebar(id) {
        let out = new PacketBuilder_1.PacketBuilder(24);
        out.puts(id, ValueType_1.ValueType.S);
        this.player.getSession().write(out);
        return this;
    }
    sendChatboxInterface(id) {
        let out = new PacketBuilder_1.PacketBuilder(164);
        out.putShorts(id, ByteOrder_1.ByteOrder.LITTLE);
        this.player.getSession().write(out);
        return this;
    }
    sendMapState(state) {
        let out = new PacketBuilder_1.PacketBuilder(99);
        out.put(state);
        this.player.getSession().write(out);
        return this;
    }
    sendCameraAngle(x, y, level, speed, angle) {
        let out = new PacketBuilder_1.PacketBuilder(177);
        out.put(x / 64);
        out.put(y / 64);
        out.putShort(level);
        out.put(speed);
        out.put(angle);
        this.player.getSession().write(out);
        return this;
    }
    sendCameraShake(verticalAmount, verticalSpeed, horizontalAmount, horizontalSpeed) {
        const out = new PacketBuilder_1.PacketBuilder(35);
        out.put(verticalAmount);
        out.put(verticalSpeed);
        out.put(horizontalAmount);
        out.put(horizontalSpeed);
        this.player.getSession().write(out);
        return this;
    }
    sendCameraSpin(x, y, z, speed, angle) {
        const out = new PacketBuilder_1.PacketBuilder(166);
        out.put(x / 64);
        out.put(y / 64);
        out.putShort(z);
        out.put(speed);
        out.put(angle);
        this.player.getSession().write(out);
        return this;
    }
    sendCameraNeutrality() {
        const out = new PacketBuilder_1.PacketBuilder(107);
        this.player.getSession().write(out);
        return this;
    }
    // public sendInterfaceRemoval(): PacketSender {
    //     if (this.player.getStatus() === PlayerStatus.BANKING) {
    //         if (this.player.isSearchingBank()) {
    //             Bank.exitSearch(this.player, false);
    //         }
    //     } else if (this.player.getStatus() === PlayerStatus.PRICE_CHECKING) {
    //         this.player.getPriceChecker().withdrawAll();
    //     } else if (this.player.getStatus() === PlayerStatus.TRADING) {
    //         this.player.getTrading().closeTrade();
    //     } else if (this.player.getStatus() === PlayerStatus.DUELING) {
    //         if (!this.player.getDueling().inDuel()) {
    //             this.player.getDueling().closeDuel();
    //         }
    //     }
    //     this.player.setStatus(PlayerStatus.NONE);
    //     this.player.setEnteredAmountAction(null);
    //     this.player.setEnteredSyntaxAction(null);
    //     this.player.getDialogueManager().reset();
    //     this.player.setShop(null);
    //     this.player.setDestroyItem(-1);
    //     this.player.setInterfaceId(-1);
    //     this.player.setSearchingBank(false);
    //     this.player.setTeleportInterfaceOpen(false);
    //     this.player.getAppearance().setCanChangeAppearance(false);
    //     this.player.getSession().write(new PacketBuilder(219));
    //     return this;
    // }
    sendInterfaceScrollReset(interfaceId) {
        let out = new PacketBuilder_1.PacketBuilder(9);
        out.putInt(interfaceId);
        this.player.getSession().write(out);
        return this;
    }
    sendScrollbarHeight(interfaceId, scrollMax) {
        let out = new PacketBuilder_1.PacketBuilder(10);
        out.putInt(interfaceId);
        out.putShort(scrollMax);
        this.player.getSession().write(out);
        return this;
    }
    sendInterfaceSet(interfaceId, sidebarInterfaceId) {
        let out = new PacketBuilder_1.PacketBuilder(248);
        out.putShort(interfaceId, ValueType_1.ValueType.A);
        out.putShort(sidebarInterfaceId);
        this.player.getSession().write(out);
        this.player.setInterfaceId(interfaceId);
        return this;
    }
    // public sendItemContainer(container: Inventory, interfaceId: number) {
    //     let out = new PacketBuilder(53, PacketType.VARIABLE_SHORT);
    //     out.putInt(interfaceId);
    //     out.putShort(container.capacity());
    //     for (let item of container.getItems()) {
    //         if (item == null || item.getId() <= 0 || item.getAmount() <= 0 && !(container instanceof Bank)) {
    //             out.putInt(-1);
    //             continue;
    //         }
    //         out.putInt(item.getAmount());
    //         out.putShort(item.getId() + 1);
    //     }
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // public sendItemContainers(container: Bank, interfaceId: number) {
    //     let out = new PacketBuilder(53, PacketType.VARIABLE_SHORT);
    //     out.putInt(interfaceId);
    //     out.putShort(container.capacity());
    //     for (let item of container.getItems()) {
    //         if (item == null || item.getId() <= 0 || item.getAmount() <= 0 && !(container instanceof Bank)) {
    //             out.putInt(-1);
    //             continue;
    //         }
    //         out.putInt(item.getAmount());
    //         out.putShort(item.getId() + 1);
    //     }
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendCurrentBankTab(current_tab) {
        let out = new PacketBuilder_1.PacketBuilder(55);
        out.put(current_tab);
        this.player.getSession().write(out);
        return this;
    }
    // public sendEffectTimer(delay: number, e: EffectTimer) {
    //     let out = new PacketBuilder(54);
    //     out.putShort(delay);
    //     out.putShort(e.getClientSprite());
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // public sendInterfaceItems(interfaceId: number, items: Item[]) {
    //     if (this.player.isPlayerBot()) {
    //         return this;
    //     }
    //     let out = new PacketBuilder(53, PacketType.VARIABLE_SHORT);
    //     out.putInt(interfaceId);
    //     out.putShort(items.length);
    //     for (let item of items) {
    //         if (item == null) {
    //             out.putInt(-1);
    //             continue;
    //         }
    //         out.putInt(item.getAmount());
    //         out.putShort(item.getId() + 1);
    //     }
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendItemOnInterfaces(interfaceId, item, amount) {
        let out = new PacketBuilder_1.PacketBuilder(53, PacketType_1.PacketType.VARIABLE_SHORT);
        out.putInt(interfaceId);
        out.putShort(1);
        out.putInt(amount);
        out.putShort(item + 1);
        this.player.getSession().write(out);
        return this;
    }
    sendItemOnInterface(frame, item, slot, amount) {
        let out = new PacketBuilder_1.PacketBuilder(34, PacketType_1.PacketType.VARIABLE_SHORT);
        out.putShort(frame);
        out.put(slot);
        out.putInt(amount);
        out.putShort(item + 1);
        this.player.getSession().write(out);
        return this;
    }
    clearItemOnInterface(frame) {
        const out = new PacketBuilder_1.PacketBuilder(72);
        out.putShort(frame);
        this.player.getSession().write(out);
        return this;
    }
    sendSmithingData(id, slot, interfaceId, amount) {
        const out = new PacketBuilder_1.PacketBuilder(34, PacketType_1.PacketType.VARIABLE_SHORT);
        out.putShort(interfaceId);
        out.put(slot);
        out.putInt(amount);
        out.putShort(id + 1);
        out.put(amount);
        this.player.getSession().write(out);
        return this;
    }
    sendInteractionOption(option, slot, top) {
        const out = new PacketBuilder_1.PacketBuilder(104, PacketType_1.PacketType.VARIABLE);
        out.puts(slot, ValueType_1.ValueType.C);
        out.puts(top ? 1 : 0, ValueType_1.ValueType.A);
        out.putString(option);
        this.player.getSession().write(out);
        // const interactingOption: PlayerInteractingOption = PlayerInteractingOption.forName(option);
        if (option != null)
            // this.player.setPlayerInteractingOption(interactingOption);
            return this;
    }
    sendString(string, id) {
        if (!this.player.getFrameUpdater().shouldUpdate(string, id)) {
            return this;
        }
        const out = new PacketBuilder_1.PacketBuilder(126, PacketType_1.PacketType.VARIABLE_SHORT);
        out.putString(string);
        out.putInt(id);
        this.player.getSession().write(out);
        return this;
    }
    clearInterfaceText(start, end) {
        for (let i = start; i <= end; i++) {
            this.player.getFrameUpdater().interfaceTextMap.remove(i);
        }
        const out = new PacketBuilder_1.PacketBuilder(105);
        out.putInt(start);
        out.putInt(end);
        this.player.getSession().write(out);
        return this;
    }
    clearInterfaceItems(start, end) {
        let out = new PacketBuilder_1.PacketBuilder(112);
        out.putInt(start);
        out.putInt(end);
        this.player.getSession().write(out);
        return this;
    }
    sendRights() {
        const out = new PacketBuilder_1.PacketBuilder(127);
        out.put(this.player.getRights().getSpriteId());
        // out.put(DonatorRights.getSpriteId(0));
        this.player.getSession().write(out);
        return this;
    }
    sendPositionalHint(position, tilePosition) {
        const out = new PacketBuilder_1.PacketBuilder(254);
        out.put(tilePosition);
        // out.putShort(position.getX());
        // out.putShort(position.getY());
        // out.put(position.getZ());
        this.player.getSession().write(out);
        return this;
    }
    // public sendEntityHint(mobile: Mobile) {
    //     // let type = mobile instanceof Player ? 10 : 1;
    //     let type =  1;
    //     const out = new PacketBuilder(254);
    //     out.put(type);
    //     out.putShort(mobile.getIndex());
    //     out.putShorts(0, ByteOrder.TRIPLE_INT);
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendEntityHintRemoval(playerHintRemoval) {
        let type = playerHintRemoval ? 10 : 1;
        let out = new PacketBuilder_1.PacketBuilder(254);
        out.put(type).putShort(-1);
        out.putShorts(0, ByteOrder_1.ByteOrder.TRIPLE_INT);
        this.player.getSession().write(out);
        return this;
    }
    sendMultiIcon(value) {
        let out = new PacketBuilder_1.PacketBuilder(61);
        out.put(value);
        this.player.getSession().write(out);
        this.player.setMultiIcon(value);
        return this;
    }
    // public sendPrivateMessage(target: Player, message: Uint8Array, size: number): PacketSender {
    //     const messageArray = Array.from(message);
    //     if (this.player instanceof PlayerBot) {
    //         (this.player as PlayerBot).getChatInteraction().receivedPrivateMessage(messageArray, target);
    //         return this;
    //     }
    //     let out = new PacketBuilder(196, PacketType.VARIABLE);
    //     out.putLong(target.getLongUsername());
    //     out.putInt(target.getRelations().getPrivateMessageId());
    //     out.put(target.getRights().getSpriteId());
    //     out.put(DonatorRights.getSpriteId(0));
    //     out.writePutBytes(message.toString());
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendFriendStatus(status) {
        const out = new PacketBuilder_1.PacketBuilder(221);
        out.put(status);
        this.player.getSession().write(out);
        return this;
    }
    sendFriend(name, world) {
        world = world !== 0 ? world + 9 : world;
        const out = new PacketBuilder_1.PacketBuilder(50);
        out.putLong(name);
        out.put(world);
        this.player.getSession().write(out);
        return this;
    }
    sendDeleteFriend(name) {
        const out = new PacketBuilder_1.PacketBuilder(51);
        out.putLong(name);
        this.player.getSession().write(out);
        return this;
    }
    sendAddIgnore(name) {
        const out = new PacketBuilder_1.PacketBuilder(214);
        out.putLong(name);
        this.player.getSession().write(out);
        return this;
    }
    sendDeleteIgnore(name) {
        const out = new PacketBuilder_1.PacketBuilder(215);
        out.putLong(name);
        this.player.getSession().write(out);
        return this;
    }
    sendTotalExp(exp) {
        const out = new PacketBuilder_1.PacketBuilder(108);
        out.putLong(exp);
        this.player.getSession().write(out);
        return this;
    }
    // public sendGraphic(graphic: Graphic, position: Location): PacketSender {
    //     this.sendPosition(position);
    //     let out = new PacketBuilder(4);
    //     out.put(0);
    //     out.putShort(graphic.getId());
    //     out.put(position.getZ());
    //     out.putShort(graphic.getDelay());
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // public sendObject(object: GameObject): PacketSender {
    //     this.sendPosition(object.getLocation());
    //     let out = new PacketBuilder(151);
    //     out.puts(object.getLocation().getZ(), ValueType.A);
    //     out.putShorts(object.getId(), ByteOrder.LITTLE);
    //     out.puts((object.getType() << 2) + (object.getFace() & 3), ValueType.S);
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendAnimationReset() {
        let out = new PacketBuilder_1.PacketBuilder(1);
        this.player.getSession().write(out);
        return this;
    }
    // public sendGlobalGraphic(graphic: Graphic, position: Location): PacketSender {
    //     this.sendGraphic(graphic, position);
    //     for (let p of this.player.getLocalPlayers()) {
    //         p.getPacketSender().sendGraphic(graphic, position);
    //     }
    //     return this;
    // }
    // public sendObjectRemoval(object: GameObject): PacketSender {
    //     if (!object) {
    //         return this;
    //     }
    //     this.sendPosition(object.getLocation());
    //     let out = new PacketBuilder(101);
    //     out.puts((object.getType() << 2) + (object.getFace() & 3), ValueType.C);
    //     out.put(object.getLocation().getZ());
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // public sendObjectAnimation(object: GameObject, anim: Animation): PacketSender {
    //     this.sendPosition(object.getLocation());
    //     let out = new PacketBuilder(160);
    //     out.puts(0, ValueType.S);
    //     out.puts((object.getType() << 2) + (object.getFace() & 3), ValueType.S);
    //     out.putShort(anim.getId(), ValueType.A);
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // public alterGroundItem(item: ItemOnGround) {
    //     this.sendPosition(item.getPosition());
    //     let out = new PacketBuilder(84);
    //     out.put(0);
    //     out.putShort(item.getItem().getId()).putInt(item.getOldAmount()).putInt(item.getItem().getAmount());
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // public createGroundItem(item: ItemOnGround) {
    //     this.sendPosition(item.getPosition());
    //     let out = new PacketBuilder(44);
    //     out.putShort(item.getItem().getId(), ValueType.A, ByteOrder.LITTLE);
    //     out.putInt(item.getItem().getAmount()).put(0);
    //     this.player.getSession().write(out);
    //     return this;
    // }
    // public deleteGroundItem(item: ItemOnGround) {
    //     this.sendPosition(item.getPosition());
    //     let out = new PacketBuilder(156);
    //     out.puts(0, ValueType.A);
    //     out.putShort(item.getItem().getId());
    //     this.player.getSession().write(out);
    //     return this;
    // }
    deleteRegionalSpawns() {
        this.player.getSession().write(new PacketBuilder_1.PacketBuilder(178));
        return this;
    }
    sendPosition(position) {
        let other = this.player.getLastKnownRegion();
        let out = new PacketBuilder_1.PacketBuilder(85);
        // out.puts(position.getY() - 8 * other.getRegionY(), ValueType.C);
        // out.puts(position.getX() - 8 * other.getRegionX(), ValueType.C);
        this.player.getSession().write(out);
        return this;
    }
    sendConsoleMessage(message) {
        let out = new PacketBuilder_1.PacketBuilder(123);
        out.putString(message);
        this.player.getSession().write(out);
        return this;
    }
    sendInterfaceSpriteChange(childId, firstSprite, secondSprite) {
        // player.write(new PacketBuilder(140).writeShort(childId).writeByte((firstSprite << 0) + (secondSprite & 0x0)).toPacket());
        return this;
    }
    // public getRegionOffset(position: Location): number {
    //     // let x = position.getX() - (position.getRegionX() << 4);
    //     // let y = position.getY() - (position.getRegionY() & 0x7);
    //     let offset = ((x & 0x7)) << 4 + (y & 0x7);
    //     return offset;
    // }
    // public sendProjectile(start: Location, end: Location, offset: number, speed: number, projectileId: number, startHeight: number, endHeight: number, lockon: Mobile, delay: number): PacketSender {
    //     this.sendPosition(start);
    //     let out = new PacketBuilder(117);
    //     out.put(offset);
    //     // out.put((end.getX() - start.getX()));
    //     // out.put((end.getY() - start.getY()));
    //     if (lockon != null) {
    //         out.putShort(lockon.isPlayer() ? -(lockon.getIndex() + 1) : lockon.getIndex() + 1);
    //     } else {
    //         out.putShort(0);
    //     }
    //     out.putShort(projectileId);
    //     out.put(startHeight);
    //     out.put(endHeight);
    //     out.putShort(delay);
    //     out.putShort(speed);
    //     out.put(16); // Angle
    //     out.put(64);
    //     this.player.getSession().write(out);
    //     return this;
    // }
    sendHideCombatBox() {
        this.player.getSession().write(new PacketBuilder_1.PacketBuilder(128));
        return this;
    }
    sendObjectsRemoval(chunkX, chunkY, height) {
        this.player
            .getSession()
            .write(new PacketBuilder_1.PacketBuilder(153).put(chunkX).put(chunkY).put(height));
        return this;
    }
    // Basic chat message to client.
    sendMessage(message) {
        const out = new PacketBuilder_1.PacketBuilder(253, PacketType_1.PacketType.VARIABLE);
        out.putString(message ?? "");
        this.player.getSession().write(out);
        return this;
    }
    // Stubs to satisfy gameplay code; implement client opcodes as needed.
    sendPrivateMessage(..._args) {
        return this;
    }
    sendInterfaceRemoval() {
        return this;
    }
    sendItemContainer(_containerId, _interfaceId) {
        return this;
    }
    sendItemContainers(..._args) {
        return this;
    }
    sendInterfaceItems(_interfaceId, _items) {
        return this;
    }
    sendEffectTimer(_seconds, _effect) {
        return this;
    }
    sendGraphic(..._args) {
        return this;
    }
    sendGlobalGraphic(..._args) {
        return this;
    }
    sendProjectile(..._args) {
        return this;
    }
    sendEntityHint(_target, _index) {
        return this;
    }
    // Additional stubs for gameplay code.
    sendTabs() {
        return this;
    }
    sendObject(..._args) {
        return this;
    }
    sendObjectRemoval(..._args) {
        return this;
    }
    sendObjectAnimation(..._args) {
        return this;
    }
    sendCreationMenu(_menu) {
        return this;
    }
    sendItemContainerInterface(_containerId, _interfaceId) {
        return this;
    }
    sendItemOnWidget(_widgetId, _modelZoom, _itemId) {
        return this;
    }
    alterGroundItem(_item) {
        return this;
    }
    deleteGroundItem(_item) {
        return this;
    }
    createGroundItem(_item) {
        return this;
    }
    sendItemOnEquipment(_slot) {
        return this;
    }
    sendSkill(_skill) {
        return this;
    }
    sendExpDrop(_skill, _exp) {
        return this;
    }
}
exports.PacketSender = PacketSender;
//# sourceMappingURL=PacketSender.js.map