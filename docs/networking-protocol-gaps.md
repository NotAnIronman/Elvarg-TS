# Networking Protocol Gaps — Client-Blocked Features

**Purpose:** track features whose server-side implementation exists (or existed) but has no
way to actually run, because the xrsps-typescript client protocol has no wire-level way for
the client to send the triggering action. These are **not fixable server-side alone** - they
need a corresponding client-side change in xrsps-typescript first. Generated 2026-08-10
while removing dead legacy-networking code from elvarg-web-server; verified directly against
both the xrsps client and server source, not inferred.

Context: elvarg-web-server used to have a raw-numeric-opcode packet dispatch system
(`PacketConstants.ts`'s `PACKETS` map, `PlayerSession.processPackets()`, the `PacketExecutor`
interface) modeled on the real Jagex OSRS wire protocol. elvarg has since been adapted to
speak xrsps-typescript's own custom protocol instead, via `NetworkBuilder.ts`'s message-type
dispatch - and the old opcode-based system is dead (nothing feeds it packets anymore). Most
plugins that relied on it have been migrated onto the live dispatch. The features below could
not be migrated, because the *client* itself has no way to produce the message in the first
place.

## Confirmed client-protocol-blocked

### Clan chat - sending a message
- **What's missing:** typing a message while in clan chat and hitting enter does not transmit
  anything to the server.
- **Why:** the client's CS2 script handler for `CHAT_SENDCLAN` (opcode 5010) is an
  unimplemented stub - it pops its inputs (message, chatType, clanIndex) off the interpreter
  stack so the VM doesn't desync, then discards them. No packet is sent.
  `xrsps-typescript/client/rs/cs2/handlers/ChatOps.ts:153-161`
- The client's only outgoing `chat` packet encoder (`encodeChat`, opcode `CHAT=190`) has a
  hardcoded `messageType === "game" ? 1 : 0` byte - there is no third value for "clan", and
  the function's own type signature (`"public" | "game"`) doesn't allow one.
  `xrsps-typescript/client/network/packet/ClientBinaryEncoder.ts:460-465`
- xrsps's own server-side decoder agrees exactly (`messageTypeVal === 1 ? "game" : "public"`),
  confirming client and server are consistent with each other - this isn't an oversight on one
  side, clan-chat-sending simply isn't wired up anywhere in this client/protocol at all.
  `xrsps-typescript/server/src/network/packet/ClientBinaryDecoder.ts:595-603`
- **What elvarg has today:** clan chat join/leave/setup/rank-management all work fine (they're
  widget/button-driven, going through the live `onButton`/`onInterfaceActionButton` plugin
  hooks). Only *sending a message* is blocked. `allowChat()` (mute + word-filter check) is
  still defined in `plugins/interface/ClanChat.plugin.js` for when this gets fixed - just
  nothing calls it right now.
