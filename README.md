# Elvarg Web Server
 
 This is a TypeScript port of the the Java Server. The ultimate end goal is to have this running in a web browser tab (using webTRC for networking with the game client).

## Why TypeScript over Java

The original server behavior comes from Java, but this project runs in a web-first stack and targets browser-adjacent networking/runtime.

Primary reasons:

1. Shared language/tooling with the web client  
Using TypeScript across client and server reduces context switching and integration friction.

2. Faster protocol iteration  
Packet compatibility work and gameplay parity fixes are easier to ship quickly in the Node/TS workflow.

3. Plugin-driven development  
Most custom behavior in this repo is plugin-based; TS/JS keeps extension and experimentation lightweight.

4. Long-term platform alignment  
The goal is web-oriented deployment, so TypeScript keeps architecture aligned with that direction.

Tradeoff:

Java remains the behavior reference. The TS server prioritizes parity with Java mechanics while optimizing for faster web-focused development.
 
## Getting started
 
 Firstly, run
 
 ```yarn install```
 
 Then, run
 
 ```yarn dev```

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
