// import { Player } from "../../game/entity/impl/player/Player";
import { PacketBuilder } from "./PacketBuilder";
import { ValueType } from "./ValueType";
import { ByteOrder } from "./ByteOrder";
// import { CreationMenu } from "../../game/model/menu/CreationMenu";
import { PacketType } from "./PacketType";
import { PlayerStatus } from "../../game/model/PlayerStatus";
// import { Skill } from "../../game/model/Skill";
// import { GameConstants } from "../../game/GameConstants";
// import { PlayerStatus } from "../../game/model/PlayerStatus";
// import { Bank } from "../../game/model/container/impl/Bank";
// import { PlayerInteractingOptions, PlayerInteractingOption } from "../../game/model/PlayerInteractingOption";
// import { GameObject } from "../../game/entity/impl/object/GameObject";
// import { ItemOnGround } from "../../game/entity/impl/grounditem/ItemOnGround";
// import { Graphic } from "../../game/model/Graphic";
// import { Inventory } from "../../game/model/container/impl/Inventory";
import { Location } from "../../game/model/Location";
import { DonatorRights } from "../../game/model/rights/DonatorRights";
import { MapRegionReplacementManager } from "../../game/collision/MapRegionReplacementManager";
// import { Animation } from "../../game/model/Animation";
// import { Item } from "../../game/model/Item";
// import { Mobile } from "../../game/entity/impl/Mobile";
// import { EffectTimer } from "../../game/model/EffectTimer";
// import { DonatorRights } from "../../game/model/rights/DonatorRights";

export class PacketSender {
  // private player: Player;
  // constructor(player: Player) {
  //     this.player = player;
  // }
  private player: any;
  constructor(player: any) {
    this.player = player;
  }

  public sendDetails(): PacketSender {
    let out = new PacketBuilder(249);
    out.put(1);
    out.putShort(this.player.getIndex());
    this.player.getSession().write(out);
    return this;
  }

  public sendMapRegion(): PacketSender {
    this.player.setAllowRegionChangePacket(true);
    // Track the last known region using the player's actual position, matching the Java server.
    this.player.setLastKnownRegion(this.player.getLocation().clone());
    try {
      const location = this.player.getLocation();
      const currentRegionId = ((location.getX() >> 6) << 8) | (location.getY() >> 6);
      MapRegionReplacementManager.sendReplacementToPlayer(this.player, currentRegionId, false);
    } catch (_err) {
      // Region replacement refresh is best-effort; map-region sync must still proceed.
    }
    let out = new PacketBuilder(73);
    out.putShort(this.player.getLocation().getRegionX() + 6, ValueType.A);
    out.putShort(this.player.getLocation().getRegionY() + 6);
    this.player.getSession().write(out);
    return this;
  }

  sendLogout(): this {
    const out = new PacketBuilder(109);
    this.player.getSession().write(out);
    return this;
  }

  sendRegionReload(): this {
    const out = new PacketBuilder(89);
    this.player.getSession().write(out);
    return this;
  }

  sendSystemUpdate(time: number): this {
    const out = new PacketBuilder(114);
    const byteOrder = ByteOrder.LITTLE;
    out.putShorts(time, byteOrder);
    this.player.getSession().write(out);
    return this;
  }

