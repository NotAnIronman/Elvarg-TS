import { Packet } from "../net/packet/Packet";
import { PacketExecutor } from "../net/packet/PacketExecutor";
import { PlayerPersistence } from "../game/entity/impl/player/persistence/PlayerPersistence";

export interface PluginPacketEvent {
  opcode: number;
  packet: Packet;
  player: any;
  stage: string;
}

export interface PluginPlayerLoginEvent {
  player: any;
  username: string;
}

export interface PluginPlayerDisconnectEvent {
  player: any;
  username: string;
  source: string;
}

export interface PluginPlayerLogoutEvent {
  player: any;
  username: string;
}

export interface PluginPlayerProcessEvent {
  player: any;
}

export interface PluginRegionLoadedEvent {
  regionId: number;
  absX: number;
  absY: number;
}

export interface PluginPathBlockedEvent {
  entity: any;
  isPlayer: boolean;
  username: string | null;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  basicPather: boolean;
  requestedSize: number;
  xLength: number;
  yLength: number;
  direction: number;
  blockingMask: number;
}

export interface PluginPlayerPathBlockedEvent extends PluginPathBlockedEvent {
  isPlayer: true;
  username: string;
}

export interface PluginObjectInteractionEvent {
  player: any;
  object: any;
  objectId: number;
  clickType: number;
  location: { x: number; y: number; z: number };
  sourceLocation?: { x: number; y: number; z: number };
  handled: boolean;
}

export interface PluginNpcInteractionEvent {
  player: any;
  npc: any;
  npcId: number;
  npcIndex: number;
  clickType: number;
  location: { x: number; y: number; z: number };
  handled: boolean;
}

export interface PluginNpcDeathEvent {
  killer: any;
  npc: any;
  npcId: number;
  location: { x: number; y: number; z: number };
}

export interface PluginCanAttackEvent {
  attacker: any;
  target: any;
  allow: boolean | null;
}

export interface PluginCanTeleportEvent {
  player: any;
  allow: boolean | null;
}

export interface PluginCanEatEvent {
  player: any;
  itemId: number;
  allow: boolean | null;
}

export interface PluginCanDrinkEvent {
  player: any;
  itemId: number;
  allow: boolean | null;
}

export interface PluginCanTradeEvent {
  player: any;
  target: any;
  allow: boolean | null;
}

export interface PluginCanEquipEvent {
  player: any;
  slot: number;
  item: any;
  allow: boolean | null;
}

export interface PluginSpellDisabledEvent {
  player: any;
  spellbook: any;
  spellId: number;
  disabled: boolean | null;
}

export interface PluginNpcAggressionToleranceEvent {
  player: any;
  npc: any;
  override: boolean | null;
}

export interface PluginPlayerDefeatedEvent {
  killer: any;
  victim: any;
}

export interface PluginItemOnObjectEvent {
  player: any;
  object: any;
  objectId: number;
  item: any;
  itemId: number;
  itemSlot: number;
  interfaceType: number;
  location: { x: number; y: number; z: number };
  handled: boolean;
}

export interface PluginItemOnItemEvent {
  player: any;
  usedItem: any;
  usedItemId: number;
  usedItemSlot: number;
  usedWithItem: any;
  usedWithItemId: number;
  usedWithItemSlot: number;
  handled: boolean;
}

export interface PluginItemOnGroundItemEvent {
  player: any;
  inventoryItem: any;
  inventoryItemId: number;
  groundItemId: number;
  location: { x: number; y: number; z: number };
  handled: boolean;
}

export interface PluginItemActionEvent {
  player: any;
  interfaceId: number;
  item: any;
  itemId: number;
  slot: number;
  clickType: number;
  handled: boolean;
}

export interface PluginItemDropEvent {
  player: any;
  interfaceId: number;
  item: any;
  itemId: number;
  slot: number;
  handled: boolean;
}

export interface PluginCommandEvent {
  player: any;
  raw: string;
  base: string;
  parts: string[];
  handled: boolean;
}

export interface PluginButtonClickEvent {
  player: any;
  buttonId: number;
  handled: boolean;
}

export interface PluginInterfaceActionClickEvent {
  player: any;
  buttonId: number;
  action: number;
  handled: boolean;
}

export interface PluginCombatEngine {
  getMethod(attacker: any): any;
  canReach(attacker: any, method: any, target: any): boolean;
  canAttack(attacker: any, method: any, target: any): any;
  addPendingHit(hit: any): void;
  executeHit(hit: any): void;
}

export interface PluginCombatMethodResolver {
  resolve(attacker: any): any | null;
}

export interface PluginNpcCombatMethodProvider {
  provide(npc: any): any | null;
}
export interface PluginNpcCombatMethodProviderEntry {
  pluginName: string;
  provider: PluginNpcCombatMethodProvider;
  npcIds: Set<number>;
}
export interface PluginRegisteredNpcCombatMethodProvider {
  pluginName: string;
  provider: PluginNpcCombatMethodProvider;
  npcIds: Set<number>;
}

