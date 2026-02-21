import { PluginManager } from "../../../plugins/PluginManager";
import {
  PluginCombatEngine,
  PluginCombatMethodResolver,
  PluginNpcCombatMethodProvider,
} from "../../../plugins/PluginTypes";
import type { Mobile } from "../../entity/impl/Mobile";
import type { CombatMethod } from "./method/CombatMethod";
import type { CanAttackResponse } from "./CombatFactory";

export class CombatRuntime {
  private static ensureEngine(): PluginCombatEngine {
    const engine = PluginManager.getCombatEngine();
    if (!engine) {
      throw new Error("Combat engine plugin not registered");
    }
    return engine;
  }

  static getMethod(attacker: Mobile): CombatMethod {
    const engine = this.ensureEngine();
    const method = engine.getMethod(attacker);
    if (method) {
      return method;
    }

    for (const resolver of PluginManager.getCombatMethodResolvers()) {
      const resolved = resolver.resolve(attacker);
      if (resolved) {
        return resolved;
      }
    }

    if (attacker?.isNpc?.()) {
      for (const provider of PluginManager.getNpcCombatMethodProviders()) {
        const override = provider.provide(attacker);
        if (override) {
          return override;
        }
      }
    }

    throw new Error("No combat method resolved for attacker");
  }

  static canReach(attacker: Mobile, method: CombatMethod, target: Mobile): boolean {
    return this.ensureEngine().canReach(attacker, method, target);
  }

  static canAttack(attacker: Mobile, method: CombatMethod, target: Mobile): CanAttackResponse {
    return this.ensureEngine().canAttack(attacker, method, target);
  }

  static addPendingHit(hit: any): void {
    this.ensureEngine().addPendingHit(hit);
  }

  static executeHit(hit: any): void {
    this.ensureEngine().executeHit(hit);
  }
}
