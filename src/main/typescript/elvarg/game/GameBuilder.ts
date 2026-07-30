import { CombatPoisonData } from '../game/task/impl/CombatPoisonEffect'
import { PlayerPunishment } from "../util/PlayerPunishment";
import { Systems } from "./Systems";
import { RegionManager } from "./collision/RegionManager";
import { GameEngine } from "./GameEngine";
import { ObjectSpawnDefinitionLoader } from "./definition/loader/impl/ObjectSpawnDefinitionLoader";
import { NpcDefinitionLoader } from "./definition/loader/impl/NpcDefinitionLoader";
import { NpcDropDefinitionLoader } from "./definition/loader/impl/NpcDropDefinitionLoader";
import { InterfaceLayoutDefinitionLoader } from "./definition/loader/impl/InterfaceLayoutDefinitionLoader";
import { PluginManager } from "../plugins/PluginManager";

export class GameBuilder {
    public initialize(): void {
        // Setup systems
        Systems.init();
    
        // Start immediate tasks..
        RegionManager.init();
    
        // Load startup data before the engine begins ticking.
        this.loadStartupData();
    
        // Start global tasks..
    
        // Start game engine..
        new GameEngine().init();

        PluginManager.emitServerStartup({ timestamp: Date.now() });
    }
    
    private loadStartupData(): void {
        CombatPoisonData.init();
        PlayerPunishment.init();
        new InterfaceLayoutDefinitionLoader().load();
        new ObjectSpawnDefinitionLoader().load();
        new NpcDefinitionLoader().load();
        new NpcDropDefinitionLoader().load();
    }
}
