import { ClanChatManager } from './content/clan/ClanChatManager';
import { GameConstants } from './GameConstants';
import { World } from '../game/World';


/**
 * The engine which processes the game.
 *
 * @author Professor Oak
 */
export class GameEngine  {
    private scheduler: NodeJS.Timeout;
    
    constructor() {
        // ...
    }
    
    public init() {
        // Tick the game engine at the configured interval (milliseconds).
        this.scheduler = setInterval(this.run.bind(this), GameConstants.GAME_ENGINE_PROCESSING_CYCLE_RATE);
    }
    
    public async run() {
        try {
            await World.process();
        } catch (e) {
            console.log(e);
            World.savePlayers();
            ClanChatManager.save();
        }
    }
}
