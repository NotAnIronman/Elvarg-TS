import { CombatMethod } from "../CombatMethod";
import { Graphic } from "../../../../model/Graphic";
import { Sounds } from "../../../../Sounds";
import { Sound } from "../../../../Sound";
import { World } from "../../../../World";
import { CanAttackResponse } from "../../CombatFactory";;
import { CombatType } from "../../CombatType";
import { PendingHit } from "../../hit/PendingHit";
import { CombatAncientSpell } from "../../magic/CombatAncientSpell";
import { Mobile } from "../../../../entity/impl/Mobile";
import { NPC } from "../../../../entity/impl/npc/NPC";
import { Player } from "../../../../entity/impl/player/Player";
import { GraphicHeight } from "../../../../model/GraphicHeight";
import { AreaManager } from "../../../../model/areas/AreaManager";


export class MagicCombatMethod extends CombatMethod {

    public static SPLASH_GRAPHIC = new Graphic(85, GraphicHeight.MIDDLE);
    private static readonly MAGIC_CAST_DEBUG =
        process.env.MAGIC_CAST_DEBUG === "1" ||
        process.env.MAGIC_CAST_DEBUG === "true";
    private static readonly BLOOD_BLITZ_SPELL_ID = 12911;
    private static readonly ICE_BLITZ_SPELL_ID = 12871;

    public type(): CombatType {
        return CombatType.MAGIC;
    }

    public hits(character: Mobile, target: Mobile): PendingHit[] {
        let hits: PendingHit[] = [new PendingHit(character, target, this, 3)];

        let spell = character.getCombat().getSelectedSpell();

        if (!spell) {
            return hits;
        }

        let multiCombatHits: PendingHit[] = [];

        for (let hit of hits) {
            spell.onHitCalc(hit);

            if (!hit.isAccurate() || !(spell instanceof CombatAncientSpell) || spell.spellRadius() <= 0) {
                continue;
            }

            let it: IterableIterator<Mobile> = null;
            if (character.isPlayer() && target.isPlayer()) {
                it = (character as Player).getLocalPlayers().values();
            } else if (character.isPlayer() && target.isNpc()) {
                it = (character as Player).getLocalNpcs().values();
            } else if (character.isNpc() && target.isNpc()) {
                let npcs = Object.values(World.getNpcs());
            } else if (character.isNpc() && target.isPlayer()) {
                let npcsValues = Object.values(World.getNpcs());
            }

            for (let next of it) {
                if (!next || (next.isNpc() && !(next as unknown as NPC).getCurrentDefinition().isAttackable()) || (next.isPlayer() && AreaManager.canAttack(character, next as Player) != CanAttackResponse.CAN_ATTACK) || !AreaManager.inMulti(next as Player) || !next.getLocation().isWithinDistance(target.getLocation(), spell.spellRadius()) || next == character || next == target || next.getHitpoints() <= 0) {
                    continue;
                }
                let pendingHit: PendingHit = new PendingHit(character, next, this, 3, false);
                multiCombatHits.push(pendingHit);
                spell.onHitCalc(pendingHit);
            }
        }
        if (multiCombatHits.length > 0) {
            return hits.concat(multiCombatHits);
        }
        return hits;
    }

    public canAttack(character: Mobile, target: Mobile): boolean {
        if (character.isNpc()) {
            return true;
        }

        // Set the current spell to the autocast spell if it's null.
        if (character.getCombat().getCastSpell() == null) {
            character.getCombat().setCastSpell(character.getCombat().getAutocastSpell());
        }

        // Character didn't have autocast spell either.
        if (character.getCombat().getCastSpell() == null) {
            return false;
        }

        return character.getCombat().getCastSpell().canCast(character.getAsPlayer(), true);
    }

    public start(character: Mobile, target: Mobile): void {
        const spell = character.getCombat().getSelectedSpell();

        if (spell != null) {
            const castSound = MagicCombatMethod.resolveCastSound(spell.spellId());
            if (castSound != null) {
                Sounds.sendSound(character, castSound);
            }
            if (MagicCombatMethod.MAGIC_CAST_DEBUG) {
                const casterName = character.isPlayer()
                    ? character.getAsPlayer()?.getUsername?.() ?? "unknown-player"
                    : `npc-${character.getAsNpc?.()?.getId?.() ?? "unknown"}`;
                const targetName = target?.isPlayer?.()
                    ? target.getAsPlayer()?.getUsername?.() ?? "unknown-player"
                    : `npc-${target?.getAsNpc?.()?.getId?.() ?? "unknown"}`;
                const spellId = spell?.spellId?.() ?? -1;
                console.info(
                    `[magic.cast] caster=${casterName} target=${targetName} spellId=${spellId}`
                );
            }
            spell.startCast(character, target);
        }
    }

    private static resolveCastSound(spellId: number): Sound | null {
        switch (spellId) {
            case MagicCombatMethod.BLOOD_BLITZ_SPELL_ID:
                return Sound.BLOOD_BLITZ_CAST;
            case MagicCombatMethod.ICE_BLITZ_SPELL_ID:
                return Sound.ICE_BLITZ_CAST;
            default:
                return null;
        }
    }

    public attackSpeed(character: Mobile): number {

        if (character.getCombat().getPreviousCast() != null) {
            return character.getCombat().getPreviousCast().getAttackSpeed();
        }

        return super.attackSpeed(character);
    }

    public attackDistance(character: Mobile): number {
        return 10;
    }

    finished(character: Mobile, target: Mobile) {
        // Reset the castSpell to autocastSpell
        // Update previousCastSpell so effects can be handled.
        const current = character.getCombat().getCastSpell();
        character.getCombat().setCastSpell(null);
        if (character.getCombat().getAutocastSpell() === null) {
            character.getCombat().reset();
            character.setMobileInteraction(target);
            character.getMovementQueue().reset();
        }
        character.getCombat().setPreviousCast(current);
    }

    handleAfterHitEffects(hit: PendingHit) {
        const attacker = hit.getAttacker();
        const target = hit.getTarget();
        const accurate = hit.isAccurate();
        const damage = hit.getTotalDamage();

        if (attacker.getHitpoints() <= 0 || target.getHitpoints() <= 0) {
            return;
        }

        const previousSpell = attacker.getCombat().getPreviousCast();

        if (previousSpell) {
            if (accurate) {
                const endGraphic = previousSpell.endGraphic();
                target.performGraphic(endGraphic);
                Sounds.sendSound(target, previousSpell.impactSound());
              } else {
                // Send splash graphics for the spell because it wasn't accurate
                target.performGraphic(MagicCombatMethod.SPLASH_GRAPHIC);
                Sounds.sendSound(attacker, Sound.SPELL_FAIL_SPLASH);
            }
            previousSpell.finishCast(attacker, target, accurate, damage);
        }
    }
}
