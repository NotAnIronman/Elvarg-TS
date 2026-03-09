import { HitDamage } from "./HitDamage"
import { PendingHit } from "./PendingHit";
import { Mobile } from "../../../entity/impl/Mobile";
import { Flag } from "../../../model/Flag";
import { CombatFactory } from "../../../content/combat/CombatFactory";


export class HitQueue {
    private pendingHits: PendingHit[] = [];
    private pendingDamage: HitDamage[] = [];
    private pendingDamageOffset = 0;

    public process(character: Mobile) {
        if (character.getHitpoints() <= 0) {
            this.pendingHits = [];
            this.pendingDamage = [];
            this.pendingDamageOffset = 0;
            return;
        }

        if (this.pendingHits.length > 0) {
            let writeIndex = 0;
            for (let i = 0; i < this.pendingHits.length; i++) {
                const hit = this.pendingHits[i];
                if (
                    hit == null ||
                    hit.getTarget() == null ||
                    hit.getAttacker() == null ||
                    hit.getTarget().isUntargetable() ||
                    hit.getAttacker().getHitpoints() <= 0
                ) {
                    continue;
                }

                if (hit.getAndDecrementDelay() <= 0) {
                    CombatFactory.executeHit(hit);
                    continue;
                }

                this.pendingHits[writeIndex++] = hit;
            }
            this.pendingHits.length = writeIndex;
        }

        if (this.pendingDamageOffset < this.pendingDamage.length) {
            if (!character.getUpdateFlag().flagged(Flag.SINGLE_HIT)) {
                const firstHit = this.pendingDamage[this.pendingDamageOffset++];

                // Check if it's present
                if (firstHit != null) {

                    // Update entity hit data and deal the actual damage.
                    character.setPrimaryHit(character.decrementHealth(firstHit));
                    character.getUpdateFlag().flag(Flag.SINGLE_HIT);
                }
            }

            // Update the secondary hit for this entity.
            if (!character.getUpdateFlag().flagged(Flag.DOUBLE_HIT)) {

                // Attempt to fetch a second hit.
                const secondHit = this.pendingDamage[this.pendingDamageOffset++];

                // Check if it's present
                if (secondHit != null){
                

                    // Update entity hit data and deal the actual damage.
                    character.setSecondaryHit(character.decrementHealth(secondHit));
                    character.getUpdateFlag().flag(Flag.DOUBLE_HIT);
                }
            }
            if (this.pendingDamageOffset >= this.pendingDamage.length) {
                this.pendingDamage.length = 0;
                this.pendingDamageOffset = 0;
            } else if (this.pendingDamageOffset >= 32 && this.pendingDamageOffset * 2 >= this.pendingDamage.length) {
                let writeIndex = 0;
                for (let i = this.pendingDamageOffset; i < this.pendingDamage.length; i++) {
                    this.pendingDamage[writeIndex++] = this.pendingDamage[i];
                }
                this.pendingDamage.length = writeIndex;
                this.pendingDamageOffset = 0;
            }
        }
    }

    public addPendingHit(c_h: PendingHit) {
        this.pendingHits.push(c_h);
    }

    public addPendingDamage(hits: HitDamage[]) {
        for (let i = 0; i < hits.length; i++) {
            const hit = hits[i];
            if (hit != null) {
                this.pendingDamage.push(hit);
            }
        }
    }

    public hasPendingWork(): boolean {
        return this.pendingHits.length > 0 || this.pendingDamageOffset < this.pendingDamage.length;
    }

    public getAccumulatedDamage(): number {
        let hitDmg = 0;
        for (let i = 0; i < this.pendingHits.length; i++) {
            const pendingHit = this.pendingHits[i];
            if (pendingHit != null && pendingHit.getExecutedInTicks() < 2) {
                hitDmg += pendingHit.getTotalDamage();
            }
        }
        let dmg = 0;
        for (let i = this.pendingDamageOffset; i < this.pendingDamage.length; i++) {
            const hit = this.pendingDamage[i];
            if (hit != null) {
                dmg += hit.getDamage();
            }
        }
        return hitDmg + dmg;
    }

    public isEmpty(exception: Mobile): boolean {
        for (let hit of this.pendingHits) {
          if (hit == null) {
            continue;
          }
          if (hit.getAttacker() != null) {
            if (hit.getAttacker() !== exception) {
              return false;
            }
          }
        }
        return true;
      }
}