- **To fix:** implement `CHAT_SENDCLAN` in the xrsps client to actually call `sendChat` with a
  distinguishable clan flag, extend `encodeChat`/`ClientPacketId.CHAT`'s wire format to carry a
  third messageType value, then mirror that in elvarg's own decoder (`ClientProtocol.ts:154,
  572-573`) and re-add a handler resembling the removed `clanChatPacketListener`.

### Friends list - add/remove friend
### Ignore list - add/remove ignore
### Private messages - send PM
- **What's missing:** none of these actions can be triggered by the client at all.
- **Why:** xrsps's `ClientToServer` message union (the authoritative list of every message
  type the server-side type system even acknowledges) has no add-friend, remove-friend,
  add-ignore, remove-ignore, or private-message variant anywhere. The `chat` message type's
  `messageType` field is `"public" | "game"` only - no `"private_in"`/`"private_out"` incoming
  variant exists (those strings do exist, but only in the *outgoing*, server-to-client
  messageType enum used for displaying messages the server already has some other way of
  producing - not for the client to request sending one).
  `xrsps-typescript/server/src/network/messages.ts:669-673` (incoming, confirmed no private
  variant); `messages.ts:455-465` (outgoing display-only enum, unrelated)
- **What elvarg has today:** the friends/ignore-list UI and PM interface can presumably be
  opened and viewed, but actually adding/removing a name or sending a message has no live path
  - `plugins/interface/FriendsList.plugin.js` and `plugins/interface/IgnoreList.plugin.js`
  registered their action handlers via `registerAlivePacketListener`, which was only ever fed
  by the now-removed dead dispatch.
- **To fix:** needs real client-side support added to xrsps-typescript first (new message
  types, encoder/decoder support, UI wiring), then corresponding elvarg-side handlers.

## Not blocked - re-wired during this cleanup (for reference)

These looked like they might have the same problem but turned out to be fixable server-side
once investigated properly - included here so the "is X actually broken" question doesn't
need re-investigating later:

- **Bot recruit-via-trade-request** (`registerBotStatusInteractions.js`) - trade-request
  already cleanly maps to a single event server-side; re-wired onto a new
  `PluginManager.onTradeRequest` hook.
- **Bot "Status" right-click option** - NOT re-wired, but for a different reason than a client
  protocol gap: the new protocol hardcodes option-slot 1 as "Attack" with no room for a
  per-target custom relabel, which is a real design conflict in elvarg's own interaction-option
  system, not a client limitation. Left as a known gap; fixing it means reworking how custom
  interaction options map onto the numeric option field generally.
- **Makeover Mage appearance change** - turned out to already work today via the live default
  `ChangeAppearancePacketListener.apply()` path, which checks the same eligibility gate the
  plugin relies on. The one real difference (missing per-gender kit/color value clamping) was
  ported into the shared default handler so all appearance changes benefit, not just makeover.
- **Bank Deposit Box container actions** - re-wired onto the live `PluginManager.onItemAction`
  hook (already fed by `ItemActionPacketListener.handleAction`, called from
  `NetworkBuilder.ts`'s live `inventory_action` case for every clickType 1-5).

## Second wave - `onEstablishedPacket` was also silently dead

While removing `PacketConstants.PACKETS`, found that `PluginManager.emitPacketReceived`
(the only thing that ever fed the `onPacketReceived`/`onEstablishedPacket` plugin hooks) had
exactly one caller: `PlayerSession.processPackets()`. That method was itself unreachable dead
code *before this session started* - nothing ever called `session.queuePacket()` to feed the
queue it drained. So three still-registered plugins had handlers that silently never ran, for
an unknown amount of time predating this cleanup entirely (not a regression from removing
`processPackets()` - it was already a no-op). All three were investigated and fixed by
re-wiring onto genuinely live dispatch paths:

- **PriceChecker container clicks** (`PriceChecker.plugin.js`) - deposit/withdraw quantity
  clicks on the price checker's own container. Its inventory-mirror panel
  (`PRICE_CHECKER_INVENTORY_CONTAINER_ID`) always matches the real inventory slot-for-slot, so
  those clicks route through `NetworkBuilder.ts`'s live `inventory_action`/`onItemAction` path;
  the checker's own (non-inventory) container falls through to `onInterfaceActionButton`
  instead. Also deleted a large amount of now-redundant raw-byte multi-endianness decoding that
  existed only to reverse-engineer the old opcode-based packets - the structured protocol
  already gives clean `itemId`/`slot` fields.
- **Smithing equipment-container clicks** (`Smithing.plugin.js`) - the "make X" bar/item
  columns are a custom container that never matches the real inventory, so it's wired onto
  `onInterfaceActionButton` for the five column widget IDs.
- **Bot follow-back / combat-reaction / manual-control detection** (`registerBotEvents.js`,
  `FollowBackTrigger.js`, `CombatReactionTrigger.js`) - these needed live signals that didn't
  exist yet at all (no plugin hook fired on Follow or on player-vs-player Attack). Added two
  small new observer hooks mirroring the existing `onTradeRequest` pattern:
  `PluginManager.emitPlayerFollow`/`onPlayerFollow` (from `FollowPlayerPacketListener.request`)
  and `emitPlayerAttack`/`onPlayerAttack` (from `PlayerOptionPacketListener.executeClientOption`,
  option 1). Manual-control detection (auto-disabling `botme` on real object clicks) was
  re-wired onto the existing, already-live `onObjectInteraction` hook instead, since that
  already covers "any object click, any object" with no opcode set needed.

## Third wave - native use-on handlers (fixed)

While removing `UseItemPacketListener`'s dead `execute()`, found that its `itemOnObject`
method (using an item on a game object - key on a door, bucket on a well, etc.) had zero
external callers: `NetworkBuilder.ts`'s `inventory_use_on` case only handled
`target.kind === "inventory" | "player" | "ground"`, silently dropping `"loc"` (object) and
`"npc"` targets even though the client-to-server protocol type
(`ClientProtocol.ts:166`) explicitly includes both. This is **not** a client limitation like
the clan-chat/friends-list gaps above - the client already sends the correct message, elvarg's
dispatch just never read it.

- **Use-item-on-object** - fixed. `itemOnObject` was rewritten to take structured args (like
  every other `UseItemPacketListener` method) instead of decoding a raw legacy packet, and
  wired into `NetworkBuilder.ts`'s `inventory_use_on` case for `target.kind === "loc"`. Reused
  the already-existing (but previously unfed) `PluginManager.emitItemOnObject` hook - no new
  hook needed.
- **Use-item-on-npc** - fixed. Native `OPNPC_U` and high-level inventory-use packets now route
  through `UseItemPacketListener.itemOnNpc`, which validates the target and item then emits the
  plugin-owned `onItemOnNpc` hook. Native `OPLOCU` and `OPLOC_T` are likewise decoded and
  routed to their existing plugin-owned object paths.

## Removed dead paths

- The old raw-container bank decoder and its speculative byte-order recovery logic in
  `BankBooths.plugin.js` were unreferenced after bank actions moved to the live cache-native
  `Bank.handleWidgetAction` path, so they were deleted rather than retained as a second bank
  implementation.
- The obsolete `PacketExecutor` adapter and command-packet shim were removed. Chat commands
  now invoke their live command handler directly.
