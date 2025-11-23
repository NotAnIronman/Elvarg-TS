// @ts-nocheck
import { PlayerSession } from "../../../../net/PlayerSession";
import { Location } from "../../../model/Location";

// Lightweight stub to satisfy type checks; bot logic is not active.
export class PlayerBot {
  // Allow any property/method access on this stub.
  [key: string]: any;
  private location: Location;

  constructor(session?: PlayerSession, spawnLocation?: Location) {
    this.location = spawnLocation ?? new Location(0, 0);
  }

  // Bot-specific helpers stubbed out
  isPlayerBot(): boolean { return true; }
  getCombatInteraction(): any {
    return {
      targetAssigned: false,
      takenDamage: false,
      reset: () => {},
      process: () => {},
      handleDeath: () => {},
      handleDying: () => {}
    };
  }
  getTradingInteraction(): any {
    return {
      holdingItems: false,
      targetAssigned: false,
      receivedItems: false,
      acceptTradeRequest: () => {},
      addItemsToTrade: () => {},
      acceptTrade: () => {}
    };
  }
  getMovementInteraction(): any { return {}; }
  getInteractingWith(): any { return null; }
  setInteractingWith(_p: any) {}
  sendChat(_msg?: string) {}
  stopCommand() {}
  startCommand(..._args: any[]) {}
  getActiveCommand(): any { return null; }
  getChatCommands(): any[] { return []; }
  getCurrentState(): any { return null; }
  getSpawnPosition(): Location { return this.location; }
  getLocation(): Location { return this.location; }
  setLocation(location: Location) { this.location = location; }
  requestTrade(_p?: any) {}
  acceptTrade(_p?: any) {}
  updateLocalPlayers(): void {}
  getDefinition(): any { return {}; }
  chatInteraction: any = { heard: () => {} };
  getPacketSender(): any {
    return {
      sendMessage: () => {},
      sendString: () => {},
      sendInterfaceSet: () => {},
      sendItemContainer: () => {},
      sendInterfaceRemoval: () => {},
      sendSpecialAttackState: () => {}
    };
  }
}
