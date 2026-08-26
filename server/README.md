# Elvarg Web Server
 
 This is a TypeScript port of the the Java Server https://github.com/RSPSApp/elvarg-rsps. The goal of this server is to have a modular/plugin based RSPS built in typescript with some accurate OSRS content (Combat, minigames etc) and highly intelligent player bots. The server is designed to be extensible via plugins. Combat should stay core, but any new content e.g. special attacks and effects should bolt on as plugins.
 
## Getting started
 
 Firstly, run
 
 ```yarn install```
 
Then, run
 
```yarn dev```

## Player persistence

Player saves are stored in `data/saves/players.sqlite`. On startup, JSON character
files from `data/saves/characters` are imported by default without modifying the
source files. Set `PLAYER_SAVE_IMPORT_LEGACY_JSON=0` (also accepts `false`, `off`,
or `no`) to skip that import; restart the server after changing the setting.

`PLAYER_SAVE_DATABASE_PATH` and `LEGACY_PLAYER_SAVE_DIRECTORY` optionally override
the database and legacy-save locations.

## Development data API

`yarn dev` starts a loopback-only REST API at
`http://127.0.0.1:49600/dev-api`. The API is not loaded or started by the
production server. It exposes canonical runtime data registered by core server
systems and plugins; the HTTP layer does not read definition files directly.

Plugins contribute definition records through
`api.registerDefinitionSource(type, { name, priority, load })`. The matching
core `DefinitionLoader` validates and merges those sources into its canonical
definition collection; API routes read that collection rather than invoking
plugin loaders or reading files themselves.

Plugins can register basic NPC actions declaratively without installing a
general NPC click hook:

```js
api.registerNpcInteraction([506, 512], {
  firstClick: { shopId: 0 },
  secondClick: { teleportLocation: { x: 3200, y: 3200, z: 0 } },
});
```

Use `onNpcInteraction` for stateful or otherwise scripted interactions.

Available routes:

1. `GET /npc_spawns` reads the minimal, merged canonical NPC spawn list.
2. `GET /dev-api/data` lists the registered server data resources.
3. `GET /dev-api/data/:resource` reads a complete canonical document.
4. `GET /dev-api/data/:resource/:id` reads one addressable entry.
5. `PUT /dev-api/data/:resource` replaces a complete writable document.
6. `PUT /dev-api/data/:resource/:id` replaces or creates one writable entry.
7. `POST /dev-api/data/:resource` appends or creates an entry.

Generic data GET responses include an `ETag`. Send it back as `If-Match` when saving to
avoid overwriting canonical state that changed after it was loaded. Writes are
serialized per resource and delegated to the owning provider.

Plugins publish data explicitly through `api.registerServerDataResource(name,
provider)`. A provider supplies `documentKind`, `read`, and optional `replace`
or `create` callbacks. `read` should return the plugin's canonical in-memory
state; persistence and runtime reload behavior remain the provider's
responsibility. No gameplay resource is exposed until its owning subsystem is
ready to register one.

Configuration:

1. `DEVELOPMENT_API_PORT` changes the API port (default: game port + 2).
2. `DEVELOPMENT_API_HOST` changes the bind address (default: `127.0.0.1`).
3. `DEVELOPMENT_API_ALLOWED_ORIGINS` adds comma-separated browser origins.
4. `DEVELOPMENT_API_MAX_BODY_BYTES` changes the JSON request limit (default: 20 MiB).

## Logging

Server logging is centralized and all `console.log/info/warn/error/debug` calls go through one logger.

Log filename convention:

`kebab-case semantic-name.log`

Logs are written to:

`./logs/server.log`
`./logs/packets.log`
`./logs/movement.log`
`./logs/player-bots.log`
`./logs/plugin-performance.log`
`./logs/player-update-bits.log`

### Default behavior

1. Enabled levels: `info,warn,error`
2. Disabled type: `plugin` (plugin chatter is off by default)

### Configure at startup (env vars)

1. `LOG_LEVELS`  
Example: `LOG_LEVELS=warn,error`
2. `LOG_ENABLED_TYPES`  
CSV allowlist. If set, only these types are emitted.
3. `LOG_DISABLED_TYPES`  
CSV denylist.

Type is inferred from the first bracket tag in a message:

1. `[plugin:Woodcutting] ...` -> `plugin`
2. `[packet.out] ...` -> `packet.out`
3. `[plugins] ...` -> `plugins`
4. No bracket prefix -> `general`

### Change logging at runtime (no restart)

Developer-only in-game commands:

1. `::logstatus`
2. `::loglevels debug,info,warn,error`
3. `::logtypeon plugin,packet.out,world`
4. `::logtypeoff plugin,packet.out,world`
5. `::logtypeclear [enabled|disabled|all]`

## Debugging connection state

You can query live connected players from the web client by typing:

```::players```

Aliases:

```::online```
```::who```

The server will reply with the online player count and usernames.

## Disconnect cleanup behavior

The server now performs explicit cleanup when a WebSocket closes:

1. Removes the player from the add queue (if they disconnected before full world registration).
2. Queues the player for world removal.
3. Forces queued removal if the underlying transport is already closed.

This prevents stale "ghost" players from remaining visible after disconnects/refreshes.

## Plugins

Runtime plugins are loaded from:

`./plugins`

Current convention is one plugin per file.
Subdirectories are supported up to 2 levels deep under `./plugins`.

Each plugin should export:

`{ name: string, register(api) }`

Plugin API hooks and contracts are documented in:

`src/main/typescript/elvarg/plugins/PluginTypes.ts`

Hook registration/guard behavior is implemented in:

`src/main/typescript/elvarg/plugins/PluginManager.ts`
