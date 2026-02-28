import { TimerKey } from '../../../../util/timers/TimerKey'
import { Area, BasicAttackResponse } from '../Area'; 
import { Boundary } from '../../Boundary';
import { Mobile } from '../../../entity/impl/Mobile';
import { Player } from '../../../entity/impl/player/Player';
import { DuelState, DuelRule } from '../../../content/Duelling'
import { GameObject } from '../../../entity/impl/object/GameObject';


export class DuelArenaArea extends Area {
    constructor() {
        super(Array.of(new Boundary(3326, 3383, 3197, 3295,0)));
        }

    public postEnter(character: Mobile) {
        if (character.isPlayer()) {
            let player = character.getAsPlayer();
            player.getPacketSender().sendInteractionOption("Challenge", 1, false);
            player.getPacketSender().sendInteractionOption("null", 2, true);
        }
    }

    public postLeave(character: Mobile, logout: boolean) {
        if (character.isPlayer()) {
            let player = character.getAsPlayer();
            if (player.getDueling().inDuel()) {
                player.getDueling().duelLost();
            }
            player.getPacketSender().sendInteractionOption("null", 2, true);
            player.getPacketSender().sendInteractionOption("null", 1, false);
        }
    }

    public process(character: Mobile) {
    }

    public canTeleport(player: Player): boolean {
        if (player.getDueling().inDuel()) {
            return false;
        }
        return true;
    }

    public canAttack(character: Mobile, target: Mobile): BasicAttackResponse {
        if (character.isPlayer() && target.isPlayer()) {
            let a = character.getAsPlayer();
            let t = target.getAsPlayer();
            if (a.getDueling().getState() == DuelState.IN_DUEL && t.getDueling().getState() == DuelState.IN_DUEL) {
                return BasicAttackResponse.CAN_ATTACK;
            } else if (a.getDueling().getState() == DuelState.STARTING_DUEL
                || t.getDueling().getState() == DuelState.STARTING_DUEL) {
                return BasicAttackResponse.CANT_ATTACK_IN_AREA;
            }

            return BasicAttackResponse.CANT_ATTACK_IN_AREA;
        }

        return BasicAttackResponse.CAN_ATTACK;
    }

    public canTrade(player: Player, target: Player): boolean {
        if (player.getDueling().inDuel()) {
            return false;
        }
        return true;
    }

    public isMulti(character: Mobile): boolean {
        return true;
    }

    public canEat(player: Player, itemId: number): boolean {
        if (player.getDueling().inDuel() && player.getDueling().getRules()[DuelRule.NO_FOOD.getConfigId()]) {
          return false;
        }
        return true;
    }
      
      public canDrink(player: Player, itemId: number): boolean {
        if (player.getDueling().inDuel() && player.getDueling().getRules()[DuelRule.NO_POTIONS.getConfigId()]) {
          return false;
        }
        return true;
      }
      
      public static dropItemsOnDeath(player: Player, killer: Player | undefined): boolean {
        if (player.getDueling().inDuel()) {
          return false;
        }
        return true;
      }
    public handleDeath(player: Player, killer?: Player): boolean {
        if (player.getDueling().inDuel()) {
            player.getDueling().duelLost();
            return true;
        }
        return false;
    }

    public onPlayerRightClick(player: Player, rightClicked: Player, option: number) {
        if (option == 1) {
            if (player.busy()) {
                player.getPacketSender().sendMessage("You cannot do that right now.");
                return;
            }
            if (rightClicked.busy()) {
                player.getPacketSender().sendMessage("That player is currently busy.");
                return;
            }
            player.getDueling().requestDuel(rightClicked);
        }
    }

    defeated(player: Player, character: Mobile) {
    }

    handleObjectClick(player: Player, objectId: GameObject, type: number): boolean {
        return false;
    }
}
