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

export interface PluginCommandEvent {
  player: any;
  raw: string;
  base: string;
  parts: string[];
  handled: boolean;
}

export interface PluginApi {
  onPacketReceived(handler: (event: PluginPacketEvent) => void): void;
  onEstablishedPacket(handler: (event: PluginPacketEvent) => void): void;
  onPlayerLogin(handler: (event: PluginPlayerLoginEvent) => void): void;
  onPlayerDisconnect(handler: (event: PluginPlayerDisconnectEvent) => void): void;
  onRegionLoaded(handler: (event: PluginRegionLoadedEvent) => void): void;
  onPathBlocked(handler: (event: PluginPathBlockedEvent) => void): void;
  onPlayerPathBlocked(handler: (event: PluginPlayerPathBlockedEvent) => void): void;
  onObjectInteraction(handler: (event: PluginObjectInteractionEvent) => void): void;
  onCommand(handler: (event: PluginCommandEvent) => void): void;
  registerCommand(
    command: string,
    handler: (event: PluginCommandEvent) => void | boolean
  ): void;
  onObjectClick(
    objectId: number,
    clickType: number,
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  onObjectFirstClick(
    objectId: number,
    handler: (event: PluginObjectInteractionEvent) => void | boolean
  ): void;
  registerPacketListener(opcode: number, listener: PacketExecutor): void;
  registerAlivePacketListener(opcode: number, listener: PacketExecutor): void;
  setPlayerPersistence(persistence: PlayerPersistence): void;
  log(message: string, extra?: Record<string, unknown>): void;
}

export interface PluginModule {
  name: string;
  register(api: PluginApi): void;
}
