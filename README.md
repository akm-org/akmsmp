# AKMSMP Shop

A self-contained Node.js shop for selling in-game currency via UPI, with admin verification and one-time-use redemption codes for your Discord bot / Minecraft plugin.

## Features

- **Email + password auth** — bcrypt-hashed, signed-cookie sessions. First account becomes admin.
- **CSV storage** — all data lives in `data/*.csv` (users, items, orders, settings). No database, no cloud.
- **UPI flow** — buyer sees a QR + UPI ID, submits their UTR, admin accepts/rejects.
- **6-character redemption codes** — random, unique, single-use. Burned on first successful verify.
- **Customizable items** — add/edit/hide/delete packs and prices from the admin panel.
- **Public verify endpoint** — `GET /api/verify-code/:code` for your Discord bot or Minecraft plugin to redeem codes.

## Run locally

```bash
cd akmsmp
npm install
npm start            # http://localhost:5000
```

Or set a port: `PORT=3000 npm start`

## Admin

The very first user to sign up becomes admin automatically. After that, only emails listed in the `ADMIN_EMAILS` env var (comma-separated) become admin on signup.

## Deploy

### On Replit / Render / Railway / Fly.io / VPS  ✅ recommended
These have a real persistent disk, so `data/*.csv` survives across restarts. Just `npm install && npm start`. Set `SESSION_SECRET` to a random string in production.

### On Vercel  ⚠️ data WON'T persist
Vercel's serverless filesystem is read-only outside `/tmp`, and `/tmp` is wiped between invocations. The `vercel.json` is included for compatibility (the app will boot and serve), **but every CSV write is lost**. For real persistence on Vercel you'd need to swap `lib/csvStore.js` for Vercel KV / Postgres / Blob storage.

To deploy to Vercel anyway:
```bash
vercel
```

## Environment variables

| Var | Purpose | Default |
| --- | --- | --- |
| `PORT` | Port to listen on | `5000` |
| `SESSION_SECRET` | HMAC secret for session cookies | `akmsmp-dev-secret-change-me` |
| `ADMIN_EMAILS` | Comma-separated emails granted admin on signup | _empty_ |
| `DATA_DIR` | Where CSV files live | `./data` |

## Code verify API (for your bot / Skript)

### `GET /api/verify-code/:code` — destructive, marks code as used

```
GET /api/verify-code/ABC123
```

Successful (first call):
```json
{"status":"success","code":"ABC123","value":10000,"itemName":"10,000 AKM Dollars"}
```

Already redeemed:
```json
{"status":"error","message":"Code already redeemed"}
```

The code is **marked used on the first successful response** — subsequent calls fail with HTTP 400.

The endpoint is **lenient about input**: it uppercases the code and strips anything that isn't `A–Z` or `0–9`. So `abc123`, `ABC-123`, `ABC123/`, `abc%20123` all resolve to `ABC123`.

### `GET /api/peek-code/:code` — non-destructive, for debugging

Look up a code's status WITHOUT marking it used. Open in a browser:

```
GET /api/peek-code/ABC123
```

Returns:
```json
{
  "status": "ok",
  "code": "ABC123",
  "value": 10000,
  "itemName": "10,000 AKM Dollars",
  "orderStatus": "paid",
  "used": false,
  "createdAt": "1777571771531",
  "decidedAt": "1777571771987"
}
```

Use this to confirm a code exists in the database before debugging your bot/Skript.

### `GET /api/healthz`

Used by Render's health check. Returns `{"ok":true,"ts":...}`.

## Minecraft integration

A ready-to-use Skript file for the in-game `/redeem <CODE>` command lives at [`integrations/skript/`](./integrations/skript/). Drop it into `plugins/Skript/scripts/`, set your shop URL at the top, and players can redeem codes themselves — no Discord bot needed.

## File layout

```
akmsmp/
├── server.js            # Express app, all routes
├── lib/
│   ├── csvStore.js      # CSV read/write
│   ├── db.js            # Users / Items / Orders / Settings models
│   ├── auth.js          # signed-cookie sessions, bcrypt
│   └── codes.js         # 6-char unique code generator
├── public/              # vanilla HTML/CSS/JS frontend
├── api/index.js         # Vercel serverless entry
├── vercel.json
└── data/                # CSV files (auto-created)
```
