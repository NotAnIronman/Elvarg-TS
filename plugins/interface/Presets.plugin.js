const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { PrayerData, PrayerHandler } = require("../../src/main/typescript/elvarg/game/content/PrayerHandler");
const { CombatFactory } = require("../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { CombatSpecial } = require("../../src/main/typescript/elvarg/game/content/combat/CombatSpecial");
const { BountyHunter } = require("../../src/main/typescript/elvarg/game/content/combat/bountyhunter/BountyHunter");
const { Autocasting } = require("../../src/main/typescript/elvarg/game/content/combat/magic/Autocasting");
const { Presetable } = require("../../src/main/typescript/elvarg/game/content/presets/Presetable");
const { PredefinedPresets } = require("../../src/main/typescript/elvarg/game/content/presets/PredefinedPresets");
const { SkillManager } = require("../../src/main/typescript/elvarg/game/content/skill/SkillManager");
const { PlayerSave } = require("../../src/main/typescript/elvarg/game/entity/impl/player/persistence/PlayerSave");
const { Wilderness } = require("../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const { Bank } = require("../../src/main/typescript/elvarg/game/model/container/impl/Bank");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const {
  isPresetActive,
  hasPresetSnapshot,
  clearPresetState,
  markPresetActiveWithSnapshot,
  restorePresetSnapshot,
} = require("./PresetsState");

const MAX_PRESETS = 10;
const PRESET_INTERFACE_ID = 45000;
const OPEN_PRESETS_BUTTON = 31015;
const TOGGLE_OPEN_ON_DEATH_BUTTON = 45060;
const EDIT_PRESET_BUTTON = 45061;
const CLEAR_PRESET_BUTTON = 45062;
const LOAD_PRESET_BUTTON = 45064;
const GLOBAL_PRESET_BUTTON_START = 45070;
const GLOBAL_PRESET_BUTTON_END = 45079;
const CUSTOM_PRESET_BUTTON_START = 45082;
const CUSTOM_PRESET_BUTTON_END = 45091;
const OPEN_PRESETS_DELAY_TICKS = 2;

const COMBAT_SKILLS = [
  Skill.ATTACK,
  Skill.DEFENCE,
  Skill.STRENGTH,
  Skill.HITPOINTS,
  Skill.RANGED,
  Skill.PRAYER,
  Skill.MAGIC,
];

const GLOBAL_PRESETS = [
  PredefinedPresets.OBBY_MAULER_57,
  PredefinedPresets.G_MAULER_70,
  PredefinedPresets.DDS_PURE_M_73,
  PredefinedPresets.DDS_PURE_R_73,
  PredefinedPresets.NH_PURE_83,
  PredefinedPresets.ATT_70_ZERKER_97,
  PredefinedPresets.MAIN_RUNE_126,
  PredefinedPresets.MAIN_HYBRID_126,
  PredefinedPresets.MAIN_TRIBRID_126,
];

function rangeInclusive(start, end) {
  const values = [];
  for (let i = start; i <= end; i++) {
    values.push(i);
  }
  return values;
}

const PRESET_BUTTON_IDS = [
  OPEN_PRESETS_BUTTON,
  TOGGLE_OPEN_ON_DEATH_BUTTON,
  EDIT_PRESET_BUTTON,
  CLEAR_PRESET_BUTTON,
  LOAD_PRESET_BUTTON,
  ...rangeInclusive(GLOBAL_PRESET_BUTTON_START, GLOBAL_PRESET_BUTTON_END),
  ...rangeInclusive(CUSTOM_PRESET_BUTTON_START, CUSTOM_PRESET_BUTTON_END),
];

function isPlayerBot(player) {
  return Boolean(player?.isPlayerBot?.());
}

function isPresetInterfaceOpen(player) {
  return player?.getInterfaceId?.() === PRESET_INTERFACE_ID;
}

function isValidItem(item) {
  return (
    item &&
    typeof item.getId === "function" &&
    typeof item.getAmount === "function" &&
    item.getId() > 0 &&
    item.getAmount() > 0
  );
}

function cloneItem(item) {
  if (!isValidItem(item)) {
    return null;
  }
  return typeof item.clone === "function"
    ? item.clone()
    : new Item(item.getId(), item.getAmount());
}

function isSpawnable(itemId) {
  const allowed = GameConstants.ALLOWED_SPAWNS;
  if (allowed?.has) {
    return allowed.has(itemId);
  }
  if (Array.isArray(allowed)) {
    return allowed.includes(itemId);
  }
  return false;
}

function ensurePlayerPresets(player) {
  const existing = player?.getPresets?.();
  if (Array.isArray(existing) && existing.length >= MAX_PRESETS) {
    return existing;
  }

  const next = new Array(MAX_PRESETS).fill(null);
  if (Array.isArray(existing)) {
    for (let i = 0; i < Math.min(existing.length, MAX_PRESETS); i++) {
      next[i] = existing[i] ?? null;
    }
  }
  player?.setPresets?.(next);
  return next;
}

function captureCombatStats(player) {
  const skills = player.getSkillManager();
  return COMBAT_SKILLS.map((skill) => skills.getMaxLevel(skill));
}

function loadoutToPreset(name, player) {
  return new Presetable(
    name,
    player.getInventory().copyValidItemsArray(),
    player.getEquipment().copyValidItemsArray(),
    captureCombatStats(player),
    player.getSpellbook(),
    false
  );
}

function openPresetInterface(player, preset = null) {
  if (!player) {
    return false;
  }

  const sender = player.getPacketSender();
  const selected = preset ?? null;
  const playerPresets = ensurePlayerPresets(player);

  if (selected) {
    sender.sendString(`Presets - ${selected.getName()}`, 45002);
    sender.sendString(String(selected.getStats()?.[3] ?? ""), 45007); // Hitpoints
    sender.sendString(String(selected.getStats()?.[0] ?? ""), 45008); // Attack
    sender.sendString(String(selected.getStats()?.[2] ?? ""), 45009); // Strength
    sender.sendString(String(selected.getStats()?.[1] ?? ""), 45010); // Defence
    sender.sendString(String(selected.getStats()?.[4] ?? ""), 45011); // Ranged
    sender.sendString(String(selected.getStats()?.[5] ?? ""), 45012); // Prayer
    sender.sendString(String(selected.getStats()?.[6] ?? ""), 45013); // Magic
    sender.sendString(`@yel@${String(selected.getSpellbook()).toLowerCase()}`, 45014);
  } else {
    sender.sendString("Presets", 45002);
    for (let i = 0; i <= 6; i++) {
      sender.sendString("", 45007 + i);
    }
    sender.sendString("", 45014);
  }

  const inventory = Array.isArray(selected?.getInventory?.())
    ? selected.getInventory()
    : [];
  for (let i = 0; i < 28; i++) {
    const item = inventory[i];
    if (isValidItem(item)) {
      sender.sendItemOnInterfaces(45015 + i, item.getId(), item.getAmount());
    } else {
      sender.sendItemOnInterfaces(45015 + i, -1, 1);
    }
  }

  for (let i = 0; i < 14; i++) {
    sender.sendItemOnInterfaces(45044 + i, -1, 1);
  }
  const equipment = Array.isArray(selected?.getEquipment?.())
    ? selected.getEquipment()
    : [];
  for (const item of equipment) {
    if (!isValidItem(item)) {
      continue;
    }
    const slot = item.getDefinition?.()?.getEquipmentType?.()?.getSlot?.();
    if (!Number.isInteger(slot) || slot < 0 || slot > 13) {
      continue;
    }
    sender.sendItemOnInterfaces(45044 + slot, item.getId(), item.getAmount());
  }

  for (let i = 0; i < MAX_PRESETS; i++) {
    sender.sendString(GLOBAL_PRESETS[i]?.getName?.() ?? "Empty", 45070 + i);
  }

  for (let i = 0; i < MAX_PRESETS; i++) {
    sender.sendString(playerPresets[i]?.getName?.() ?? "Empty", 45082 + i);
  }

  sender.sendConfig(987, player.isOpenPresetsOnDeath() ? 0 : 1);
  sender.sendInterface(PRESET_INTERFACE_ID);
  player.setCurrentPreset(selected);
  return true;
}

function applyPreset(player, preset) {
  if (!player || !preset) {
    return false;
  }

  const sender = player.getPacketSender();
  const oldCombatLevel = player.getSkillManager().getCombatLevel();

  sender.sendInterfaceRemoval();

  if (Wilderness.isIn(player)) {
    if (!isPlayerBot(player) && player.getRights() !== PlayerRights.DEVELOPER) {
      sender.sendMessage("You can't load a preset in the wilderness!");
      return false;
    }
  }

  if (player.getDueling().inDuel()) {
    sender.sendMessage("You can't load a preset during a duel!");
    return false;
  }
  const alreadyPresetActive = isPresetActive(player) && hasPresetSnapshot(player);
  const prePresetSnapshot = alreadyPresetActive
    ? null
    : PlayerSave.fromPlayer(player);

  let movedToBank = false;
  const carriedItems = [
    ...player.getInventory().getCopiedItems(),
    ...player.getEquipment().getCopiedItems(),
  ];
  for (const item of carriedItems) {
    if (!isValidItem(item) || isSpawnable(item.getId())) {
      continue;
    }
    player.getBank(Bank.getTabForItem(player, item.getId())).add(item, false);
    movedToBank = true;
  }
  if (movedToBank) {
    sender.sendMessage(
      "The non-spawnable items you had on you have been sent to your bank."
    );
  }

  player.getInventory().resetItems().refreshItems();
  player.getEquipment().resetItems().refreshItems();

  if (!preset.getIsGlobal()) {
    const nonSpawnableRequirements = [];
    for (const item of [...(preset.getInventory() ?? []), ...(preset.getEquipment() ?? [])]) {
      if (!isValidItem(item) || isSpawnable(item.getId())) {
        continue;
      }
      nonSpawnableRequirements.push(item);

      const inventoryAmt = player.getInventory().getAmount(item.getId());
      const equipmentAmt = player.getEquipment().getAmount(item.getId());
      const bankAmt = player
        .getBank(Bank.getTabForItem(player, item.getId()))
        .getAmount(item.getId());
      const totalAmt = inventoryAmt + equipmentAmt + bankAmt;
      const presetAmt = preset.getAmount(item.getId());

      if (totalAmt < presetAmt) {
        sender.sendMessage(
          `You don't have the non-spawnable item ${item.getDefinition().getName()} in your inventory, equipment or bank.`
        );
        return false;
      }
    }

    for (const item of nonSpawnableRequirements) {
      if (player.getInventory().containsItem(item)) {
        player.getInventory().deletes(item);
      } else if (player.getEquipment().containsItem(item)) {
        player.getEquipment().deletes(item);
      } else {
        player
          .getBank(Bank.getTabForItem(player, item.getId()))
          .deletes(item);
      }
    }
  }

  for (const item of preset.getInventory() ?? []) {
    const next = cloneItem(item);
    if (!next) {
      continue;
    }
    player.getInventory().addItem(next);
  }

  for (const item of preset.getEquipment() ?? []) {
    const next = cloneItem(item);
    if (!next) {
      continue;
    }
    const slot = next.getDefinition?.()?.getEquipmentType?.()?.getSlot?.();
    if (!Number.isInteger(slot) || slot < 0 || slot > 13) {
      continue;
    }
    player.getEquipment().setItem(slot, next);
  }

  player.setSpellbook(preset.getSpellbook());
  Autocasting.setAutocast(player, null);

  let totalExp = 0;
  const presetStats = Array.isArray(preset.getStats()) ? preset.getStats() : [];
  for (let i = 0; i < COMBAT_SKILLS.length; i++) {
    const skill = COMBAT_SKILLS[i];
    const rawLevel = Number(presetStats[i]);
    const level = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
    const exp = SkillManager.getExperienceForLevel(level);
    player
      .getSkillManager()
      .setCurrentLevels(skill, level)
      .setMaxLevel(skill, level)
      .setExperience(skill, exp);
    totalExp += exp;
  }

  sender.sendString(
    `${player.getSkillManager().getCurrentLevel(Skill.PRAYER)}/${player
      .getSkillManager()
      .getMaxLevel(Skill.PRAYER)}`,
    687
  );
  sender.sendString(String(player.getSkillManager().getTotalLevel()), 31200);

  const newCombatLevel = player.getSkillManager().getCombatLevel();
  const combatLevelText = `Combat level: ${newCombatLevel}`;
  sender.sendString(combatLevelText, 19000).sendString(combatLevelText, 5858);

  if (newCombatLevel !== oldCombatLevel) {
    BountyHunter.unassign(player);
  }

  sender.sendTabInterface(6, player.getSpellbook().getInterfaceId());
  sender.sendConfig(709, PrayerHandler.canUse(player, PrayerData.PRESERVE, false) ? 1 : 0);
  sender.sendConfig(711, PrayerHandler.canUse(player, PrayerData.RIGOUR, false) ? 1 : 0);
  sender.sendConfig(713, PrayerHandler.canUse(player, PrayerData.AUGURY, false) ? 1 : 0);

  player.resetAttributes();
  sender.sendMessage("Preset loaded!");
  sender.sendTotalExp(totalExp);

  player.setSpecialPercentage(100);
  CombatSpecial.updateBar(player);
  player.getUpdateFlag().flag(Flag.APPEARANCE);
  markPresetActiveWithSnapshot(player, {
    snapshot: alreadyPresetActive ? undefined : prePresetSnapshot,
    setFlag: true,
  });
  return true;
}

function promptCreatePreset(player, index) {
  player.setEnteredSyntaxAction({
    execute: (rawInput) => {
      const input = Misc.formatText(rawInput ?? "");
      if (!Misc.isValidName(input)) {
        player.getPacketSender().sendMessage("Invalid name for preset.");
        player.setCurrentPreset(null);
        openPresetInterface(player, null);
        return;
      }

      const presets = ensurePlayerPresets(player);
      if (presets[index] != null) {
        openPresetInterface(player, presets[index]);
        return;
      }

      const inventory = player.getInventory().copyValidItemsArray();
      const equipment = player.getEquipment().copyValidItemsArray();
      for (const item of [...inventory, ...equipment]) {
        if (item?.getDefinition?.()?.isNoted?.()) {
          player
            .getPacketSender()
            .sendMessage("You cannot create presets which contain noted items.");
          return;
        }
      }

      presets[index] = new Presetable(
        input,
        inventory,
        equipment,
        captureCombatStats(player),
        player.getSpellbook(),
        false
      );
      player.setCurrentPreset(presets[index]);
      openPresetInterface(player, presets[index]);
    },
  });
  player
    .getPacketSender()
    .sendEnterInputPrompt("Enter a name for your preset below.");
}

function promptEditCurrentPreset(player) {
  const current = player.getCurrentPreset();
  if (current?.getIsGlobal?.()) {
    player.getPacketSender().sendMessage("You can't edit this preset!");
    return true;
  }

  player.setEnteredSyntaxAction({
    execute: (rawInput) => {
      const input = Misc.formatText(rawInput ?? "");
      if (!Misc.isValidName(input)) {
        player
          .getPacketSender()
          .sendMessage("Invalid name for preset. Please enter characters only.");
        player.setCurrentPreset(null);
        openPresetInterface(player, null);
        return;
      }

      const presets = ensurePlayerPresets(player);
      let changeIndex = -1;
      for (let i = 0; i < presets.length; i++) {
        if (presets[i] === player.getCurrentPreset()) {
          changeIndex = i;
          break;
        }
      }

      if (changeIndex === -1) {
        player.getPacketSender().sendMessage("You don't have free space left!!");
        return;
      }

      const updatedPreset = loadoutToPreset(input, player);
      presets[changeIndex] = updatedPreset;
      player.setCurrentPreset(updatedPreset);
      applyPreset(player, updatedPreset);
    },
  });
  player
    .getPacketSender()
    .sendEnterInputPrompt("How would you like to call your preset?");
  return true;
}

function handlePresetButton(player, buttonId) {
  if (!Number.isInteger(buttonId) || !player) {
    return false;
  }

  ensurePlayerPresets(player);

  if (buttonId === OPEN_PRESETS_BUTTON) {
    if (player.busy?.()) {
      player.getPacketSender().sendInterfaceRemoval();
    }
    openPresetInterface(player, player.getCurrentPreset?.() ?? null);
    return true;
  }

  if (!isPresetInterfaceOpen(player) && !isPlayerBot(player)) {
    return false;
  }

  switch (buttonId) {
    case TOGGLE_OPEN_ON_DEATH_BUTTON:
      player.setOpenPresetsOnDeath(!player.isOpenPresetsOnDeath());
      player
        .getPacketSender()
        .sendConfig(987, player.isOpenPresetsOnDeath() ? 0 : 1);
      return true;
    case EDIT_PRESET_BUTTON:
    case CLEAR_PRESET_BUTTON: {
      if (!isPresetActive(player)) {
        player.getPacketSender().sendMessage("No active preset to clear.");
        return true;
      }
      const restored = restorePresetSnapshot(player, { preserveLocation: true });
      if (restored) {
        player
          .getPacketSender()
          .sendMessage("Preset cleared. Your original character state has been restored.");
        player.setCurrentPreset(null);
        openPresetInterface(player, null);
      } else {
        player
          .getPacketSender()
          .sendMessage("Unable to clear preset: no preset snapshot was found.");
      }
      return true;
    }
    case LOAD_PRESET_BUTTON: {
      const currentPreset = player.getCurrentPreset();
      if (!currentPreset) {
        player
          .getPacketSender()
          .sendMessage("You haven't selected any preset yet.");
        return true;
      }
      applyPreset(player, currentPreset);
      return true;
    }
    default:
      break;
  }

  if (buttonId >= GLOBAL_PRESET_BUTTON_START && buttonId <= GLOBAL_PRESET_BUTTON_END) {
    const index = buttonId - GLOBAL_PRESET_BUTTON_START;
    const preset = GLOBAL_PRESETS[index];
    if (!preset) {
      player
        .getPacketSender()
        .sendMessage("That preset is currently unavailable.");
      return true;
    }
    if (player.getCurrentPreset() === preset) {
      return true;
    }
    openPresetInterface(player, preset);
    return true;
  }

  if (buttonId >= CUSTOM_PRESET_BUTTON_START && buttonId <= CUSTOM_PRESET_BUTTON_END) {
    const index = buttonId - CUSTOM_PRESET_BUTTON_START;
    const presets = ensurePlayerPresets(player);
    const preset = presets[index] ?? null;

    if (!preset) {
      openPresetInterface(player, null);
      promptCreatePreset(player, index);
      return true;
    }

    if (player.getCurrentPreset() === preset) {
      return true;
    }

    openPresetInterface(player, preset);
    return true;
  }

  return false;
}

function isAtDefaultRespawn(player) {
  const location = player?.getLocation?.();
  const respawn = GameConstants.DEFAULT_LOCATION;
  if (!location || !respawn) {
    return false;
  }
  return (
    location.getX?.() === respawn.getX?.() &&
    location.getY?.() === respawn.getY?.() &&
    location.getZ?.() === respawn.getZ?.()
  );
}

function handlePresetTradeRestriction(player, target) {
  const playerPresetActive = isPresetActive(player);
  const targetPresetActive = isPresetActive(target);
  if (!playerPresetActive && !targetPresetActive) {
    return false;
  }

  player
    ?.getPacketSender?.()
    ?.sendMessage?.("You cannot trade while a Preset is active.");

  if (targetPresetActive) {
    const requesterName = player?.getUsername?.() ?? "A player";
    target
      ?.getPacketSender?.()
      ?.sendMessage?.(
        `${requesterName} wants to trade with you, but you cannot trade while a Preset is active.`
      );
  }

  return true;
}

function handlePresetBankRestriction(player) {
  if (!isPresetActive(player)) {
    return false;
  }
  player
    ?.getPacketSender?.()
    ?.sendMessage?.("You cannot open the bank while a Preset is active.");
  return true;
}

function handlePresetShopRestriction(player) {
  if (!isPresetActive(player)) {
    return false;
  }
  player
    ?.getPacketSender?.()
    ?.sendMessage?.("You cannot open shops while a Preset is active.");
  return true;
}

function applyPresetItemDropPolicy(event) {
  const player = event?.player;
  if (!isPresetActive(player)) {
    return;
  }
  // Preset mode still allows drop actions, but dropped items must not enter the
  // world economy. Let core remove the item and suppress the ground spawn only.
  event.dropToGround = false;
}

module.exports = {
  name: "Presets",
  register(api) {
    api.onPlayerLogin(({ player }) => {
      if (isPresetActive(player) && !hasPresetSnapshot(player)) {
        clearPresetState(player);
      }
    });

    api.onButton(PRESET_BUTTON_IDS, ({ player, buttonId }) =>
      handlePresetButton(player, buttonId)
    );

    api.onInterfaceActionButton(PRESET_BUTTON_IDS, ({ player, buttonId }) =>
      handlePresetButton(player, buttonId)
    );

    api.onCanTrade((event) => {
      if (handlePresetTradeRestriction(event.player, event.target)) {
        event.allow = false;
      }
    });

    api.onCanBank((event) => {
      if (handlePresetBankRestriction(event.player)) {
        event.allow = false;
      }
    });

    api.onCanShop((event) => {
      if (handlePresetShopRestriction(event.player)) {
        event.allow = false;
      }
    });

    api.onItemDropPolicy((event) => {
      applyPresetItemDropPolicy(event);
    });

    api.onShouldDropItemsOnDeath((event) => {
      if (isPresetActive(event.player)) {
        event.shouldDrop = false;
      }
    });

    api.onPlayerDefeated(({ victim }) => {
      if (!victim) {
        return;
      }

      const shouldRestorePreset = isPresetActive(victim);
      const shouldOpenPresetInterface = victim.isOpenPresetsOnDeath?.() === true;
      if (!shouldRestorePreset && !shouldOpenPresetInterface) {
        return;
      }

      TaskManager.submit(
        new (class extends Task {
          constructor() {
            super(OPEN_PRESETS_DELAY_TICKS, false);
          }

          execute() {
            this.stop();
            if (!victim || !victim.isRegistered?.() || victim.getHitpoints?.() <= 0) {
              return;
            }

            if (shouldRestorePreset) {
              restorePresetSnapshot(victim, { preserveLocation: true });
            }

            if (shouldOpenPresetInterface && isAtDefaultRespawn(victim)) {
              openPresetInterface(victim, victim.getCurrentPreset?.() ?? null);
            }
          }
        })()
      );
    });
  },
};
