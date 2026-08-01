# Frenchie's register sales (Discord → Supabase → Income desk)

Players log house income with Discord **`/register`** (a form/modal modeled on the desk **Log income** screen) or a **Log house income** button — not free-text chat. Each submission is saved in **Supabase**. Management’s **Income** tab **auto-pulls** those rows into the books with the correct kind, station, tips→pool, source, and **logged-by name**.

Discord only allows **5 fields** in a modal, so the form matches the desk like this:

| Desk field | Discord `/register` |
|------------|---------------------|
| Kind | Dropdown (Register, Tip jar, Event, Deposit / Treasury, Rebate, Other) |
| Station | Dropdown (—, Bar, Floor, Door, Kitchen, Other) |
| Amount ($) | Text |
| Tips → pool ($) | Text (use `0` unless Tip jar) |
| Source | Text |
| Date | **Auto** = today |
| Logged by | **Auto** = Discord **server nickname** (IC name), else display name |
| Receipt / reference | **Auto** = Discord message id after channel post |
| Discord ref | **Auto** = `sb:<uuid>` when the desk pulls |

```
Player: /register or button
        → Discord modal (Kind ▼, Station ▼, Amount, Tips→pool, Source)
        → Supabase Edge Function (verifies Discord signature)
        → row in register_sales (kind, tips_to_pool, paid_by, pending)
        → embed in #register-sales (includes Logged by)

Manager: opens Income (or auto-pull)
        → desk books matching Income line (name, tips pool, kind, …)
        → marks row booked
```

---

## What you need before starting