export interface PluginCombatDamageProvider {
  calculateMaxMeleeHit(entity: any): number;
  calculateMaxRangedHit(entity: any): number;
  calculateMagicMaxHit(entity: any): number;
  getHitDamage(attacker: any, victim: any, combatType: any): any;
  applyExtraHitRolls(
    attacker: any,
    target: any,
    combatType: any,
    damage: any,
    accurate: boolean,
    method: any
  ): void;
}

export interface PluginApi {
  onPacketReceived(handler: (event: PluginPacketEvent) => void): void;
  onEstablishedPacket(handler: (event: PluginPacketEvent) => void): void;
  onPlayerLogin(handler: (event: PluginPlayerLoginEvent) => void): void;
  onPlayerDisconnect(handler: (event: PluginPlayerDisconnectEvent) => void): void;
  onPlayerLogout(handler: (event: PluginPlayerLogoutEvent) => void): void;
  onPlayerProcess(handler: (event: PluginPlayerProcessEvent) => void): void;
  onRegionLoaded(handler: (event: PluginRegionLoadedEvent) => void): void;
  onPathBlocked(handler: (event: PluginPathBlockedEvent) => void): void;
  onPlayerPathBlocked(handler: (event: PluginPlayerPathBlockedEvent) => void): void;
  onObjectInteraction(handler: (event: PluginObjectInteractionEvent) => void): void;
  onNpcInteraction(handler: (event: PluginNpcInteractionEvent) => void): void;
  onNpcDeath(handler: (event: PluginNpcDeathEvent) => void): void;
  onCanAttack(handler: (event: PluginCanAttackEvent) => void): void;
  onCanTeleport(handler: (event: PluginCanTeleportEvent) => void): void;
  onCanEat(handler: (event: PluginCanEatEvent) => void): void;
  onCanDrink(handler: (event: PluginCanDrinkEvent) => void): void;
  onCanTrade(handler: (event: PluginCanTradeEvent) => void): void;
  onCanEquip(handler: (event: PluginCanEquipEvent) => void): void;
  onSpellDisabled(handler: (event: PluginSpellDisabledEvent) => void): void;
  onNpcAggressionTolerance(
    handler: (event: PluginNpcAggressionToleranceEvent) => void
  ): void;
  onPlayerDefeated(handler: (event: PluginPlayerDefeatedEvent) => void): void;
  onSlayerAssignRequest(handler: (player: any) => boolean): void;
  onNpcClick(
    npcId: number,
    clickType: number,
    handler: (event: PluginNpcInteractionEvent) => void | boolean
  ): void;
  onNpcSecondClick(
    npcId: number,
    handler: (event: PluginNpcInteractionEvent) => void | boolean
  ): void;
  onItemOnObject(handler: (event: PluginItemOnObjectEvent) => void): void;
  onItemOnItem(handler: (event: PluginItemOnItemEvent) => void): void;
  onItemOnGroundItem(handler: (event: PluginItemOnGroundItemEvent) => void): void;
  onItemAction(handler: (event: PluginItemActionEvent) => void): void;
  onItemDrop(handler: (event: PluginItemDropEvent) => void): void;
  onItemFirstAction(
    handler: (event: PluginItemActionEvent) => void | boolean
  ): void;
  onButtonClick(handler: (event: PluginButtonClickEvent) => void): void;
  onButton(
    buttonIds: number | number[],
    handler: (event: PluginButtonClickEvent) => void | boolean
  ): void;
  onInterfaceActionClick(
    handler: (event: PluginInterfaceActionClickEvent) => void
  ): void;
  onInterfaceActionButton(
    buttonIds: number | number[],
    handler: (event: PluginInterfaceActionClickEvent) => void | boolean
  ): void;
  onCommand(handler: (event: PluginCommandEvent) => void): void;
  registerCommand(
    command: string,
    handler: (event: PluginCommandEvent) => void | boolean
  ): void;
  onObjectClick(
    objectIds: number | number[],
    clickType: number,
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  onObjectFirstClick(
    objectIds: number | number[],
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  onObjectSecondClick(
    objectIds: number | number[],
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  onObjectThirdClick(
    objectIds: number | number[],
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  onObjectFourthClick(
    objectIds: number | number[],
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  onObjectFifthClick(
    objectIds: number | number[],
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  registerPacketListener(opcode: number, listener: PacketExecutor): void;
  registerAlivePacketListener(opcode: number, listener: PacketExecutor): void;
  setPlayerPersistence(persistence: PlayerPersistence): void;
  log(message: string, extra?: Record<string, unknown>): void;
  setCombatEngine(engine: PluginCombatEngine): void;
  setCombatDamageProvider(provider: PluginCombatDamageProvider): void;
  registerCombatMethodResolver(resolver: PluginCombatMethodResolver): void;
  /**
   * Registers a combat method provider for one or more NPC IDs.
   * @param npcIds identifiers to bring under this method
   * @param methodCtor constructor for the combat method to instantiate
   * @param options optional overrides (default to a singleton instance)
   */
  registerNpcCombatMethodProvider(
    npcIds: number | number[],
    methodCtor: new () => any,
    options?: { singleton?: boolean }
  ): void;
}

export interface PluginModule {
  name: string;
  register(api: PluginApi): void;
}
