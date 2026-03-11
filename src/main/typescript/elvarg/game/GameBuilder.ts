import { BackgroundLoader } from "../util/BackgroundLoader";
import { CombatPoisonData } from '../game/task/impl/CombatPoisonEffect'
import { PlayerPunishment } from "../util/PlayerPunishment";
import { Systems } from "./Systems";
import { RegionManager } from "./collision/RegionManager";
import { GameEngine } from "./GameEngine";
import { ObjectSpawnDefinitionLoader } from "./definition/loader/impl/ObjectSpawnDefinitionLoader";
import { NpcDefinitionLoader } from "./definition/loader/impl/NpcDefinitionLoader";
import { NpcDropDefinitionLoader } from "./definition/loader/impl/NpcDropDefinitionLoader";
import { PluginManager } from "../plugins/PluginManager";

export class GameBuilder {
    private backgroundLoader = new BackgroundLoader();
    
    public initialize(): void {
        // Setup systems
        Systems.init();
    
        // Start immediate tasks..
        RegionManager.init();
    
        // Start background tasks..
        this.backgroundLoader.init(this.createBackgroundTasks());
    
        // Start global tasks..
    
        // Start game engine..
        new GameEngine().init();
    
        // Make sure the background tasks loaded properly..
        if (!this.backgroundLoader.awaitCompletion())
            throw new Error("Background load did not complete normally!");

        PluginManager.emitServerStartup({ timestamp: Date.now() });
    }
    
    public createBackgroundTasks(): Iterable<() => void> {
        function* tasks(): IterableIterator<() => void> {
            yield CombatPoisonData.init;
            yield PlayerPunishment.init;
    
            // Load definitions..
            yield () => new ObjectSpawnDefinitionLoader().load();
            yield () => new NpcDefinitionLoader().load();
            yield () => new NpcDropDefinitionLoader().load();
            //yield () => new NPCSpawnDumper().dump();
        }
    
        return tasks();
    }
}
