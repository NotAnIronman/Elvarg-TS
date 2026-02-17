# Elvarg Web Server
 
 This is an attempted port of the the Java Server. The ultimate end goal is to have this running in a web browser tab (using webTRC for networking with the game client).
 
## Getting started
 
 Firstly, run
 
 ```npm install```
 
 Then, run
 
 ```npm run build```
 
 Then, run
 
```npm run start```

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

Available plugin API hooks:

1. `api.onPacketReceived((event) => {})`
2. `api.onPlayerLogin((event) => {})`
3. `api.onPlayerDisconnect((event) => {})`
4. `api.onPathBlocked((event) => {})` when routeing fails (`PathFinder` no-route)
5. `api.registerPacketListener(opcode, listener)` for opcode-specific handlers

No default plugins are required for movement.

Pathing packet handling is in core server listeners (`PacketConstants.PACKETS`) to match the Java server flow:

1. `MovementPacketListener` (`98`, `164`, `248`)
2. `RegionChangePacketListener` (`210`)
3. `FinalizedMapRegionChangePacketListener` (`121`)

If you add plugins, place one plugin per file in `./plugins`.