  sendTeleportInterface(menu: number): this {
    this.player.setTeleportInterfaceOpen(true);
    const out = new PacketBuilder(183);
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

  sendSpecialAttackState(active: boolean): this {
    const out = new PacketBuilder(186);
    out.put(active ? 1 : 0);
    this.player.getSession().write(out);
    return this;
  }

  sendSoundEffect(
    soundId: number,
    loopType: number,
    delay: number,
    volume: number
  ): this {
    const out = new PacketBuilder(174);
    out.putShort(soundId).put(loopType).putShort(delay).putShort(volume);
    this.player.getSession().write(out);
    return this;
  }

  sendSound(soundId: number, volume: number, delay: number): this {
    // The web client decodes SFX on opcode 174 only.
    // Sending opcode 175 makes the client treat it as an unknown packet and drop.
    return this.sendSoundEffect(soundId, 1, delay, volume);
  }

  sendSong(id: number): this {
    const out = new PacketBuilder(74);
    out.putShorts(id, ByteOrder.LITTLE);
    this.player.getSession().write(out);
    return this;
  }
  sendAutocastId(id: number): this {
    const out = new PacketBuilder(38);
    out.putShort(id);
    this.player.getSession().write(out);
    return this;
  }

  sendEnableNoclip(): this {
    const out = new PacketBuilder(250);
    this.player.getSession().write(out);
    return this;
  }

  sendURL(url: string): this {
    const out = new PacketBuilder(251, PacketType.VARIABLE);
    out.putString(url);
    this.player.getSession().write(out);
    return this;
  }

  sendSpecialMessage(name: string, type: number, message: string): this {
    const out = new PacketBuilder(252, PacketType.VARIABLE);
    out.put(type);
    out.putString(name);
    out.putString(message);
    this.player.getSession().write(out);
    return this;
  }

  sendPoisonType(type: number): this {
    this.player.getSession().write(new PacketBuilder(184).put(type));
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

  sendConfig(id: number, state: number): this {
    const out = new PacketBuilder(36);
    out.putShorts(id, ByteOrder.LITTLE);
    out.put(state);
    this.player.getSession().write(out);
    return this;
  }

  sendToggle(id: number, state: number): this {
    const out = new PacketBuilder(87);
    out.putShorts(id, ByteOrder.LITTLE);
    out.putsInt(state, ByteOrder.MIDDLE);
    this.player.getSession().write(out);
    return this;
  }

  sendChatOptions(
    publicChat: number,
    privateChat: number,
    tradeChat: number
  ): this {
    const out = new PacketBuilder(206);
    out.put(publicChat).put(privateChat).put(tradeChat);
    this.player.getSession().write(out);
    return this;
  }

  public sendRunEnergy(): this {
    const out = new PacketBuilder(110);
    out.put(this.player.getRunEnergy());
    this.player.getSession().write(out);
    return this;
  }

  sendQuickPrayersState(activated: boolean): this {
    const out = new PacketBuilder(111);
    out.put(activated ? 1 : 0);
    this.player.getSession().write(out);
    return this;
  }

  updateSpecialAttackOrb(): this {
    const out = new PacketBuilder(137);
    out.put(this.player.getSpecialPercentage());
    this.player.getSession().write(out);
    return this;
  }

  sendDungeoneeringTabIcon(show: boolean): this {
    const out = new PacketBuilder(103);
    out.put(show ? 1 : 0);
    this.player.getSession().write(out);
    return this;
  }

  sendHeight(): this {
    this.player
      .getSession()
      .write(new PacketBuilder(86).put(this.player.getLocation().getZ()));
    return this;
  }

  sendIronmanMode(ironmanMode: number): this {
    const out = new PacketBuilder(112);
    out.put(ironmanMode);
    this.player.getSession().write(out);
    return this;
  }

  sendShowClanChatOptions(show: boolean): this {
    const out = new PacketBuilder(115);
    out.put(show ? 1 : 0); // 0 = no right click options
    this.player.getSession().write(out);
    return this;
  }

  sendRunStatus(): this {
    const out = new PacketBuilder(113);
    out.put(this.player.isRunningReturn() ? 1 : 0);
    this.player.getSession().write(out);
    return this;
  }

  sendWeight(weight: number): this {
    const out = new PacketBuilder(240);
    out.putShort(weight);
    this.player.getSession().write(out);
    return this;
  }

  commandFrame(i: number): this {
    const out = new PacketBuilder(28);
    out.put(i);
    this.player.getSession().write(out);
    return this;
  }

  sendInterface(id: number): this {
    if (this.player.isPlayerBot()) {
      return this;
    }

    const out = new PacketBuilder(97);
    out.putShort(id);
    this.player.getSession().write(out);
    this.player.setInterfaceId(id);
    return this;
  }

  sendWalkableInterface(interfaceId: number): this {
    this.player.setWalkableInterfaceId(interfaceId);
    const out = new PacketBuilder(208);
    out.putInt(interfaceId);
    this.player.getSession().write(out);
    return this;
  }

  sendInterfaceDisplayState(interfaceId: number, hide: boolean): this {
    const out = new PacketBuilder(171);
    out.put(hide ? 1 : 0);
    out.putInt(interfaceId);
    this.player.getSession().write(out);
    return this;
  }

  public sendPlayerHeadOnInterface(id: number): PacketSender {
    const out = new PacketBuilder(185);
    out.putShort(id, ValueType.A, ByteOrder.LITTLE);
    this.player.getSession().write(out);
    return this;
  }

  public sendNpcHeadOnInterface(id: number, interfaceId: number): PacketSender {
    const out = new PacketBuilder(75);
    out.putShort(id, ValueType.A, ByteOrder.LITTLE);
    out.putShort(interfaceId, ValueType.A, ByteOrder.LITTLE);
    this.player.getSession().write(out);
    return this;
  }

  public sendEnterAmountPrompt(title: string): PacketSender {
    // Java parity: opcode 27 (variable) for enter amount.
    const out = new PacketBuilder(27, PacketType.VARIABLE);
    out.putString(title);
    this.player.getSession().write(out);
    return this;
  }

  public sendEnterInputPrompt(title: string): PacketSender {
    // Java parity: opcode 187 (variable) for enter input.
    const out = new PacketBuilder(187, PacketType.VARIABLE);
    out.putString(title);
    this.player.getSession().write(out);
    return this;
  }

  public sendInterfaceReset(): PacketSender {
    const out = new PacketBuilder(68);
    this.player.getSession().write(out);
    return this;
  }

  public sendExit(): PacketSender {
    const out = new PacketBuilder(62);
    this.player.getSession().write(out);
    return this;
  }

  public sendInterfaceComponentMoval(
    x: number,
    y: number,
    id: number
  ): PacketSender {
    const out = new PacketBuilder(70);
    out.putShort(x);
    out.putShort(y);
    out.putShorts(id, ByteOrder.LITTLE);
    this.player.getSession().write(out);
    return this;
  }

  public sendInterfaceAnimation(interfaceId: number, animationId: number) {
    const out = new PacketBuilder(200);
    out.putShort(interfaceId);
    out.putShort(animationId);
    this.player.getSession().write(out);
    return this;
  }

  public sendInterfaceModel(interfaceId: number, itemId: number, zoom: number) {
    const out = new PacketBuilder(246);
    out.putShorts(interfaceId, ByteOrder.LITTLE);
    out.putShort(zoom).putShort(itemId);
    this.player.getSession().write(out);
    return this;
  }

  public sendWidgetModel(widget: number, model: number) {
    const out = new PacketBuilder(8);
    out.putShort(widget);
    out.putShort(model);
    this.player.getSession().write(out);
    return this;
  }

  public sendTabInterface(tabId: number, interfaceId: number) {
    const out = new PacketBuilder(71);
    out.putShort(interfaceId);
    out.puts(tabId, ValueType.A);
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

  public sendTab(id: number): PacketSender {
    let out = new PacketBuilder(106);
    out.puts(id, ValueType.C);
    this.player.getSession().write(out);
    return this;
  }

  public sendFlashingSidebar(id: number): PacketSender {
    let out = new PacketBuilder(24);
    out.puts(id, ValueType.S);
    this.player.getSession().write(out);
    return this;
  }

  public sendChatboxInterface(id: number): PacketSender {
    let out = new PacketBuilder(164);
    out.putShorts(id, ByteOrder.LITTLE);
    this.player.getSession().write(out);
    return this;
  }

  public sendMapState(state: number): PacketSender {
    let out = new PacketBuilder(99);
    out.put(state);
    this.player.getSession().write(out);
    return this;
  }

  public sendCameraAngle(
    x: number,
    y: number,
    level: number,
    speed: number,
    angle: number
  ): PacketSender {
    let out = new PacketBuilder(177);
    out.put(x / 64);
    out.put(y / 64);
    out.putShort(level);
    out.put(speed);
    out.put(angle);
    this.player.getSession().write(out);
    return this;
  }

  public sendCameraShake(
    verticalAmount: number,
    verticalSpeed: number,
    horizontalAmount: number,
    horizontalSpeed: number
  ): PacketSender {
    const out = new PacketBuilder(35);
    out.put(verticalAmount);
    out.put(verticalSpeed);
    out.put(horizontalAmount);
    out.put(horizontalSpeed);
    this.player.getSession().write(out);
    return this;
  }

  public sendCameraSpin(
    x: number,
    y: number,
    z: number,
    speed: number,
    angle: number
  ): PacketSender {
    const out = new PacketBuilder(166);
    out.put(x / 64);
    out.put(y / 64);
    out.putShort(z);
    out.put(speed);
    out.put(angle);
    this.player.getSession().write(out);
    return this;
  }

  public sendCameraNeutrality(): PacketSender {
    const out = new PacketBuilder(107);
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
  //     this.player.getSession().write(new PacketBuilder(219, PacketType.FIXED));
  //     return this;
  // }

  public sendInterfaceScrollReset(interfaceId: number): PacketSender {
    let out = new PacketBuilder(9);
    out.putInt(interfaceId);
    this.player.getSession().write(out);
    return this;
  }

  public sendScrollbarHeight(
    interfaceId: number,
    scrollMax: number
  ): PacketSender {
    let out = new PacketBuilder(10);
    out.putInt(interfaceId);
    out.putShort(scrollMax);
    this.player.getSession().write(out);
    return this;
  }

  public sendInterfaceSet(interfaceId: number, sidebarInterfaceId: number) {
    let out = new PacketBuilder(248);
    out.putShort(interfaceId, ValueType.A);
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

  public sendCurrentBankTab(current_tab: number) {
    let out = new PacketBuilder(55);
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

  public sendItemOnInterfaces(
    interfaceId: number,
    item: number,
    amount: number
  ) {
    let out = new PacketBuilder(53, PacketType.VARIABLE_SHORT);
    out.putInt(interfaceId);
    out.putShort(1);
    out.putInt(amount);
    out.putShort(item + 1);
    this.player.getSession().write(out);
    return this;
  }

  public sendItemOnInterface(
    frame: number,
    item: number,
    slot: number,
    amount: number
  ) {
    let out = new PacketBuilder(34, PacketType.VARIABLE_SHORT);
    out.putShort(frame);
    out.put(slot);
    out.putInt(amount);
    out.putShort(item + 1);
    this.player.getSession().write(out);
    return this;
  }

  public clearItemOnInterface(frame: number): PacketSender {
    const out = new PacketBuilder(72);
    out.putShort(frame);
    this.player.getSession().write(out);
    return this;
  }

  public sendSmithingData(
    id: number,
    slot: number,
    interfaceId: number,
    amount: number
  ): PacketSender {
    const out = new PacketBuilder(34, PacketType.VARIABLE_SHORT);
    out.putShort(interfaceId);
    out.put(slot);
    out.putInt(amount);
    out.putShort(id + 1);
    this.player.getSession().write(out);
    return this;
  }

  public sendInteractionOption(
    option: string,
    slot: number,
    top: boolean
  ): PacketSender {
    const out = new PacketBuilder(104, PacketType.VARIABLE);
    out.puts(slot, ValueType.C);
    out.puts(top ? 1 : 0, ValueType.A);
    out.putString(option);
    this.player.getSession().write(out);
    // const interactingOption: PlayerInteractingOption = PlayerInteractingOption.forName(option);
    if (option != null)
      // this.player.setPlayerInteractingOption(interactingOption);
      return this;
  }

  public sendString(string: string, id: number): PacketSender {
    const safeText = String(string ?? "");
    if (!this.player.getFrameUpdater().shouldUpdate(safeText, id)) {
      return this;
    }
    const out = new PacketBuilder(126, PacketType.VARIABLE_SHORT);
    out.putString(safeText);
    out.putInt(id);
    this.player.getSession().write(out);
    return this;
  }

  public clearInterfaceText(start: number, end: number): PacketSender {
    for (let i = start; i <= end; i++) {
      this.player.getFrameUpdater().interfaceTextMap.remove(i);
    }
    const out = new PacketBuilder(105);
    out.putInt(start);
    out.putInt(end);
    this.player.getSession().write(out);
    return this;
  }

  public clearInterfaceItems(start: number, end: number): PacketSender {
    let out = new PacketBuilder(112);
    out.putInt(start);
    out.putInt(end);
    this.player.getSession().write(out);
    return this;
  }

  public sendRights() {
    const out = new PacketBuilder(127);
    out.put(this.player.getRights().getId());
    out.put(DonatorRights.getId(this.player.getDonatorRights()));
    this.player.getSession().write(out);
    return this;
  }

  public sendPositionalHint(position: any, tilePosition: number) {
    if (
      !position ||
      typeof position.getX !== "function" ||
      typeof position.getY !== "function" ||
      typeof position.getZ !== "function"
    ) {
      return this;
    }
    const out = new PacketBuilder(254);
    out.put(tilePosition);
    out.putShort(position.getX());
    out.putShort(position.getY());
    out.put(position.getZ());
    this.player.getSession().write(out);
    return this;
  }

  // public sendEntityHint(mobile: Mobile) {
  // Use client hint-arrow packet to point at a target entity.
  public sendEntityHint(mobile: any): PacketSender {
    if (!mobile || typeof mobile.getIndex !== "function") {
      return this;
    }
    const type = mobile?.isPlayer?.() ? 10 : 1;
    const out = new PacketBuilder(254);
    out.put(type);
    out.putShort(mobile.getIndex());
    out.putTypeInt(0, ValueType.STANDARD, ByteOrder.TRIPLE_INT);
    this.player.getSession().write(out);
    return this;
  }

  public sendEntityHintRemoval(playerHintRemoval: boolean): PacketSender {
    let type = playerHintRemoval ? 10 : 1;
    let out = new PacketBuilder(254);
    out.put(type).putShort(-1);
    out.putTypeInt(0, ValueType.STANDARD, ByteOrder.TRIPLE_INT);
    this.player.getSession().write(out);
    return this;
  }

  public sendMultiIcon(value: number): PacketSender {
    // Temporarily disabled to avoid extra packets that the client isn't expecting
    // during bring-up.
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

  public sendFriendStatus(status: number) {
    const out = new PacketBuilder(221);
    out.put(status);
    this.player.getSession().write(out);
    return this;
  }

  public sendFriend(name: number | bigint, world: number) {
    world = world !== 0 ? world + 9 : world;
    const out = new PacketBuilder(50);
    out.putLong(name);
    out.put(world);
    this.player.getSession().write(out);
    return this;
  }

  public sendDeleteFriend(name: number | bigint) {
    const out = new PacketBuilder(51);
    out.putLong(name);
    this.player.getSession().write(out);
    return this;
  }

  public sendAddIgnore(name: number | bigint) {
    const out = new PacketBuilder(214);
    out.putLong(name);
    this.player.getSession().write(out);
    return this;
  }

  public sendDeleteIgnore(name: number | bigint) {
    const out = new PacketBuilder(215);
    out.putLong(name);
    this.player.getSession().write(out);
    return this;
  }

  public sendTotalExp(exp: number) {
    const out = new PacketBuilder(108);
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

  public sendAnimationReset(): PacketSender {
    let out = new PacketBuilder(1);
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

  public deleteRegionalSpawns(): PacketSender {
    this.player.getSession().write(new PacketBuilder(178));
    return this;
  }

  private writeLocalPosition(localX: number, localY: number): void {
    const out = new PacketBuilder(85);
    out.puts(localY, ValueType.C);
    out.puts(localX, ValueType.C);
    this.player.getSession().write(out);
  }

  private resolveLocalPosition(position: any): { localX: number; localY: number } | null {
    if (
      !position ||
      typeof position.getX !== "function" ||
      typeof position.getY !== "function"
    ) {
      return null;
    }

    const regionSource = this.player.getLastKnownRegion?.();
    if (!regionSource) {
      return null;
    }

    const localY = position.getY() - 8 * regionSource.getRegionY();
    const localX = position.getX() - 8 * regionSource.getRegionX();

    // Never clamp here. During region transitions, dropping out-of-range updates
    // is safer than emitting a wrong tile/object placement.
    if (localX < 0 || localX > 103 || localY < 0 || localY > 103) {
      return null;
    }

    return { localX, localY };
  }

  private sendPositionIfVisible(position: any): boolean {
    const local = this.resolveLocalPosition(position);
    if (!local) {
      return false;
    }
    this.writeLocalPosition(local.localX, local.localY);
    return true;
  }

  public sendPosition(position: any) {
    this.sendPositionIfVisible(position);
    return this;
  }

  public sendConsoleMessage(message: string) {
    let out = new PacketBuilder(123);
    out.putString(message);
    this.player.getSession().write(out);
    return this;
  }

  public sendInterfaceSpriteChange(
    childId: number,
    firstSprite: number,
    secondSprite: number
  ): PacketSender {
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

  public sendHideCombatBox(): PacketSender {
    this.player.getSession().write(new PacketBuilder(128));
    return this;
  }

  public sendObjectsRemoval(
    chunkX: number,
    chunkY: number,
    height: number
  ): PacketSender {
    this.player
      .getSession()
      .write(new PacketBuilder(153).put(chunkX).put(chunkY).put(height));
    return this;
  }

  // Basic chat message to client.
  sendMessage(message: string): this {
    const out = new PacketBuilder(253, PacketType.VARIABLE);
    out.putString(message ?? "");
    this.player.getSession().write(out);
    return this;
  }

  // Stubs to satisfy gameplay code; implement client opcodes as needed.
  sendPrivateMessage(..._args: any[]): this {
    return this;
  }

  sendInterfaceRemoval(): this {
    // Keep client/server interface state aligned with Java behavior.
    // A no-op here can leave stale inventory context active client-side, which
    // affects default left-click item actions (e.g. "Drop" appearing as primary).
    this.player.setStatus?.(PlayerStatus.NONE);
    this.player.setEnteredAmountAction?.(null);
    this.player.setEnteredSyntaxAction?.(null);
    this.player.getDialogueManager?.()?.reset?.();
    this.player.setDestroyItem?.(-1);
    this.player.setInterfaceId?.(-1);
    this.player.setCreationMenu?.(null);
    this.player.setSearchingBank?.(false);
    this.player.setTeleportInterfaceOpen?.(false);
    this.player.getAppearance?.()?.setCanChangeAppearance?.(false);
    // Java parity: close interfaces with opcode 219 only.
    this.player.getSession().write(new PacketBuilder(219, PacketType.FIXED));
    return this;
  }

  sendItemContainer(containerOrInterfaceId: number | any, interfaceId?: number): this {
    if (typeof containerOrInterfaceId === "number") {
      return this;
    }
    const container = containerOrInterfaceId;
    if (
      !container ||
      typeof container.getItems !== "function" ||
      typeof container.capacity !== "function" ||
      !Number.isInteger(interfaceId)
    ) {
      return this;
    }

    const items = container.getItems();
    const capacity = container.capacity();
    const includeZeroAmount = container?.constructor?.name === "Bank";

    const out = new PacketBuilder(53, PacketType.VARIABLE_SHORT);
    out.putInt(interfaceId);
    out.putShort(capacity);

    for (let slot = 0; slot < capacity; slot++) {
      const item = items?.[slot];
      const id = item?.getId?.() ?? -1;
      const amount = item?.getAmount?.() ?? 0;
      if (id <= 0 || (amount <= 0 && !includeZeroAmount)) {
        out.putInt(-1);
        continue;
      }
      out.putInt(amount);
      out.putShort(id + 1);
    }

    this.player.getSession().write(out);
    return this;
  }

  sendItemContainers(container: any, interfaceId: number): this {
    return this.sendItemContainer(container, interfaceId);
  }

  sendInterfaceItems(interfaceId: number, items?: any): this {
    const resolvedItems = Array.isArray(items) ? items : [];
    const out = new PacketBuilder(53, PacketType.VARIABLE_SHORT);
    out.putInt(interfaceId);
    out.putShort(resolvedItems.length);
    for (const item of resolvedItems) {
      const id = item?.getId?.() ?? item?.id ?? -1;
      const amount = item?.getAmount?.() ?? item?.amount ?? 0;
      if (id <= 0 || amount <= 0) {
        out.putInt(-1);
        continue;
      }
      out.putInt(amount);
      out.putShort(id + 1);
    }
    this.player.getSession().write(out);
    return this;
  }

  sendEffectTimer(_seconds: number, _effect: any): this {
    return this;
  }

  sendGraphic(..._args: any[]): this {
    return this;
  }

  sendGlobalGraphic(..._args: any[]): this {
    return this;
  }

  sendProjectile(
    start: any,
    end: any,
    offset: number,
    speed: number,
    projectileId: number,
    startHeight: number,
    endHeight: number,
    lockon: any,
    delay: number,
    angle: number = 16,
    distanceOffset: number = 64
  ): this {
    if (
      !start ||
      typeof start.getX !== "function" ||
      typeof start.getY !== "function" ||
      !end ||
      typeof end.getX !== "function" ||
      typeof end.getY !== "function"
    ) {
      return this;
    }

    if (!this.sendPositionIfVisible(start)) {
      return this;
    }

    const out = new PacketBuilder(117);
    out.put(offset);
    out.put(end.getX() - start.getX());
    out.put(end.getY() - start.getY());

    const targetIndex = this.resolveProjectileTargetIndex(lockon);
    out.putShort(targetIndex);

    out.putShort(projectileId);
    out.put(startHeight);
    out.put(endHeight);
    out.putShort(delay);
    out.putShort(speed);
    out.put(angle);
    out.put(distanceOffset);
    if (process.env.PROJECTILE_DEBUG === "1") {
      try {
        console.log(
          `[projectile.out] id=${projectileId} start=(${start.getX()},${start.getY()},${start.getZ?.() ?? 0}) end=(${end.getX()},${end.getY()},${end.getZ?.() ?? 0}) d=(${end.getX() - start.getX()},${end.getY() - start.getY()}) lockon=${targetIndex} delay=${delay} speed=${speed}`
        );
      } catch {
        // debug logging must never affect packet delivery
      }
    }
    this.player.getSession().write(out);
    return this;
  }

  private resolveProjectileTargetIndex(lockon: any): number {
    // Allow projectiles to pass a pre-resolved lock-on index so target binding
    // is stable even if the original lock-on entity reference later changes.
    if (Number.isInteger(lockon)) {
      return lockon;
    }
    if (
      lockon != null &&
      typeof lockon.getIndex === "function" &&
      typeof lockon.isPlayer === "function"
    ) {
      const index = lockon.getIndex();
      if (!Number.isInteger(index) || index < 0) {
        return 0;
      }
      return lockon.isPlayer() ? -(index + 1) : index + 1;
    }
    return 0;
  }

  // Additional stubs for gameplay code.
  sendTabs(): this {
    return this;
  }

  sendObject(object: any): this {
    if (
      !object ||
      typeof object.getLocation !== "function" ||
      typeof object.getId !== "function" ||
      typeof object.getType !== "function" ||
      typeof object.getFace !== "function"
    ) {
      return this;
    }

    // Avoid sending object deltas while the client is mid-region change.
    // RegionChange sync will send a full consistent object snapshot.
    if (this.player?.isAllowRegionChangePacket?.() === true) {
      return this;
    }

    const location = object.getLocation();
    if (!this.sendPositionIfVisible(location)) {
      return this;
    }
    const out = new PacketBuilder(151);
    out.puts(location.getZ(), ValueType.A);
    out.putShorts(object.getId(), ByteOrder.LITTLE);
    out.puts((object.getType() << 2) + (object.getFace() & 3), ValueType.S);
    this.player.getSession().write(out);
    return this;
  }

  sendObjectRemoval(object: any): this {
    if (
      !object ||
      typeof object.getLocation !== "function" ||
      typeof object.getType !== "function" ||
      typeof object.getFace !== "function"
    ) {
      return this;
    }

    // Avoid sending object deltas while the client is mid-region change.
    // RegionChange sync will send a full consistent object snapshot.
    if (this.player?.isAllowRegionChangePacket?.() === true) {
      return this;
    }

    const location = object.getLocation();
    if (!this.sendPositionIfVisible(location)) {
      return this;
    }
    const out = new PacketBuilder(101);
    out.puts((object.getType() << 2) + (object.getFace() & 3), ValueType.C);
    out.put(location.getZ());
    this.player.getSession().write(out);
    return this;
  }

  sendObjectAnimation(..._args: any[]): this {
    return this;
  }

  sendCreationMenu(menu: any): this {
    if (
      !menu ||
      typeof menu.getItems !== "function" ||
      typeof menu.getTitle !== "function"
    ) {
      return this;
    }

    const rawItems = menu.getItems();
    const items = Array.isArray(rawItems)
      ? rawItems.filter((id: unknown) => Number.isInteger(id))
      : [];
    if (items.length <= 0) {
      return this;
    }

    this.player.setCreationMenu?.(menu);
    this.sendString(String(menu.getTitle() ?? "What would you like to make?"), 31104);

    const out = new PacketBuilder(167, PacketType.VARIABLE);
    out.put(items.length);
    for (const itemId of items) {
      out.putInt(itemId);
    }
    this.player.getSession().write(out);
    return this;
  }

  sendItemContainerInterface(_containerId: number, _interfaceId: number): this {
    return this;
  }

  sendItemOnWidget(_widgetId: number, _modelZoom: number, _itemId: number): this {
    return this;
  }

  alterGroundItem(item: any): this {
    if (!item || typeof item.getPosition !== "function" || typeof item.getItem !== "function") {
      return this;
    }
    if (!this.sendPositionIfVisible(item.getPosition())) {
      return this;
    }
    const out = new PacketBuilder(84);
    out.put(0);
    out
      .putShort(item.getItem().getId())
      .putInt(item.getOldAmount?.() ?? 0)
      .putInt(item.getItem().getAmount());
    this.player.getSession().write(out);
    return this;
  }

  deleteGroundItem(item: any): this {
    if (!item || typeof item.getPosition !== "function" || typeof item.getItem !== "function") {
      return this;
    }
    if (!this.sendPositionIfVisible(item.getPosition())) {
      return this;
    }
    const out = new PacketBuilder(156);
    out.puts(0, ValueType.A);
    out.putShort(item.getItem().getId());
    this.player.getSession().write(out);
    return this;
  }

  createGroundItem(item: any): this {
    if (!item || typeof item.getPosition !== "function" || typeof item.getItem !== "function") {
      return this;
    }
    if (!this.sendPositionIfVisible(item.getPosition())) {
      return this;
    }
    const out = new PacketBuilder(44);
    out.putShort(item.getItem().getId(), ValueType.A, ByteOrder.LITTLE);
    out.putInt(item.getItem().getAmount()).put(0);
    this.player.getSession().write(out);
    return this;
  }

  sendItemOnEquipment(_slot: number): this {
    return this;
  }

  sendSkill(skill: any): this {
    if (!skill || typeof skill.getIndex !== "function") {
      return this;
    }
    const skillManager = this.player?.getSkillManager?.();
    if (!skillManager) {
      return this;
    }

    const out = new PacketBuilder(134);
    out.put(skill.getIndex());
    out.putInt(skillManager.getCurrentLevel(skill));
    out.putInt(skillManager.getMaxLevel(skill));
    out.putInt(skillManager.getExperience(skill));
    this.player.getSession().write(out);
    return this;
  }

  sendExpDrop(skill: any, exp: number): this {
    if (!skill || typeof skill.getIndex !== "function") {
      return this;
    }
    const out = new PacketBuilder(116);
    out.put(skill.getIndex());
    out.putInt(exp);
    this.player.getSession().write(out);
    return this;
  }
}
