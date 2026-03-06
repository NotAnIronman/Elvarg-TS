const { MODE_DESCRIPTORS } = require("../modes");

function createModeHandlers({
  botStatesByName,
  api,
  behaviorMode,
  modeHandlers = {},
  objectSearch = null,
  options = {},
}) {
  const requiredHooksByMode = {};

  for (const descriptor of MODE_DESCRIPTORS) {
    if (!descriptor || typeof descriptor.create !== "function") {
      throw new Error("createModeHandlers encountered an invalid mode descriptor.");
    }
    const modeValue = behaviorMode?.[descriptor.modeProperty];
    if (typeof modeValue !== "string" || modeValue.length === 0) {
      throw new Error(
        `createModeHandlers missing behaviorMode.${descriptor.modeProperty} for mode descriptor '${descriptor.key}'.`
      );
    }

    const behavior = descriptor.create({
      botStatesByName,
      api,
      behaviorMode,
      modeHandlers,
      objectSearch,
      options,
    });

    modeHandlers[modeValue] = behavior;
    requiredHooksByMode[modeValue] = Array.isArray(descriptor.requiredHooks)
      ? [...descriptor.requiredHooks]
      : [];
  }

  return {
    modeHandlers,
    requiredHooksByMode,
  };
}

module.exports = {
  createModeHandlers,
  MODE_DESCRIPTORS,
};