| Item | Where it comes from |
|------|---------------------|
| A Supabase account | [supabase.com](https://supabase.com) |
| This repo on your computer (or GitHub Codespaces / similar) | So you can deploy the Edge Function |
| Supabase CLI | Installed in step 2 |
| Permission to create a Discord bot on your server | Server owner / Manage Server |
| Discord channel `#register-sales` | Create it first if it does not exist |
| Management access on the Frenchie's desk | To paste Supabase URL + anon key in Settings |

**Create `#register-sales` in Discord first** (any text channel the bot can post in). You can rename later; you will copy its channel ID.

---

## Cheat sheet — values you will collect

Copy these into a notes file as you go. **Never commit tokens or keys to GitHub.**

| Name | Example shape | Used for |
|------|----------------|----------|
| `YOUR_PROJECT_REF` | `abcdefghijklmnop` | Supabase URL + CLI link |
| `SUPABASE_URL` | `https://abcdefghijklmnop.supabase.co` | Function secrets + desk Settings |
| `SUPABASE_ANON_KEY` | long `eyJ...` JWT | Desk Settings only (public + RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | long `eyJ...` JWT | Function secret only (**keep private**) |
| `DISCORD_PUBLIC_KEY` | 64-char hex | Function secret (signature verify) |
| `DISCORD_BOT_TOKEN` | long token | Function secret + command script |
| `DISCORD_APP_ID` | numeric snowflake | Command script |
| `DISCORD_GUILD_ID` | numeric snowflake | Command script (your Discord server) |
| `DISCORD_REGISTER_CHANNEL_ID` | numeric snowflake | Function secret + button post |

---

## Step 1 — Create (or open) your Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New project** (or open an existing project you want to use for Frenchie's).
3. Choose organization, set a **project name** (e.g. `frenchies-hr`), set a strong database password (save it somewhere safe), pick a region close to you, then **Create project**.
4. Wait until the project shows as healthy (green).
5. In the left sidebar open **Project Settings** (gear) → **General**.
6. Copy **Reference ID** → that is `YOUR_PROJECT_REF`.
7. Still under Project Settings, open **API**:
   - **Project URL** → `SUPABASE_URL` (looks like `https://YOUR_PROJECT_REF.supabase.co`)
   - Under **Project API keys**:
     - `anon` `public` → `SUPABASE_ANON_KEY` (safe to put in the desk; RLS limits what it can do)
     - `service_role` `secret` → `SUPABASE_SERVICE_ROLE_KEY` (**never** put this in the desk or shared packs; Edge Function only)

---

## Step 2 — Create the database table (migration)

This creates `register_sales`, row-level security, and the `book_register_sale` function the desk calls after it imports a row.

### Option A — SQL Editor (easiest)

1. In the Supabase dashboard, open **SQL Editor**.
2. Click **New query**.
3. Open this file from the repo in another window:

   [`migrations/20260801_register_sales.sql`](migrations/20260801_register_sales.sql)

4. Select **all** of that SQL, copy it, paste into the SQL Editor.
5. Click **Run** (or Ctrl/Cmd + Enter).
6. Also run these the same way (safe to re-run):
   - [`migrations/20260801_register_sales_kind.sql`](migrations/20260801_register_sales_kind.sql) — `kind` column
   - [`migrations/20260801_register_sales_tips_pool.sql`](migrations/20260801_register_sales_tips_pool.sql) — `tips_to_pool` + `notes`
7. You should see success with no errors.
8. Confirm the table exists: left sidebar → **Table Editor** → `register_sales` (columns like `sale_date`, `kind`, `amount`, `tips_to_pool`, `station`, `paid_by`, `status`, etc.).

### Option B — Supabase CLI

```bash
# From the repo root (folder that contains supabase/)
npm install -g supabase   # or: brew install supabase/tap/supabase
supabase login            # opens browser to authorize CLI
supabase link --project-ref YOUR_PROJECT_REF
supabase db push          # applies migrations under supabase/migrations/
```

---

## Step 3 — Create the Discord application + bot (fixed invite method)

**App Verification is not required.**  
**Do not use a custom Redirect URI for this bot.** Discord’s docs say bot invites with only `bot` + `applications.commands` should **not** use `redirect_uri`. Adding `https://discord.com/oauth2/authorized` and authorizing often makes the Discord desktop app show **Invalid Form Body** after “success.”

Use the **Installation** page + **Discord Provided Link** (current Discord-recommended path).

### 3A — Create the app + bot user

1. Open https://discord.com/developers/applications in **Chrome or Edge**.
2. **New Application** → name `Frenchies Register` → **Create**.
3. On **General Information**, copy:
   - **Application ID** → `DISCORD_APP_ID`
   - **Public Key** → `DISCORD_PUBLIC_KEY`
4. Leave **Interactions Endpoint URL** empty.
5. Left sidebar → **Bot** → **Add Bot** if needed → **Reset Token** → **Copy** → `DISCORD_BOT_TOKEN`.
6. Optional: Public Bot = Off. Leave privileged intents off. Click **Save Changes** if shown.

### 3B — Remove Redirects that break the invite

1. Left sidebar → **OAuth2**.
2. Under **Redirects**, **delete** every redirect (including `https://discord.com/oauth2/authorized` if you added it).
3. Click **Save Changes**.

### 3C — Installation page (use this invite)

1. Left sidebar → **Installation**.
2. **Installation Contexts**:
   - Check **Guild Install**
   - Uncheck **User Install** (simpler for a server-only bot)
3. **Install Link** → select **Discord Provided Link**.
4. **Default Install Settings** for **Guild Install**:
   - Scopes: **`bot`** and **`applications.commands`**
   - Permissions: **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**
5. Click **Save Changes** and wait until it saves.
6. Copy the **Install Link** at the top of the Installation page.
7. Paste into a **new Chrome/Edge tab** → Enter.
8. Choose **[ECRP] Frenchies** → **Authorize**.
9. Close the browser tab. If Discord shows **Invalid Form Body**, click Close, then do 3D anyway.

### 3D — Confirm in Integrations (source of truth)

Member list can hide bots. Do this:

1. Discord → **[ECRP] Frenchies** → click server name → **Server Settings**.
2. Left: **Integrations** → **Bots and Apps**.
3. Find **Frenchies Register**.
4. Create `#register-sales` if needed; channel Permissions → allow the bot View / Send / Embed / Read History.

### 3E — Backup invite (no redirect in the URL)

If Installation still fails, open this in Chrome (replace `YOUR_APP_ID` with Application ID):

```text
https://discord.com/api/oauth2/authorize?client_id=YOUR_APP_ID&permissions=3072&scope=bot%20applications.commands
```

That URL has **no** `redirect_uri`. Authorize → check **Integrations** again.  
(`3072` = View Channel + Send Messages; raise channel perms after if needed.)

### 3F — Copy server + channel IDs

1. User Settings → Advanced → **Developer Mode** On.
2. Right-click server → **Copy Server ID** → `DISCORD_GUILD_ID`.
3. Right-click `#register-sales` → **Copy Channel ID** → `DISCORD_REGISTER_CHANNEL_ID`.

### 3G — Checklist before Step 4

- [ ] `DISCORD_APP_ID`
- [ ] `DISCORD_PUBLIC_KEY`
- [ ] `DISCORD_BOT_TOKEN`
- [ ] `DISCORD_GUILD_ID`
- [ ] `DISCORD_REGISTER_CHANNEL_ID`
- [ ] Bot listed under Server Settings → Integrations
- [ ] Bot can access `#register-sales`
- [ ] Redirects list empty (or unused)
- [ ] Interactions Endpoint URL still blank

| Still stuck? | Fix |
|--------------|-----|
| No Manage Server on the guild | Ask an admin to Authorize, or get Manage Server |
| Server requires 2FA for mods | Enable 2FA on your Discord account |
| Wrong app | Confirm Application ID matches the Install Link |
| App Verification tab | Ignore — not needed under 100 servers |

## Step 4 — Install Supabase CLI (if you have not)

Pick one:

```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# npm (any OS with Node)
npm install -g supabase

# Confirm
supabase --version
```

Also need **Node.js** for the slash-command script later (`node -v` should work).

---

## Step 5 — Deploy the Edge Function + secrets

The Edge Function is Discord’s **Interactions Endpoint**. It must be public (`--no-verify-jwt`) because Discord signs requests with Ed25519; Supabase JWT auth would block Discord.

From the **repo root** (the folder that contains `supabase/` and `index.html`):

```bash
cd /path/to/FrenchiesHR

supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets (paste your real values; keep quotes if a value has special characters):

```bash
supabase secrets set \
  DISCORD_PUBLIC_KEY="YOUR_PUBLIC_KEY_HEX" \
  DISCORD_BOT_TOKEN="YOUR_BOT_TOKEN" \
  DISCORD_REGISTER_CHANNEL_ID="YOUR_CHANNEL_ID" \
  SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

Deploy:

```bash
supabase functions deploy discord-register --no-verify-jwt
```

Your Interactions URL is:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-register
```

Quick health check (optional):

```bash
curl -s "https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-register"
```

You should see JSON like `{"ok":true,"service":"frenchies-discord-register"}`.

---

## Step 6 — Point Discord at the Edge Function

1. Discord Developer Portal → your app → **General Information**.
2. Find **Interactions Endpoint URL**.
3. Paste:

   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-register`

4. Click **Save**.
5. Discord sends a **PING**. If the function and `DISCORD_PUBLIC_KEY` are correct, Save succeeds.
6. If Save fails (“could not validate”):
   - Confirm the function deployed (`supabase functions list`)
   - Confirm `DISCORD_PUBLIC_KEY` secret matches the portal Public Key exactly (no spaces/newlines)
   - Re-run `supabase secrets set DISCORD_PUBLIC_KEY="..."` and redeploy if needed
   - Wait ~30 seconds and try Save again

---

## Step 7 — Register `/register` and post the channel button

This tells Discord your guild has a `/register` slash command, and (with `POST_BUTTON=1`) posts the green **Log house income** button message into `#register-sales`.

From the repo root:

```bash
DISCORD_BOT_TOKEN="YOUR_BOT_TOKEN" \
DISCORD_APP_ID="YOUR_APP_ID" \
DISCORD_GUILD_ID="YOUR_GUILD_ID" \
DISCORD_REGISTER_CHANNEL_ID="YOUR_CHANNEL_ID" \
POST_BUTTON=1 \
node supabase/scripts/register-discord-commands.mjs
```

Expected console output:

- `Registered /register command: ...`
- `Posted button message: ...`
- Tip to pin the message

In Discord:

1. Open `#register-sales`.
2. You should see the bot message with **Log house income**.
3. Right-click that message → **Pin** (so players always see it).
4. Type `/register` — Discord should offer **Log house income — register, tips, deposit/treasury…**.

If `/register` does not appear:

- Wait 1–2 minutes (guild commands are usually fast).
- Kick/reinvite is rarely needed; try restarting the Discord client.
- Confirm `DISCORD_GUILD_ID` is the server where you are testing.
- Confirm the bot is still in that server with `applications.commands`.

---

## Step 8 — Connect the Frenchie's desk

1. Open your live desk (Tiiny Host / local `index.html`) and sign in as **management** (Owner / HR / Store Manager, etc.).
2. Open **Settings** (account menu → Settings).
3. Scroll to **Supabase Discord income feed**.
4. Paste:

   | Field | Value |
   |--------|--------|
   | **Supabase URL** | `https://YOUR_PROJECT_REF.supabase.co` |
   | **Supabase anon key** | `SUPABASE_ANON_KEY` from Project Settings → API |
   | **Auto-pull register sales** | Checked (recommended) — pulls all Discord income kinds |

5. Click **Save settings**.
6. Go to **Office → Income**.
7. You should see a chip like **Supabase · ready** or **Supabase · synced** (not **off**).
8. Use **Pull from Supabase** anytime to force a sync.

Notes:

- Only **management** can pull/book (same gate as the Income tab).
- The **anon** key is OK in the desk: RLS only allows reading `pending` rows and calling `book_register_sale`. Inserts use the **service role** inside the Edge Function.
- Shared desk packs **redact** Supabase URL + anon key (same idea as Discord webhooks).

---

## Step 9 — End-to-end test

1. In Discord (as a player/staff account), go to `#register-sales`.
2. Click **Log house income** (or type `/register`).
3. Fill the modal (same ideas as desk **Log income**):
   - **Kind:** `Register` (or `Deposit / Treasury` / `Tip jar`)
   - **Station:** `Bar` (or `—` for deposits)
   - **Amount ($):** `1000`
   - **Tips → pool ($):** `0` (or tip-pool amount if Tip jar)
   - **Source:** `Food & drinks till drop` / `House deposit`
4. Submit — reply includes amount + **your Discord nick** as Logged by. Date is today automatically.
5. `#register-sales` embed shows Kind, Amount, Station, Date, Logged by, Source.
6. Supabase `register_sales` row: `pending`, correct `kind`, `paid_by`, `tips_to_pool`.
7. Desk Income pull → matching kind + Logged by name (+ tips→pool for tip jar).
8. Row becomes `booked`. Pull again — no duplicate.

Backup path (if Discord/Supabase is down): Income → **Import Discord lines** still accepts:

```text
REGISTER | 2026-08-01 | Bar | 1000 | Food & drinks till drop | @Alex
```

---

## Player instructions (pin this too)

You can pin this in `#register-sales` under the button:

```text
Frenchie's house income
• Tap “Log house income” or type /register
• Pick Income type (Register, Tip jar, Event, Deposit / Treasury, Rebate, Other)
• Pick Station (or None / House), Amount, Source / notes, Date
• Do not paste free-text REGISTER lines unless a manager asks you to
• Rows sync to the Income desk for management
```

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Discord “You must specify at least one URI for authentication” | OAuth2 → add Redirect `https://discord.com/oauth2/authorized` → Save Changes → then use URL Generator |
| Discord app toast **Invalid Form Body** on `/register` or button | Usually a bad modal payload from the Edge Function — pull latest `discord-register`, redeploy, try again. Do not click the button until Interactions URL Save succeeded. |
| Discord “Interactions endpoint URL” fails to save | Function not deployed, wrong Public Key secret, or JWT still verified — redeploy with `--no-verify-jwt` and re-set `DISCORD_PUBLIC_KEY` |
| `/register` missing | Re-run command script; confirm guild ID; wait a minute; restart Discord |
| Modal submit: “Register sync is not configured” | Edge Function missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` secrets |
| Modal submit: station error | Use the Station dropdown (`None / House`, `Bar`, `Floor`, `Door`, `Kitchen`, `Other`) |
| Modal submit: could not save / kind migration hint | Run `20260801_register_sales_kind.sql` in SQL Editor, then redeploy `discord-register` |
| Embed does not post in channel | Bad `DISCORD_BOT_TOKEN` or `DISCORD_REGISTER_CHANNEL_ID`; bot lacks Send Messages in that channel |
| Desk chip “Supabase · off” | URL/anon key blank or invalid in Settings |
| Desk pull fails / CORS or 401 | Wrong anon key; migration/RLS not applied; URL missing `https://` |
| Rows stay `pending` forever | Manager never opened Income / auto-pull off / not signed in as mgmt |
| Duplicate worry | Desk skips existing `discordRef` `sb:<uuid>` and still marks booked; `interaction_id` is unique |

---

## Security reminders

- **Service role key** = full database power. Only in Supabase Function secrets.
- **Bot token** = can post as your bot. Only in secrets + your local shell when running the script.
- **Anon key** = OK in desk Settings; protected by RLS in the migration.
- Do not put secrets in `index.html` in the repo or in Tiiny Host as hardcoded strings — use Settings after deploy.
- Shared pack publish clears Supabase URL/anon (and Discord webhooks).

---

## File map

| Path | Purpose |
|------|---------|
| [`migrations/20260801_register_sales.sql`](migrations/20260801_register_sales.sql) | Table + RLS + `book_register_sale` |
| [`migrations/20260801_register_sales_kind.sql`](migrations/20260801_register_sales_kind.sql) | Adds `kind` (register / tips / event / deposit / rebate / other) |
| [`migrations/20260801_register_sales_tips_pool.sql`](migrations/20260801_register_sales_tips_pool.sql) | Adds `tips_to_pool` + `notes` |
| [`functions/discord-register/index.ts`](functions/discord-register/index.ts) | Discord interactions handler (desk-like Log income modal) |
| [`scripts/register-discord-commands.mjs`](scripts/register-discord-commands.mjs) | Register `/register` + optional button message |
| [`config.toml`](config.toml) | `verify_jwt = false` for this function |
| Desk `index.html` Settings / Income | Pull + auto-pull into Income |

---

## Upgrading from v40/v41 — detailed steps (desk-like Log income modal)

You already have Discord `/register` → Supabase → Income working. These steps add the **desk-like Log income modal** (Kind, Station, Amount, Tips→pool, Source), **Logged by = Discord nick**, and desk **v42** pull.

Use **PowerShell**. Do **not** use `\` line continuations (those break on Windows).

### A — Get the new code on your PC

1. Open PowerShell.
2. Go to your FrenchiesHR folder (adjust if your path differs):

```powershell
cd C:\Users\Caleb\OneDrive\Documents\FrenchiesHR
```

3. Fetch and check out the upgrade branch (or `main` after the PR is merged):

```powershell
git fetch origin
git checkout cursor/register-modal-kinds-ec6d
git pull origin cursor/register-modal-kinds-ec6d
```

4. Confirm these files exist:

```powershell
dir supabase\migrations\20260801_register_sales_kind.sql
dir supabase\functions\discord-register\index.ts
```

### B — Add columns in Supabase (SQL)

1. Open https://supabase.com/dashboard → your Frenchie's project.
2. Left sidebar → **SQL Editor** → **New query** (or reuse the same tab — fine either way).
3. Run **each** file below (copy all → paste → **Run**). Safe to run twice.

   | File | Adds |
   |------|------|
   | `supabase\migrations\20260801_register_sales_kind.sql` | `kind` |
   | `supabase\migrations\20260801_register_sales_tips_pool.sql` | `tips_to_pool`, `notes` |

4. Confirm in **Table Editor → `register_sales`**: columns **`kind`**, **`tips_to_pool`**, **`notes`**, **`paid_by`**.

If Discord submit fails with a save/migration hint, re-run the missing SQL.

### C — Redeploy the Edge Function

Secrets from v40 stay in place. You only redeploy the function code.

1. In the same PowerShell folder (`FrenchiesHR` root):

```powershell
supabase login
supabase link --project-ref lvrdxsjnthlyshdidvyy
supabase functions deploy discord-register --no-verify-jwt
```

(Replace `lvrdxsjnthlyshdidvyy` if your project ref is different.)

2. Wait until deploy finishes successfully.
3. Optional health check:

```powershell
curl.exe -s "https://lvrdxsjnthlyshdidvyy.supabase.co/functions/v1/discord-register"
```

You want: `{"ok":true,"service":"frenchies-discord-register"}`.

4. You do **not** need to change Discord’s Interactions Endpoint URL if it already points at that function URL and Save already worked.

### D — Refresh the `/register` command (and optional new button)

This updates the slash-command description. Optional: post a new **Log house income** button.

1. Set your Discord values. App / guild / channel IDs below are already filled from your v40 setup.  
   **Only replace the bot token** — Discord Developer Portal → your app → **Bot** → **Reset Token** / **Copy**.

```powershell
$env:DISCORD_BOT_TOKEN="PASTE_BOT_TOKEN_HERE"
$env:DISCORD_APP_ID="1532992006962282556"
$env:DISCORD_GUILD_ID="1515796104955035668"
$env:DISCORD_REGISTER_CHANNEL_ID="1532982839690268772"
```

2. Update the slash command only (safest if channel perms are still messy):

```powershell
node supabase\scripts\register-discord-commands.mjs
```

3. Or also post a new channel button:

```powershell
$env:POST_BUTTON="1"
node supabase\scripts\register-discord-commands.mjs
```

If button post fails with **Missing Access**, `/register` still works — fix channel permissions later and re-run with `POST_BUTTON=1`.

4. In Discord, type `/register` — description should mention house income / deposit / treasury.
5. If Discord still shows the old description, wait ~1 minute or restart Discord.

### E — Upload desk v41

1. Open `index.html` from this branch and confirm `DESK_BUILD = 'v42'` (or Settings changelog shows v42).
2. Upload that `index.html` to Tiiny Host (same way you uploaded v40).
3. Hard-refresh the live desk (Ctrl+F5).
4. Sign in as management → Settings → confirm Supabase URL + anon key are still filled → Save if needed.
5. Office → Income → chip should still say **Supabase · ready** or **Supabase · synced** (not **off**).

### F — Test (matches desk Log income)

1. In Discord, set your **server nickname** to your IC name (e.g. `Kenzie Long`) — that becomes **Logged by**.
2. Run `/register` (or tap **Log house income**).
3. Modal title should be **Log income**.
4. Fill like the desk:
   - **Kind:** Deposit / Treasury (or Tip jar / Register)
   - **Station:** —
   - **Amount ($):** `500`
   - **Tips → pool ($):** `0` (or an amount if Tip jar)
   - **Source:** `House deposit`
5. Submit → reply includes your name and amount.
6. `#register-sales` embed shows **Kind, Amount, Station, Date, Logged by, Source** (and Tips→pool when tip jar).
7. Supabase row: `kind`, `tips_to_pool`, `paid_by` = your nick, `status = pending`.
8. Desk → Income → **Pull from Supabase**.
9. Income line should match kind + **Logged by** name + tips→pool when applicable.
10. Supabase row → `booked`.

### Quick checklist

| Done? | Step |
|-------|------|
| ☐ | Git pull upgrade branch / merged main |
| ☐ | SQL: `kind` + `tips_to_pool` migrations |
| ☐ | `supabase functions deploy discord-register --no-verify-jwt` |
| ☐ | Re-run `register-discord-commands.mjs` |
| ☐ | Upload desk `index.html` with **v42** |
| ☐ | Test Tip jar / Deposit / Register → desk Pull shows Logged by |

---


## Order of operations (summary)

1. Create `#register-sales`  
2. Create Supabase project → copy URL, anon, service role, project ref  
3. Run SQL migrations (base table + kind column)  
4. Create Discord app/bot → copy public key, bot token, app id, guild id, channel id → invite bot  
5. `supabase secrets set …` + `functions deploy discord-register --no-verify-jwt`  
6. Set Discord **Interactions Endpoint URL** → Save  
7. Run `register-discord-commands.mjs` with `POST_BUTTON=1` → pin button  
8. Desk Settings → Supabase URL + anon → Save → Income  
9. Test `/register` end-to-end  
