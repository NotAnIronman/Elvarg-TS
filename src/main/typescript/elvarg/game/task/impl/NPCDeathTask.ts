import { Task } from "../Task";
import { World } from "../../World";
import { NPC } from "../../entity/impl/npc/NPC";
import { NPCDropGenerator } from '../../../game/entity/impl/npc/NPCDropGenerator'
import { Barricades } from "../../entity/impl/npc/impl/Barricades";
import { Player } from "../../entity/impl/player/Player";
import { Animation } from "../../model/Animation";
import { Priority } from "../../model/Priority";
import { TaskManager } from "../TaskManager";
import { NPCRespawnTask } from '../impl/NPCRespawnTask'
import { PluginManager } from "../../../plugins/PluginManager";


export class NPCDeathTask extends Task {
    private npc: NPC
    private ticks: number;
    private killer: Player | null;
    
    /**
     * The NPCDeathTask constructor.
     *
     * @param npc The npc being killed.
     */
    constructor(npc: NPC) {
        super(2);
        this.npc = npc;
        this.ticks = 1;
    }

    public execute(): void {
        switch (this.ticks) {
            case 1:
                this.npc.getMovementQueue().setBlockMovement(true).reset();
                this.killer = this.npc.getCombat().getKiller(true);
                this.npc.performAnimation(new Animation(this.npc.getCurrentDefinition().getDeathAnim()));
                this.npc.getCombat().reset();
                this.npc.setMobileInteraction(null);
                break;
            case 0:
                if (this.killer !== undefined) {
                    if (this.killer.getArea() !== null) {
                        this.killer.getArea().defeated(this.killer, this.npc);
                    }
                    PluginManager.emitNpcDeath({
                        killer: this.killer,
                        npc: this.npc,
                        npcId: this.npc.getId(),
                        location: {
                            x: this.npc.getLocation().getX(),
                            y: this.npc.getLocation().getY(),
                            z: this.npc.getLocation().getZ(),
                        },
                    });
                    NPCDropGenerator.start(this.killer, this.npc);
                }
                this.stop();
                break;
        }
        this.ticks--;
    }
    
    public stop(): void {
        super.stop();
        const skipDefaultRespawn = (this.npc as any).__skipDefaultRespawn === true;
        (this.npc as any).__skipDefaultRespawn = false;

        if (this.npc.getArea() !== null) {
            this.npc.getArea().leave(this.npc, false);
            this.npc.getArea().postLeave(this.npc, false);
            this.npc.setArea(null);
        }
        this.npc.setDying(false);
        this.npc.setNpcTransformationId(-1);
        if (!skipDefaultRespawn && this.npc.getDefinition().getRespawn() > 0) {
            TaskManager.submit(new NPCRespawnTask(this.npc, this.npc.getDefinition().getRespawn()));
        }
        if (this.npc.isBarricade()) {
            Barricades.checkTile(this.npc.getLocation());
        }
        World.getRemoveNPCQueue().push(this.npc);
    }
}
