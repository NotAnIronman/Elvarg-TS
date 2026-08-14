# XRSPS

A community-driven project inspired by Project Zanaris.
OSRS in the browser with a React/WebGL client and TypeScript WebSocket server.

## Packages

This repository contains:

- [`client/`](client/) — `@xrsps/client` (browser app)
- [`server/`](server/) — `@tobywisener/elvarg-web-server` (typescript upgrade of `@RSPSApp/elvarg-rsps`)
- [`docs/`](docs/) — documentation site

## Quick Start

Requires **Node.js v22.16+** and **Yarn**.

Install Yarn if it is not already installed:

```bash
npm install --global yarn
```

Install the server and client, then build collision data:

```bash
yarn setup
```

Start the server and client together:

```bash
yarn start
```

Start only the server:

```bash
yarn server
```

Start only the client:

```bash
yarn client
```

Start the documentation site (optional):

```bash
cd docs
yarn install
yarn dev
```

See [docs/setup.md](docs/setup.md) for details.

## This fork

[`server/`](server/) is [elvarg-web-server](https://github.com/tobywisener/elvarg-web-server)
(`xrsps` branch), imported here via `git subtree` with full history preserved.
`git log server/` shows every elvarg commit.

Pulling client updates from upstream `xrsps/xrsps-typescript` and opening PRs
back still works normally. Run this once per clone so `server/` conflicts in
future `git merge origin/main` auto-resolve to this fork's version instead of
upstream's server (see `.gitattributes`):

```bash
git config merge.ours.driver true
```

To pull further elvarg-web-server updates into `server/`:

```bash
git fetch elvarg xrsps   # remote: tobywisener/elvarg-web-server
git subtree pull --prefix=server elvarg xrsps -m "Update server/ from elvarg-web-server"
```

---

Fan project. Not affiliated with, endorsed by, or connected to Jagex Ltd.
Old School RuneScape and related assets/trademarks belong to their respective owners.
