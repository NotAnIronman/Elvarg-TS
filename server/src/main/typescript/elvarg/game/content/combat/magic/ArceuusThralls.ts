import { World } from "../../../World";
import { NPC } from "../../../entity/impl/npc/NPC";
import { Player } from "../../../entity/impl/player/Player";
import { Skill } from "../../../model/Skill";
import { HitDamage } from "../hit/HitDamage";
import { HitMask } from "../hit/HitMask";
import { Task } from "../../../task/Task";
import { TaskManager } from "../../../task/TaskManager";

const THRALL_KEY = "arceuus:thrall";

export class ArceuusThralls {
    public static summon(player: Player, npcId: number, prayerCost: number, maxHit: number): void {
        const previous = player.getAttribute(THRALL_KEY) as NPC | null;
        if (previous?.isRegistered()) World.getRemoveNPCQueue().push(previous);

        player.getSkillManager().decreaseCurrentLevel(
            Skill.PRAYER,
            prayerCost,
            0,
        );
        const thrall = NPC.create(npcId, player.getLocation().clone());
        thrall.setOwner(player);
        thrall.setPet(true);
        thrall.setUntargetable(true);
        (thrall as any).__skipDefaultRespawn = true;
        player.setAttribute(THRALL_KEY, thrall);
        World.getAddNPCQueue().push(thrall);

        let ticks = player.getSkillManager().getMaxLevel(Skill.MAGIC);
        TaskManager.submit(new class extends Task {
            constructor() { super(1); }
            execute(): void {
                if (player.getAttribute(THRALL_KEY) !== thrall || !player.isRegistered() || --ticks <= 0) {
                    if (thrall.isRegistered()) World.getRemoveNPCQueue().push(thrall);
                    if (player.getAttribute(THRALL_KEY) === thrall) player.setAttribute(THRALL_KEY, null);
                    this.stop();
                    return;
                }
                if (!thrall.isRegistered()) return;
                const target = player.getCombat().getTarget();
                if (target?.isNpc() && target.isRegistered() && target.getHitpoints() > 0 && ticks % 4 === 0) {
                    target.getCombat().getHitQueue().addPendingDamage([new HitDamage(maxHit, HitMask.RED)]);
                }
                if (thrall.getLocation().getDistance(player.getLocation()) > 4) {
                    thrall.moveTo(player.getLocation().clone());
                }
            }
        });
    }
}
