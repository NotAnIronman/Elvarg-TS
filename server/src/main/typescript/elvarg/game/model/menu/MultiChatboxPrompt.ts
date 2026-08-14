import {
  PluginButtonClickEvent,
  PluginInterfaceActionClickEvent,
} from "../../../plugins/PluginTypes";

type MultiChatboxPromptCallback = (
  player: any,
  optionIndex: number,
  optionText: string
) => void;

type MultiChatboxPromptOption = {
  text: string;
  callback: MultiChatboxPromptCallback;
};

type PendingMultiChatboxPrompt = {
  pluginName: string;
  title: string;
  interfaceId: number;
  firstOptionButtonId: number;
  options: MultiChatboxPromptOption[];
  expiresAt: number;
};

export class MultiChatboxPrompt {
  private static pendingPrompts = new WeakMap<any, PendingMultiChatboxPrompt>();
  private static readonly LAYOUTS = new Map<
    number,
    { interfaceId: number; firstOptionButtonId: number }
  >([
    [1, { interfaceId: 13758, firstOptionButtonId: 13760 }],
    [2, { interfaceId: 2459, firstOptionButtonId: 2461 }],
    [3, { interfaceId: 2469, firstOptionButtonId: 2471 }],
    [4, { interfaceId: 2480, firstOptionButtonId: 2482 }],
    [5, { interfaceId: 2492, firstOptionButtonId: 2494 }],
  ]);
  private static readonly PROMPT_TTL_MS = 30_000;

  public static showPrompt(
    pluginName: string,
    player: any,
    title: string,
    optionCallbackPairs: Array<string | MultiChatboxPromptCallback>
  ): boolean {
    if (
      !player ||
      !player.getPacketSender ||
      typeof title !== "string" ||
      !title.trim().length
    ) {
      return false;
    }

    if (
      !Array.isArray(optionCallbackPairs) ||
      optionCallbackPairs.length < 4 ||
      optionCallbackPairs.length % 2 !== 0
    ) {
      console.warn(
        `[plugins] ${pluginName} attempted invalid sendMultiChatboxPrompt registration`
      );
      return false;
    }

    const options: MultiChatboxPromptOption[] = [];
    for (let i = 0; i < optionCallbackPairs.length; i += 2) {
      const optionText = optionCallbackPairs[i];
      const callback = optionCallbackPairs[i + 1];
      if (
        typeof optionText !== "string" ||
        !optionText.trim().length ||
        typeof callback !== "function"
      ) {
        console.warn(
          `[plugins] ${pluginName} attempted invalid sendMultiChatboxPrompt option pair at index ${i}`
        );
        return false;
      }
      options.push({ text: optionText, callback });
    }

    const layout = MultiChatboxPrompt.LAYOUTS.get(options.length);
    if (!layout) {
      console.warn(
        `[plugins] ${pluginName} attempted unsupported sendMultiChatboxPrompt option count=${options.length}`
      );
      return false;
    }

    const sender = player.getPacketSender();
    sender.sendString(title, layout.firstOptionButtonId - 1);
    for (let i = 0; i < options.length; i++) {
      sender.sendString(options[i].text, layout.firstOptionButtonId + i);
    }
    sender.sendChatboxInterface(layout.interfaceId);

    MultiChatboxPrompt.pendingPrompts.set(player, {
      pluginName,
      title,
      interfaceId: layout.interfaceId,
      firstOptionButtonId: layout.firstOptionButtonId,
      options,
      expiresAt: Date.now() + MultiChatboxPrompt.PROMPT_TTL_MS,
    });

    return true;
  }

  public static handleButtonClick(event: PluginButtonClickEvent): boolean {
    const pending = MultiChatboxPrompt.pendingPrompts.get(event.player);
    if (!pending) {
      return false;
    }
    if (!Number.isInteger(pending.expiresAt) || pending.expiresAt < Date.now()) {
      MultiChatboxPrompt.pendingPrompts.delete(event.player);
      return false;
    }

    const optionIndex = event.buttonId - pending.firstOptionButtonId;
    return MultiChatboxPrompt.selectOption(event.player, optionIndex);
  }

  public static handleInterfaceActionClick(
    event: PluginInterfaceActionClickEvent
  ): boolean {
    const pending = MultiChatboxPrompt.pendingPrompts.get(event.player);
    if (!pending) {
      return false;
    }
    if (!Number.isInteger(pending.expiresAt) || pending.expiresAt < Date.now()) {
      MultiChatboxPrompt.pendingPrompts.delete(event.player);
      return false;
    }
    if (event.buttonId !== pending.interfaceId) {
      return false;
    }

    const optionIndex = MultiChatboxPrompt.resolveOptionIndexFromAction(
      event.action,
      pending.options.length
    );
    return MultiChatboxPrompt.selectOption(event.player, optionIndex);
  }

  private static resolveOptionIndexFromAction(
    action: number,
    optionCount: number
  ): number {
    if (!Number.isInteger(action) || optionCount <= 0) {
      return -1;
    }
    if (action >= 0 && action < optionCount) {
      return action;
    }
    if (action >= 1 && action <= optionCount) {
      return action - 1;
    }
    return -1;
  }

  private static selectOption(player: any, optionIndex: number): boolean {
    const pending = MultiChatboxPrompt.pendingPrompts.get(player);
    if (!pending) {
      return false;
    }
    if (!Number.isInteger(pending.expiresAt) || pending.expiresAt < Date.now()) {
      MultiChatboxPrompt.pendingPrompts.delete(player);
      return false;
    }
    if (
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= pending.options.length
    ) {
      return false;
    }

    MultiChatboxPrompt.pendingPrompts.delete(player);
    player?.getPacketSender?.()?.sendInterfaceRemoval?.();

    const selected = pending.options[optionIndex];
    try {
      selected.callback(player, optionIndex, selected.text);
    } catch (err) {
      console.error(
        `[plugins] multi_chatbox_prompt callback failed (${pending.pluginName})`,
        err
      );
    }
    return true;
  }
}
