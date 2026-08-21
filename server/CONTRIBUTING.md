# CONTRIBUTING.md

## Purpose
This codebase is a TypeScript port with significant legacy parity work still in progress.
A large amount of directly ported TS content is incomplete or broken. Treat stability and
incremental migration as core priorities.

## Architectural Priorities

1. Keep new or non-core functionality plugin-based.
2. Keep `PluginManager` minimal: registration, dispatch, and centralized guards only.
3. Avoid embedding feature/business logic in core packet handlers when it can live in plugins.
4. Prefer composable plugin hooks over hardcoded branching in core systems.

## Plugin-First Rule

- All new gameplay features, content systems, QoL behavior, and overrides should be implemented in `plugins/` by default.
- Core server code should remain focused on foundational concerns (networking, entity lifecycle, synchronization, packet decode/encode, hook dispatch).
- If a change is not foundational, it probably belongs in a plugin.

## PluginManager Rule

- `PluginManager` should contain shared guardrails and hook plumbing, not per-feature behavior.
- Keep validation and safety checks centralized in `PluginManager` emit/register paths so plugins can stay simple.
- Do not add feature-specific logic to `PluginManager` unless it is truly generic hook infrastructure.

## Source-of-Truth Order

When behavior is unclear, resolve in this order:

1. osrs-docs (primary for technical/coding mechanics): https://osrs-docs.com/
2. OSRS Wiki (primary gameplay intent/reference): https://oldschool.runescape.wiki/
3. Java server reference implementation (secondary parity reference)

If sources conflict, prefer OSRS Wiki behavior unless there is a strong project-specific constraint.

### OSRS Reference Links

1. osrs-docs (mechanics/protocol docs): https://osrs-docs.com/
2. OSRS Wiki (main): https://oldschool.runescape.wiki/
3. OSRS Wiki game mechanics category: https://oldschool.runescape.wiki/w/Category:Game_mechanics

## Migration Guidance

- Assume some TS-ported core content is broken until proven otherwise.
- When touching broken legacy TS content, prefer extracting/fixing behavior into plugins where possible.
- Keep changes incremental, testable, and isolated.
- Avoid large rewrites of core systems unless explicitly requested.

## Practical Decision Rule

If in doubt:

1. Implement in a plugin.
2. Keep hook contracts generic.
3. Keep guards centralized in core hook dispatch.
4. Base behavior on OSRS Wiki first, then Java.

## Server-Defined Interfaces

An interface that does not exist in the cache is defined entirely by the server. A plugin
registers one definition - the widget group plus the behaviour the client drives it with -
and it becomes an addressable resource:

    api.registerCustomInterface({ groupId, widgets, search, list, status, hint })
    -> GET /api/interfaces/<groupId>

The client fetches it the first time that group is opened, so opening one only needs the
usual sub-interface packet. `widgets/custom/CustomInterfaceRuntime.ts` reads the behaviour
half and owns focus, keystrokes, scrolling and slot binding; see
`plugins/interface/ItemSpawner.plugin.js` for a worked example.

Row data is a separate resource, registered with
`api.registerContentEndpoint(name, handler)` and served at `/api/<name>`. Use it for
request/response shaped, cache-derived data - searches, lists, lookups.

Rules for both:

- Read-only and public. Anything player-specific or privileged stays on the game socket,
  where the session is already authenticated.
- Responses carry an ETag and revalidate to 304, so definitions are fetched once per build
  rather than pushed on every open.
- The first open of a session waits on a fetch. Updates sent in the same batch are held by
  the client and applied once the widgets exist, so an interface can be populated straight
  after opening it.

Adding an interface of this kind should need no client change. If it does, the missing
capability belongs in the runtime as a declared option, not in a feature-specific module.

## Cache Lookup Tooling

Interface, sprite and clientscript ids must come from the cache in `server/caches`, not from
317-era RSPS code. To resolve one:

1. Name to id: RuneLite's generated `net/runelite/api/gameval/InterfaceID.java` (also
   `VarbitID`, `VarPlayerID`, `ItemID`) maps a feature to its group and component ids.
2. Confirm against this cache: `yarn dump:widget <groupId>` prints every component with its
   type, parent, sprite, text and CS2 listeners. Its header documents the output.
3. Read the cache's own logic: `yarn dump:cs2 <scriptId>` disassembles a clientscript, which
   is how you find which varp/varbit renders a value and whether a script will overwrite
   text the server sends.

Prefer feeding the varps/varbits a cache script already reads over writing component text
the same script will overwrite.

## Coding Conventions

- Prefer enums/constants over magic numbers.
- Do not hardcode semantic IDs when a named symbol exists (for example rights, opcodes, states, interface IDs).
- If a constant does not exist yet, add one in the appropriate shared module instead of repeating raw numbers.

## Pattern Consistency Rule

- Follow the existing implementation pattern in the module/domain you are changing.
- Prefer updating canonical data/config sources (for example `data/definitions/items.json`, `shops.json`) over adding runtime override maps or one-off adapter code.
- Do not introduce single-item special-case paths, temporary override layers, or new abstractions for one value unless explicitly requested.
- If a requested change appears to require a pattern deviation, stop and confirm with the requester before implementing.
