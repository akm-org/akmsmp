# /redeem Skript for Minecraft

Lets players type `/redeem ABC123` in-game and instantly receive their AKM Dollars.

## Install

1. Install **Skript** on your Paper/Spigot server: https://github.com/SkriptLang/Skript
2. Install one of these for HTTP support: `skript-reflect`, `skUtilities`, or `skript-yaml`.
3. Copy [`redeem.sk`](./redeem.sk) into `plugins/Skript/scripts/`.
4. **Edit the URL** at the top of `redeem.sk`:
   ```
   options:
       shop_url: https://your-shop-url.onrender.com
   ```
   Replace with your actual deployed shop URL.
5. Run `/sk reload redeem` (or restart the server).
6. Grant the permission to players:
   ```
   /lp group default permission set akmsmp.redeem true
   ```
   (Adjust for your permissions plugin — LuckPerms shown above.)

## Requirements on your server

- An **economy plugin** that supports `/eco give <player> <amount>` from the console — Vault + EssentialsX, CMI, or similar.
- Outbound HTTPS allowed from your server (most hosts allow this by default).

## How it works

1. Player runs `/redeem ABC123`.
2. Skript calls `https://your-shop-url/api/verify-code/ABC123`.
3. Shop returns the AKM value (e.g. `10000`) and **immediately marks the code as used** so it can't be redeemed twice.
4. Skript runs `eco give <player> <value>` from the console → player's balance updates.

## Error messages players see

| Situation | Message |
| --- | --- |
| Wrong length | `Codes are 6 characters. That doesn't look right.` |
| Code already used | `This code was already used.` |
| Code never approved by admin | `That code isn't active yet. Wait for admin approval.` |
| Code typo | `Invalid code. Check spelling and try again.` |
| Shop unreachable | `Could not reach the shop. Try again in a minute.` |

## Security notes

- The shop **always** marks codes as used on the first successful verify, so even if Skript crashes mid-execute, the code can't be re-used.
- The `cooldown: 3 seconds` prevents code spam-guessing.
- 6-char alphanumeric codes (no ambiguous characters) = ~10⁹ possibilities. Brute-forcing is impractical, but you can add fail2ban-style logic if your server is high-traffic.
