const { Bank } = require("../../src/main/typescript/elvarg/game/model/container/impl/Bank");
const { PlayerStatus } = require("../../src/main/typescript/elvarg/game/model/PlayerStatus");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const { NpcIdentifiers } = require("../../src/main/typescript/elvarg/util/NpcIdentifiers");

const BANK_BOOTH_IDS = Object.freeze([
  ObjectIds.BANK_BOOTH,
  ObjectIds.BANK_BOOTH_2,
  ObjectIds.BANK_BOOTH_3,
  ObjectIds.BANK_BOOTH_4,
  ObjectIds.BANK_BOOTH_5,
  ObjectIds.BANK_BOOTH_6,
  ObjectIds.BANK_BOOTH_7,
  ObjectIds.BANK_BOOTH_8,
  ObjectIds.BANK_BOOTH_9,
  ObjectIds.BANK_BOOTH_10,
  ObjectIds.BANK_BOOTH_11,
  ObjectIds.BANK_BOOTH_12,
  ObjectIds.BANK_BOOTH_13,
  ObjectIds.BANK_BOOTH_14,
  ObjectIds.BANK_BOOTH_15,
  ObjectIds.BANK_BOOTH_16,
  ObjectIds.BANK_BOOTH_17,
  ObjectIds.BANK_BOOTH_18,
  ObjectIds.BANK_BOOTH_19,
  ObjectIds.BANK_BOOTH_20,
  ObjectIds.BANK_BOOTH_21,
  ObjectIds.BANK_BOOTH_22,
  ObjectIds.BANK_BOOTH_23,
  ObjectIds.BANK_BOOTH_24,
  ObjectIds.BANK_BOOTH_25,
  ObjectIds.BANK_BOOTH_26,
  ObjectIds.BANK_BOOTH_27,
  ObjectIds.BANK_BOOTH_28,
  ObjectIds.BANK_BOOTH_29,
  ObjectIds.BANK_BOOTH_30,
  ObjectIds.BANK_BOOTH_31,
  ObjectIds.BANK_BOOTH_32,
  ObjectIds.BANK_BOOTH_33,
  ObjectIds.BANK_BOOTH_34,
  ObjectIds.BANK_BOOTH_35,
  ObjectIds.BANK_BOOTH_36,
  ObjectIds.BANK_BOOTH_37,
  ObjectIds.BANK_BOOTH_38,
  ObjectIds.BANK_BOOTH_39,
  ObjectIds.BANK_BOOTH_40,
  ObjectIds.BANK_BOOTH_41,
  ObjectIds.BANK_BOOTH_42,
  ObjectIds.BANK_BOOTH_43,
  ObjectIds.BANK_BOOTH_44,
  ObjectIds.BANK_BOOTH_45,
].filter(Number.isInteger));

const BANK_BOOTH_ID_SET = new Set(BANK_BOOTH_IDS);
const BANKER_NPC_IDS = Object.freeze([
  NpcIdentifiers.BANKER,
  NpcIdentifiers.BANKER_2,
  NpcIdentifiers.BANKER_3,
  NpcIdentifiers.BANKER_4,
  NpcIdentifiers.BANKER_5,
  NpcIdentifiers.BANKER_6,
  NpcIdentifiers.BANKER_7,
  NpcIdentifiers.BANKER_8,
  NpcIdentifiers.BANKER_9,
  NpcIdentifiers.BANKER_10,
  NpcIdentifiers.BANKER_11,
  NpcIdentifiers.BANKER_12,
  NpcIdentifiers.BANKER_13,
  NpcIdentifiers.BANKER_14,
  NpcIdentifiers.BANKER_15,
  NpcIdentifiers.BANKER_16,
  NpcIdentifiers.BANKER_17,
  NpcIdentifiers.BANKER_18,
  NpcIdentifiers.BANKER_19,
  NpcIdentifiers.BANKER_20,
  NpcIdentifiers.GHOST_BANKER,
  NpcIdentifiers.BANKER_TUTOR,
  NpcIdentifiers.BANKER_21,
  NpcIdentifiers.SIRSAL_BANKER,
  NpcIdentifiers.BANKER_22,
  NpcIdentifiers.BANKER_23,
  NpcIdentifiers.BANKER_24,
  NpcIdentifiers.BANKER_25,
  NpcIdentifiers.NARDAH_BANKER,
  NpcIdentifiers.BANKER_26,
  NpcIdentifiers.BANKER_27,
  NpcIdentifiers.BANKER_28,
  NpcIdentifiers.BANKER_29,
  NpcIdentifiers.GNOME_BANKER,
  NpcIdentifiers.BANKER_30,
  NpcIdentifiers.BANKER_31,
  NpcIdentifiers.BANKER_32,
  NpcIdentifiers.BANKER_33,
  NpcIdentifiers.BANKER_34,
  NpcIdentifiers.BANKER_35,
  NpcIdentifiers.BANKER_36,
  NpcIdentifiers.BANKER_37,
  NpcIdentifiers.BANKER_38,
  NpcIdentifiers.BANKER_39,
  NpcIdentifiers.BANKER_40,
  NpcIdentifiers.BANKER_41,
  NpcIdentifiers.BANKER_42,
  NpcIdentifiers.BANKER_43,
  NpcIdentifiers.BANKER_44,
  NpcIdentifiers.BANKER_45,
  NpcIdentifiers.BANKER_46,
  NpcIdentifiers.BANKER_47,
  NpcIdentifiers.BANKER_48,
  NpcIdentifiers.BANKER_49,
  NpcIdentifiers.BANKER_50,
  NpcIdentifiers.BANKER_51,
].filter(Number.isInteger));
const BANKER_NPC_ID_SET = new Set(BANKER_NPC_IDS);
const BANK_SETTINGS_BUTTON_IDS = new Set([32503, 32512, 32513]);
const BANK_MAIN_BUTTON_IDS = new Set([
  50013,
  5386,
  5387,
  8130,
  8131,
  50004,
  50007,
  5384,
  50001,
  50010,
]);
const BANK_TAB_SELECT_START = 50070;
const REGULAR_BANK_INTERFACE_ID = Bank.MAIN_INTERFACE_ID;
const BANK_SETTINGS_INTERFACE_ID = 32500;
const BANK_OPEN_DEBOUNCE_MS = 250;
const lastBankOpenAt = new WeakMap();

