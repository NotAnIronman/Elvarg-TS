import { Player } from "../Player";
import { PlayerPersistence } from "./PlayerPersistence";
import { PlayerSave } from "./PlayerSave";

export class NullPlayerPersistence extends PlayerPersistence {
  load(username: string): PlayerSave {
    return null as any;
  }

  save(player: Player): void {
    // no persistence during debugging
  }

  exists(username: string): boolean {
    return false;
  }
}
