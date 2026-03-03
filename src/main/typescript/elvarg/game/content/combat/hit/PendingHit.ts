import { CombatFactory } from "../CombatFactory";
import { HitDamage } from "./HitDamage";
import { CombatType } from "../CombatType";
import { CombatMethod } from "../method/CombatMethod";
import { Mobile } from "../../../entity/impl/Mobile";
import type { Player } from "../../../entity/impl/player/Player";
import { AccuracyFormulasDpsCalc } from "../formula/AccuracyFormulasDpsCalc";
import { HitMask } from "./HitMask";

type PendingHitConfig = {
    delay?: number;
    handleAfterHitEffects?: boolean;
    hitAmount?: number;
    rollAccuracy?: boolean;
};

export class PendingHit {
    private attacker: Mobile;
    private target: Mobile;
    private method: CombatMethod;
    private combatType: CombatType;
    private hits: HitDamage[];
    private totalDamage = 0;
    private delay: number;
    private accurate: boolean;
    private handleAfterHitEffects: boolean;

    constructor(attacker: Mobile, target: Mobile, method: CombatMethod, delayOrConfig?: number | PendingHitConfig, handleAfterHitEffects?: boolean) {
        this.attacker = attacker;
        this.target = target;
        this.method = method;
        this.combatType = method.type();

        let resolvedDelay = 0;
        let resolvedHandleAfterHitEffects = true;
        let resolvedHitAmount = 1;
        let resolvedRollAccuracy = true;

        if (typeof delayOrConfig === "number") {
            resolvedDelay = delayOrConfig;
            if (typeof handleAfterHitEffects === "boolean") {
                resolvedHandleAfterHitEffects = handleAfterHitEffects;
            }
        } else if (delayOrConfig && typeof delayOrConfig === "object") {
            if (Number.isInteger(delayOrConfig.delay)) {
                resolvedDelay = delayOrConfig.delay as number;
            }
            if (typeof delayOrConfig.handleAfterHitEffects === "boolean") {
                resolvedHandleAfterHitEffects = delayOrConfig.handleAfterHitEffects;
            }
            if (Number.isInteger(delayOrConfig.hitAmount) && (delayOrConfig.hitAmount as number) > 0) {
                resolvedHitAmount = delayOrConfig.hitAmount as number;
            }
            if (typeof delayOrConfig.rollAccuracy === "boolean") {
                resolvedRollAccuracy = delayOrConfig.rollAccuracy;
            }
        }

        this.hits = this.prepareHits(resolvedHitAmount, resolvedRollAccuracy);
        this.delay = Math.max(0, resolvedDelay);
        this.handleAfterHitEffects = resolvedHandleAfterHitEffects;
    }

    public getAttacker(): Mobile {
        return this.attacker;
    }

    public getTarget(): Mobile {
        return this.target;
    }

    public getCombatMethod(): CombatMethod {
        return this.method;
    }

    public getHits(): HitDamage[] {
        return this.hits;
    }

    public getAndDecrementDelay(): number {
        return this.delay--;
    }

    public getExecutedInTicks(): number {
        return this.delay;
    }

    public getTotalDamage(): number {
        return this.totalDamage;
    }

    public isAccurate(): boolean {
        return this.accurate;
    }

    public setTotalDamage(damage: number): void {
        for (let hit of this.hits) {
            hit.setDamage(damage);
        }
        this.updateTotalDamage();
    }

    public setHandleAfterHitEffects(handleAfterHitEffects: boolean): PendingHit {
        this.handleAfterHitEffects = handleAfterHitEffects;
        return this;
    }

    public getHandleAfterHitEffects(): boolean {
        return this.handleAfterHitEffects;
    }

    private prepareHits(hitAmount: number, rollAccuracy: boolean): HitDamage[] {
        // Check the hit amounts.
        if (hitAmount > 4) {
            throw new Error(
                "Illegal number of hits! The maximum number of hits per turn is 4.");
        } else if (hitAmount < 0) {
            throw new Error(
                "Illegal number of hits! The minimum number of hits per turn is 0.");
        }

        if (this.attacker == null || this.target == null) {
            return null;
        }

        let hits: HitDamage[] = new Array(hitAmount);
        this.totalDamage = 0;
        for (let i = 0; i < hits.length; i++) {
            this.accurate = !rollAccuracy || AccuracyFormulasDpsCalc.rollAccuracy(this.attacker, this.target, this.combatType);
            let damage: HitDamage = this.accurate ? CombatFactory.getHitDamage(this.attacker, this.target, this.combatType) : new HitDamage(0, HitMask.BLUE);
            CombatFactory.applyExtraHitRolls(
                this.attacker,
                this.target,
                this.combatType,
                damage,
                this.accurate,
                this.method
            );
            this.totalDamage += damage.getDamage();
            hits[i] = damage;
        }
        return hits;
    }

    public updateTotalDamage() {
        this.totalDamage = 0;
        for (let i = 0; i < this.hits.length; i++) {
            this.totalDamage += this.hits[i].getDamage();
        }
    }

    public getSkills(): number[] {
        if (this.attacker.isNpc()) {
            return new Array();
        }
        return (this.attacker as Player).getFightType().getStyle().skill(this.combatType);
    }

    public getCombatType(): CombatType {
        return this.combatType;
    }
}    
