const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { CombatFactory } = require("../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { HitDamage } = require("../../src/main/typescript/elvarg/game/content/combat/hit/HitDamage");
const { HitMask } = require("../../src/main/typescript/elvarg/game/content/combat/hit/HitMask");
const { TimerKey } = require("../../src/main/typescript/elvarg/util/timers/TimerKey");
const { NpcIds, ObjectIds, ItemIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const { PetHandler } = require("../../src/main/typescript/elvarg/game/content/PetHandler");

const THIEVING_ANIMATION = new Animation(881);
const NPC_ATTACK_ANIMATION = new Animation(401);

class PickpocketResolveTask extends Task {
  constructor(onResolve) {
    super(2);
    this.onResolve = onResolve;
  }

  execute() {
    this.onResolve();
    this.stop();
  }
}

const PICKPOCKETS = [
  {
    name: "man",
    level: 1,
    xp: 8,
    stunTime: 5,
    stunDamage: 1,
    rewards: [[ItemIds.COINS, 3]],
    npcIds: [
      NpcIds.MAN,
      NpcIds.MAN_2,
      NpcIds.MAN_3,
      NpcIds.MAN_4,
      NpcIds.MAN_5,
      NpcIds.MAN_6,
      NpcIds.MAN_7,
      NpcIds.MAN_8,
      NpcIds.MAN_9,
      NpcIds.MAN_10,
      NpcIds.MAN_11,
      NpcIds.MAN_12,
      NpcIds.MAN_13,
      NpcIds.MAN_14,
      NpcIds.MAN_15,
      NpcIds.WOMAN,
      NpcIds.WOMAN_2,
      NpcIds.WOMAN_3,
      NpcIds.WOMAN_4,
      NpcIds.WOMAN_5,
      NpcIds.WOMAN_6,
      NpcIds.WOMAN_7,
      NpcIds.WOMAN_8,
      NpcIds.WOMAN_9,
      NpcIds.WOMAN_10,
      NpcIds.WOMAN_11,
      NpcIds.WOMAN_12,
      NpcIds.WOMAN_13,
      NpcIds.WOMAN_14,
    ],
  },
  {
    name: "farmer",
    level: 10,
    xp: 14.5,
    stunTime: 5,
    stunDamage: 1,
    rewards: [[ItemIds.COINS, 9], [ItemIds.POTATO_SEED, 1]],
    npcIds: [NpcIds.FARMER, NpcIds.FARMER_2, NpcIds.FARMER_3, NpcIds.FARMER_4, NpcIds.FARMER_5, NpcIds.FARMER_6],
  },
  {
    name: "rogue",
    level: 32,
    xp: 36.5,
    stunTime: 5,
    stunDamage: 2,
    rewards: [[ItemIds.COINS, 34], [ItemIds.LOCKPICK, 1], [ItemIds.JUG_OF_WINE, 1]],
    npcIds: [NpcIds.ROGUE],
  },
  {
    name: "master farmer",
    level: 38,
    xp: 43,
    stunTime: 5,
    stunDamage: 3,
    rewards: [[ItemIds.POTATO_SEED, 1], [ItemIds.ONION_SEED, 1], [ItemIds.MARRENTILL_SEED, 1], [ItemIds.RANARR_SEED, 1]],
    npcIds: [NpcIds.MASTER_FARMER, NpcIds.MASTER_FARMER_2],
  },
  {
    name: "guard",
    level: 40,
    xp: 47,
    stunTime: 5,
    stunDamage: 2,
    rewards: [[ItemIds.COINS, 30]],
    npcIds: [NpcIds.GUARD, NpcIds.GUARD_2, NpcIds.GUARD_3, NpcIds.GUARD_4, NpcIds.GUARD_5, NpcIds.GUARD_6],
  },
  {
    name: "paladin",
    level: 70,
    xp: 152,
    stunTime: 5,
    stunDamage: 3,
    rewards: [[ItemIds.COINS, 80], [ItemIds.CHAOS_RUNE, 2]],
    npcIds: [NpcIds.PALADIN, NpcIds.PALADIN_2, NpcIds.PALADIN_3],
  },
  {
    name: "gnome",
    level: 75,
    xp: 199,
    stunTime: 5,
    stunDamage: 1,
    rewards: [[ItemIds.COINS, 300], [ItemIds.GOLD_ORE, 1], [ItemIds.EARTH_RUNE, 1]],
    npcIds: [NpcIds.GNOME],
  },
];

const PICKPOCKET_BY_NPC_ID = new Map();
for (const pickpocket of PICKPOCKETS) {
  for (const npcId of pickpocket.npcIds) {
    PICKPOCKET_BY_NPC_ID.set(npcId, pickpocket);
  }
}

const STALLS = new Map([
  [ObjectIds.BAKERY_STALL, { level: 5, xp: 16, rewards: [[ItemIds.COINS, 20]] }],
  [ObjectIds.SILK_STALL, { level: 20, xp: 24, rewards: [[ItemIds.COINS, 60]] }],
  [ObjectIds.TEA_STALL, { level: 5, xp: 16, rewards: [[ItemIds.COINS, 20]] }],
  [ObjectIds.FUR_STALL, { level: 35, xp: 36, rewards: [[ItemIds.COINS, 100]] }],
  [ObjectIds.GEM_STALL, { level: 75, xp: 160, rewards: [[ItemIds.UNCUT_SAPPHIRE, 1], [ItemIds.UNCUT_EMERALD, 1]] }],
  [ObjectIds.SEED_STALL, { level: 27, xp: 10, rewards: [[ItemIds.POTATO_SEED, 1], [ItemIds.ONION_SEED, 1]] }],
]);

function randomReward(rewards) {
  const [itemId, maxAmount] = rewards[Math.floor(Math.random() * rewards.length)];
  const amount = Math.max(1, Math.floor(Math.random() * maxAmount) + 1);
  return new Item(itemId, amount);
}

function pickpocketSucceeded(player, def) {
  const level = player.getSkillManager().getCurrentLevel(Skill.THIEVING);
  const factor = Math.floor(Math.random() * (level + 5));
  const fluke = Math.floor(Math.random() * (def.level + 1));
  return factor > fluke;
}

module.exports = {
  name: "Thieving",
  register(api) {
    api.onNpcInteraction((event) => {
      if (event.clickType !== 1) {
        return;
      }
      const { player, npc, npcId } = event;
      const def = PICKPOCKET_BY_NPC_ID.get(npcId);
      if (!def) {
        return;
      }

      if (!player.getClickDelay().elapsedTime(1500)) {
        event.handled = true;
        return;
      }
      if (player.getSkillManager().getCurrentLevel(Skill.THIEVING) < def.level) {
        player
          .getPacketSender()
          .sendMessage(`You need a Thieving level of at least ${def.level} to do this.`);
        event.handled = true;
        return;
      }
      if (player.getTimers().has(TimerKey.STUN)) {
        event.handled = true;
        return;
      }
      if (CombatFactory.inCombat(player)) {
        player
          .getPacketSender()
          .sendMessage("You must wait a few seconds after being in combat to do this.");
        event.handled = true;
        return;
      }
      if (CombatFactory.inCombat(npc)) {
        player
          .getPacketSender()
          .sendMessage("That npc is currently in combat and cannot be pickpocketed.");
        event.handled = true;
        return;
      }
      if (player.getInventory().isFull()) {
        player.getInventory().full();
        event.handled = true;
        return;
      }

      player.getMovementQueue().reset();
      player.setPositionToFace(npc.getLocation());
      player.performAnimation(THIEVING_ANIMATION);
      player.getPacketSender().sendMessage("You attempt to pick the npc's pocket..");
      player.getClickDelay().reset();
      npc.getTimers().registers(TimerKey.ATTACK_IMMUNITY, 10);

      TaskManager.submit(
        new PickpocketResolveTask(() => {
          if (!player.isRegistered() || !npc.isRegistered()) {
            return;
          }

          if (pickpocketSucceeded(player, def)) {
            const loot = randomReward(def.rewards);
            if (!player.getInventory().isFull()) {
              player.getInventory().addItem(loot);
            }
            player
              .getPacketSender()
              .sendMessage(`You steal ${loot.getAmount()} x ${loot.getDefinition().getName()}.`);
            player.getSkillManager().addExperiences(Skill.THIEVING, def.xp);
            PetHandler.onSkill(player, Skill.THIEVING);
            return;
          }

          npc.setPositionToFace(player.getLocation());
          npc.forceChat("What do you think you're doing?");
          npc.performAnimation(NPC_ATTACK_ANIMATION);
          player.getPacketSender().sendMessage("You fail to pick the pocket.");
          CombatFactory.stun(player, def.stunTime, true);
          player
            .getCombat()
            .getHitQueue()
            .addPendingDamage([new HitDamage(def.stunDamage, HitMask.RED)]);
          player.getMovementQueue().reset();
        })
      );

      event.handled = true;
    });

    api.onObjectInteraction((event) => {
      if (event.clickType !== 1) {
        return;
      }
      const stall = STALLS.get(event.objectId);
      if (!stall) {
        return;
      }

      const player = event.player;
      if (player.getSkillManager().getCurrentLevel(Skill.THIEVING) < stall.level) {
        player
          .getPacketSender()
          .sendMessage(`You need a Thieving level of at least ${stall.level} to do this.`);
        event.handled = true;
        return;
      }
      if (!player.getClickDelay().elapsedTime(1000)) {
        event.handled = true;
        return;
      }
      if (player.getInventory().isFull()) {
        player.getInventory().full();
        event.handled = true;
        return;
      }

      player.getClickDelay().reset();
      player.setPositionToFace(event.object.getLocation());
      player.performAnimation(THIEVING_ANIMATION);
      const reward = randomReward(stall.rewards);
      player.getInventory().addItem(reward);
      player.getSkillManager().addExperiences(Skill.THIEVING, stall.xp);
      player
        .getPacketSender()
        .sendMessage(`You steal ${reward.getAmount()} x ${reward.getDefinition().getName()}.`);
      PetHandler.onSkill(player, Skill.THIEVING);
      event.handled = true;
    });

    api.log("registered", {
      pickpocketNpcIds: PICKPOCKET_BY_NPC_ID.size,
      stallIds: STALLS.size,
    });
  },
};
