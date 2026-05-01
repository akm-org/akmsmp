# AKMSMP Shop v2

A Node.js UPI shop with SQLite storage, Discord bot, Minecraft Skript integration, and rate limiting.

## Features

- **Email + password auth** — bcrypt-hashed, signed-cookie sessions
- **SQLite storage** — uses Node 22's built-in `node:sqlite` (no native packages)
- **UPI payment flow** — buyer sees QR + UPI ID, submits UTR, admin accepts/rejects
- **16-character redemption codes** — grouped as `XXXX-XXXX-XXXX-XXXX`, 48-hour expiry, single-use
- **Discord bot** — `/buy`, `/register`, `/login`, `/history`, `/showorders` with approve/reject buttons, `/adminlookup`, `/serverstatus`
- **Discord webhook** — get notified when a code is redeemed in-game
- **Rate limiting** — 15 requests/min on all code endpoints
- **Minecraft player count** — live player count pushed from Skript, shown on Discord `/serverstatus`

## Quick start (local)

```bash
cd akmsmp && npm install && npm start   # http://localhost:5000
```

> Requires Node.js 22+

## Environment variables

| Var | Purpose | Default |
| --- | --- | --- |
| `PORT` | Port to listen on | `5000` |
| `SESSION_SECRET` | HMAC secret for session cookies | `akmsmp-dev-secret-change-me` |
| `DATA_DIR` | Where `akmsmp.db` (SQLite) lives | `./data` |
| `SEED_ADMIN_PASSWORD` | Password for the two permanent admin accounts on first run | `akm2009@` |
| `DISCORD_BOT_TOKEN` | Your Discord bot token | — (bot disabled if not set) |
| `DISCORD_CLIENT_ID` | Your app's Client ID from Discord portal | `1499610921792962672` |
| `DISCORD_GUILD_ID` | Your server ID for instant command registration | — (global if unset) |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL for payment/redemption notifications | — |
| `MC_PUSH_SECRET` | Secret token for player-count Skript push | — (open if unset) |
| `SHOP_URL` | Public URL of the shop | `https://akmsmp.onrender.com` |

## Permanent admin accounts

Two accounts are auto-created on first run with `SEED_ADMIN_PASSWORD` (default `akm2009@`):
- `adwaithkm896@gmail.com`
- `akmsmpadmin@gmail.com`

These emails are **always** treated as admin even if the DB row is changed.
⚠️ **Change the password** after first login.

## Discord bot setup

### 1 — Create / configure your bot
1. Go to https://discord.com/developers/applications → your app → **Bot**
2. Enable **Server Members Intent**, **Message Content Intent**, **Presence Intent**
3. Copy your **Token**

### 2 — Invite the bot
Use this URL (replace CLIENT_ID):
```
https://discord.com/oauth2/authorize?client_id=1499610921792962672&permissions=274878008384&scope=bot+applications.commands
```

### 3 — Set Render env vars
In Render → your service → Environment:
```
DISCORD_BOT_TOKEN   = <your bot token>
DISCORD_GUILD_ID    = <your Discord server ID>   # right-click server → Copy Server ID
DISCORD_WEBHOOK_URL = <webhook URL from your server's channel settings>
```
Redeploy. Commands register automatically on startup.

### Bot commands

| Command | Who | What it does |
|---|---|---|
| `/register` | Anyone | Create a shop account via DM |
| `/login` | Anyone | Link Discord to existing account |
| `/buy` | Linked users | Browse packs, create order, submit UTR |
| `/history` | Linked users | See own orders (admins see all) |
| `/orderhistory` | Admin | Full order list |
| `/showorders` | Admin | Pending orders with ✅ Approve / ❌ Reject buttons |
| `/adminlookup email:...` | Admin | All orders for a specific user |
| `/serverstatus` | Anyone | Server player count + shop stats |

## Minecraft integration

### Player count (live on `/serverstatus` bot command)
Drop `integrations/skript/player-count.sk` into `plugins/Skript/scripts/`. Set the same `MC_PUSH_SECRET` in Render and in the script.

### Code redemption (`/redeem <CODE>`)
Drop `integrations/skript/redeem.sk` into `plugins/Skript/scripts/` and set `shop_url` at the top.

## Code API

### `GET /api/redeem/:code?player=<name>` (plain text — recommended for Skript)
Returns `100000` (the amount) on success, or `error:*` on failure.

| Status | Body | Meaning |
|---|---|---|
| 200 | `100000` | Redeemed. Give player that amount. |
| 404 | `error:not-found` | Code doesn't exist. |
| 400 | `error:not-active` | Not approved yet. |
| 410 | `error:already-redeemed` | Already used. |
| 410 | `error:expired` | 48-hour window passed. |
| 429 | _(json)_ | Rate limited (>15/min per IP). |

### `GET /api/verify-code/:code?player=<name>` (JSON)
Same behavior but returns JSON with `{status, code, value, itemName}`.

### `GET /api/peek-code/:code` (non-destructive, for debugging)
Look up a code WITHOUT marking it used. Safe to use from a browser.

### `GET /api/mc/player-count`
Current online player count pushed by your Minecraft server.

### `POST /api/mc/player-count`
Update player count from Skript. Header: `x-mc-secret: <MC_PUSH_SECRET>`. Body: `{"count":5,"players":["Alex","Steve"]}`.

### `GET /api/healthz`
Render health check. Returns `{"ok":true}`.

## Deploy on Render

1. Push this repo to GitHub
2. On Render: **New Web Service** → connect repo → pick `main` branch
3. Set env vars (especially `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_WEBHOOK_URL`)
4. Set **Node Version** to `22` or higher
5. The persistent disk at `/var/data` keeps `akmsmp.db` across restarts

---
⚠️ The GitHub token and bot token in the session should be revoked and rotated immediately.
