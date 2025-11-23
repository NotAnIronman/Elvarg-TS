import { Location } from "../Location";
import { CastleWars } from "../../content/minigames/impl/CastleWars";
import { TeleportButton } from "../teleportation/TeleportButton";

export class Teleportable {
  constructor(
    private readonly teleportButton: TeleportButton,
    private readonly type: number,
    private readonly index: number,
    private readonly position: Location
  ) {}

  public getTeleportButton(): TeleportButton {
    return this.teleportButton;
  }
  public getType(): number {
    return this.type;
  }
  public getIndex(): number {
    return this.index;
  }
  public getPosition(): Location {
    return this.position;
  }

  // Static presets
  public static readonly EDGEVILLE_DITCH = new Teleportable(
    TeleportButton.WILDERNESS,
    0,
    0,
    new Location(3088, 3520)
  );
  public static readonly WEST_DRAGONS = new Teleportable(
    TeleportButton.WILDERNESS,
    0,
    1,
    new Location(2979, 3592)
  );
  public static readonly EAST_DRAGONS = new Teleportable(
    TeleportButton.WILDERNESS,
    0,
    2,
    new Location(3356, 3675)
  );
  public static readonly KING_BLACK_DRAGON = new Teleportable(
    TeleportButton.BOSSES,
    2,
    1,
    new Location(3005, 3850)
  );
  public static readonly CHAOS_ELEMENTAL = new Teleportable(
    TeleportButton.BOSSES,
    2,
    2,
    new Location(3267, 3916)
  );
  public static readonly ELDER_CHAOS_DRUID = new Teleportable(
    TeleportButton.BOSSES,
    2,
    3,
    new Location(3236, 3636)
  );
  public static readonly CRAZY_ARCHAEOLOGIST = new Teleportable(
    TeleportButton.BOSSES,
    2,
    4,
    new Location(2980, 3708)
  );
  public static readonly CHAOS_FANATIC = new Teleportable(
    TeleportButton.BOSSES,
    2,
    5,
    new Location(2986, 3838)
  );
  public static readonly VENENATIS = new Teleportable(
    TeleportButton.BOSSES,
    2,
    6,
    new Location(3346, 3727)
  );
  public static readonly VET_ION = new Teleportable(
    TeleportButton.BOSSES,
    2,
    7,
    new Location(3187, 3787)
  );
  public static readonly CALLISTO = new Teleportable(
    TeleportButton.BOSSES,
    2,
    8,
    new Location(3312, 3830)
  );
  public static readonly DUEL_ARENA = new Teleportable(
    TeleportButton.MINIGAME,
    1,
    0,
    new Location(3370, 3270)
  );
  public static readonly BARROWS = new Teleportable(
    TeleportButton.MINIGAME,
    1,
    1,
    new Location(3565, 3313)
  );
  public static readonly FIGHT_CAVES = new Teleportable(
    TeleportButton.MINIGAME,
    1,
    2,
    new Location(2439, 5171)
  );
  public static readonly CASTLE_WARS = new Teleportable(
    TeleportButton.MINIGAME,
    1,
    3,
    CastleWars.LOBBY_TELEPORT
  );
}