function isBankTabSelectButton(buttonId) {
  if (!Number.isInteger(buttonId) || buttonId < BANK_TAB_SELECT_START) {
    return false;
  }
  const offset = buttonId - BANK_TAB_SELECT_START;
  if (offset % 4 !== 0) {
    return false;
  }
  const bankTab = offset / 4;
  return bankTab >= 0 && bankTab < Bank.TOTAL_BANK_TABS;
}

function isBankButtonForInterface(interfaceId, buttonId) {
  if (interfaceId === BANK_SETTINGS_INTERFACE_ID) {
    return BANK_SETTINGS_BUTTON_IDS.has(buttonId);
  }
  if (interfaceId === REGULAR_BANK_INTERFACE_ID) {
    return (
      BANK_MAIN_BUTTON_IDS.has(buttonId) || isBankTabSelectButton(buttonId)
    );
  }
  return false;
}

function openBank(player) {
  if (!player) {
    return false;
  }
  const now = Date.now();
  const lastOpenAt = lastBankOpenAt.get(player) ?? 0;
  if (now - lastOpenAt < BANK_OPEN_DEBOUNCE_MS) {
    return true;
  }
  lastBankOpenAt.set(player, now);

  if (
    Bank.isOpen(player)
  ) {
    return true;
  }

  if (player.isPlayerBot?.() === true) {
    // Bots do not need full interface/container refresh work just to use bank
    // operations. They only need banking state + interface marker.
    player.setStatus?.(PlayerStatus.BANKING);
    player.setEnteredSyntaxAction?.(null);
    player.setInterfaceId?.(REGULAR_BANK_INTERFACE_ID);
    return true;
  }

  player.getBank(player.getCurrentBankTab()).open();
  return true;
}

function handleBankButton(player, buttonId) {
  if (!player) {
    return false;
  }
  if (!Number.isInteger(buttonId)) {
    return false;
  }
  const interfaceId = player.getInterfaceId?.();
  if (!isBankButtonForInterface(interfaceId, buttonId)) {
    return false;
  }
  return Bank.handleButton(player, buttonId, 0) === true;
}

function handleBankInterfaceAction(player, buttonId, action) {
  if (!player) {
    return false;
  }
  if (!Number.isInteger(buttonId) || !Number.isInteger(action)) {
    return false;
  }
  const interfaceId = player.getInterfaceId?.();
  if (!isBankButtonForInterface(interfaceId, buttonId)) {
    return false;
  }
  return Bank.handleButton(player, buttonId, action) === true;
}

module.exports = {
  name: "BankBooths",
  handleBankButton,
  handleBankInterfaceAction,
  register(api) {
    const onBankBoothClick = (event) => {
      if (!BANK_BOOTH_ID_SET.has(event.objectId)) {
        return;
      }
      if (openBank(event.player)) {
        event.handled = true;
      }
    };
    api.onObjectFirstClick(BANK_BOOTH_IDS, onBankBoothClick);
    api.onObjectSecondClick(BANK_BOOTH_IDS, onBankBoothClick);

    function openBankFromNpc(event) {
      if (openBank(event.player)) {
        event.handled = true;
        return true;
      }
      return false;
    }
    api.onNpcFirstClick(BANKER_NPC_IDS, openBankFromNpc);
    api.onNpcSecondClick(BANKER_NPC_IDS, openBankFromNpc);

    api.onButtonClick((event) => {
      if (handleBankButton(event.player, event.buttonId)) {
        event.handled = true;
      }
    });

    api.onInterfaceActionClick((event) => {
      if (handleBankInterfaceAction(event.player, event.buttonId, event.action)) {
        event.handled = true;
      }
    });
  },
};
