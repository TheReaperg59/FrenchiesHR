# Frenchie's register sales (Discord → Supabase → Income desk)

Players log register drops with Discord **`/register`** (a form/modal) or a **Log register drop** button — not free-text chat. Each submission is saved in **Supabase**. Management’s **Income** tab on the Frenchie's desk **auto-pulls** those rows into the books.

```
Player: /register or button
        → Discord modal (Amount, Station, Source, Date)
        → Supabase Edge Function (verifies Discord signature)
        → row in table register_sales (status: pending)
        → pretty embed posted in #register-sales

Manager: opens Income (or auto-pull on login/focus)
        → desk reads pending rows
        → creates Income · Register lines
        → marks rows booked
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
6. You should see success with no errors.
7. Confirm the table exists: left sidebar → **Table Editor** → `register_sales` (columns like `sale_date`, `amount`, `station`, `status`, etc.).

### Option B — Supabase CLI

```bash
# From the repo root (folder that contains supabase/)
npm install -g supabase   # or: brew install supabase/tap/supabase
supabase login            # opens browser to authorize CLI
supabase link --project-ref YOUR_PROJECT_REF
supabase db push          # applies migrations under supabase/migrations/
```

---

## Step 3 — Create the Discord application + bot

Do this **before** you set the Interactions Endpoint URL (that URL needs the Edge Function from Step 5 — skip Interactions URL for now).

### Important (why perms “don’t save”)

On the **OAuth2 → URL Generator** page, Discord does **not** save your permission checkboxes when you leave the page. That screen only **builds an invite link**. You must:

1. Check scopes + permissions  
2. **Copy the long URL at the bottom**  
3. **Open that URL** in a browser and click **Authorize** on your server  

If you leave without copying/opening the URL, the checks reset — that is normal.

There is **no separate “invite URL” button** on the Bot page. The invite link lives only under **OAuth2 → URL Generator**.

---

### 3A — Create the app

1. Open [https://discord.com/developers/applications](https://discord.com/developers/applications) while logged into Discord.
2. Top right: **New Application**.
3. Name: `Frenchies Register` (or similar) → agree to ToS → **Create**.
4. You land on **General Information** (left sidebar).

### 3B — Copy IDs from General Information

Stay on **General Information** (left sidebar — first item).

1. Find **Application ID** → click **Copy** → paste into your notes as `DISCORD_APP_ID`.
2. Scroll to **Public Key** → click **Copy** → paste as `DISCORD_PUBLIC_KEY`.
3. **Leave “Interactions Endpoint URL” blank for now.** You fill that in Step 6 after the Edge Function is deployed. If you paste a fake URL and Save, Discord will reject it.

### 3C — Create the bot user + token

1. Left sidebar → click **Bot** (under “Settings”).
2. If you see **Add Bot**, click it → **Yes, do it!**.
3. Under **Token**:
   - Click **Reset Token** → confirm (or **View Token** if shown).
   - Click **Copy** immediately → paste as `DISCORD_BOT_TOKEN`.
   - You only see the full token once; if lost, Reset Token again and update Supabase secrets later.
4. Optional: turn **Public Bot** **Off** (so only you invite it).
5. Scroll past **Privileged Gateway Intents** — leave **Message Content Intent** **off** (not needed for `/register` modal).
6. If there is a **Save Changes** button on this Bot page, click it. (Token/intents changes need Save; URL Generator does not.)

### 3D — Build the invite URL (this is the “URL link”)

1. Left sidebar → click **OAuth2**.
2. Under OAuth2, click the sub-item **URL Generator** (not “General”).
3. You should see two big sections: **SCOPES** and **BOT PERMISSIONS**.

**SCOPES** (top checklist) — check exactly these two:

- [x] **`bot`**
- [x] **`applications.commands`**

(Do not only check `bot` — without `applications.commands`, `/register` will not install.)

**BOT PERMISSIONS** (appears after you check `bot`) — check:

- [x] **Send Messages**
- [x] **Embed Links**
- [x] **Read Message History**
- [x] **View Channels** (if listed)

You do **not** need Administrator.

4. **Scroll all the way to the bottom** of the URL Generator page.
5. Find the box labeled **GENERATED URL** (long link starting with `https://discord.com/api/oauth2/authorize?...`).
6. Click **Copy** next to that box (or select all + copy).
7. **Paste the URL into a new browser tab** and press Enter.
8. Discord shows **Add to Server**:
   - Dropdown → pick your **Frenchie's** server  
   - Click **Continue** → **Authorize** → complete captcha if asked  
9. You should see “Authorized” / bot joins the server.

If the Generated URL box is empty: you have not checked **`bot`** under Scopes yet — check it and the URL appears.

### 3E — Confirm the bot is in your Discord server

1. Open the Discord app (desktop or discord.com).
2. Open your Frenchie's server.
3. Open the member list (right side) — you should see the bot (e.g. **Frenchies Register**) with a bot tag.
4. Open `#register-sales` (create the channel if needed: right-click category → Create Channel → text → name `register-sales`).
5. Server Settings → **Roles** → find the bot’s role → ensure it can see `#register-sales`.
   - Or: channel gear on `#register-sales` → **Permissions** → add the bot role → allow **View Channel**, **Send Messages**, **Embed Links**.

### 3F — Copy Server ID and Channel ID

1. Discord app → User Settings (gear next to your name) → **App Settings** → **Advanced** → turn **Developer Mode** **On** → Esc to close.
2. Right-click your **server icon/name** (top of channel list) → **Copy Server ID** → `DISCORD_GUILD_ID`.
3. Right-click the **`#register-sales`** channel → **Copy Channel ID** → `DISCORD_REGISTER_CHANNEL_ID`.

### 3G — What you should have before Step 4

- [ ] `DISCORD_APP_ID`  
- [ ] `DISCORD_PUBLIC_KEY`  
- [ ] `DISCORD_BOT_TOKEN`  
- [ ] `DISCORD_GUILD_ID`  
- [ ] `DISCORD_REGISTER_CHANNEL_ID`  
- [ ] Bot visible in the server member list  
- [ ] Bot can post in `#register-sales`  

**Still skip Interactions Endpoint URL** until Step 6.

---

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

This tells Discord your guild has a `/register` slash command, and (with `POST_BUTTON=1`) posts the green **Log register drop** button message into `#register-sales`.

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
2. You should see the bot message with **Log register drop**.
3. Right-click that message → **Pin** (so players always see it).
4. Type `/register` — Discord should offer **Log a Frenchie's register drop**.

If `/register` does not appear:

- Wait 1–2 minutes (guild commands are usually fast).
- Kick/reinvite is rarely needed; try restarting the Discord client.
- Confirm `DISCORD_GUILD_ID` is the server where you are testing.
- Confirm the bot is still in that server with `applications.commands`.

---

## Step 8 — Connect the Frenchie's desk

1. Open your live desk (Tiiny Host / local `index.html`) and sign in as **management** (Owner / HR / Store Manager, etc.).
2. Open **Settings** (account menu → Settings).
3. Scroll to **Supabase register feed**.
4. Paste:

   | Field | Value |
   |--------|--------|
   | **Supabase URL** | `https://YOUR_PROJECT_REF.supabase.co` |
   | **Supabase anon key** | `SUPABASE_ANON_KEY` from Project Settings → API |
   | **Auto-pull register sales** | Checked (recommended) |

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
2. Click **Log register drop** (or type `/register`).
3. Fill the modal:
   - **Amount:** `1000`
   - **Station:** `Bar` (must be exactly one of: `Bar`, `Floor`, `Door`, `Kitchen`, `Other`)
   - **Source:** `Food & drinks till drop`
   - **Date:** leave today’s date or set `YYYY-MM-DD`
4. Submit.
5. You should get an ephemeral “Register drop saved…” reply.
6. `#register-sales` should show a green/house **Register drop logged** embed.
7. In Supabase **Table Editor → register_sales**, a new row should exist with `status = pending`.
8. On the desk (mgmt), open **Income** (or wait for auto-pull).
9. A **Register** income line should appear (notes mention Discord `/register`).
10. In Supabase, that row’s `status` should become `booked`.
11. Pull again — nothing new should duplicate.

Backup path (if Discord/Supabase is down): Income → **Import Discord lines** still accepts:

```text
REGISTER | 2026-08-01 | Bar | 1000 | Food & drinks till drop | @Alex
```

---

## Player instructions (pin this too)

You can pin this in `#register-sales` under the button:

```text
Frenchie's register sales
• Tap “Log register drop” or type /register
• Fill Amount, Station (Bar / Floor / Door / Kitchen / Other), what was sold, Date
• Do not paste free-text REGISTER lines unless a manager asks you to
• Drops sync to the Income desk for management
```

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Discord “Interactions endpoint URL” fails to save | Function not deployed, wrong Public Key secret, or JWT still verified — redeploy with `--no-verify-jwt` and re-set `DISCORD_PUBLIC_KEY` |
| `/register` missing | Re-run command script; confirm guild ID; wait a minute; restart Discord |
| Modal submit: “Register sync is not configured” | Edge Function missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` secrets |
| Modal submit: station error | Station must be exactly `Bar`, `Floor`, `Door`, `Kitchen`, or `Other` |
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
| [`functions/discord-register/index.ts`](functions/discord-register/index.ts) | Discord interactions handler |
| [`scripts/register-discord-commands.mjs`](scripts/register-discord-commands.mjs) | Register `/register` + optional button message |
| [`config.toml`](config.toml) | `verify_jwt = false` for this function |
| Desk `index.html` Settings / Income | Pull + auto-pull into Income |

---

## Order of operations (summary)

1. Create `#register-sales`  
2. Create Supabase project → copy URL, anon, service role, project ref  
3. Run SQL migration  
4. Create Discord app/bot → copy public key, bot token, app id, guild id, channel id → invite bot  
5. `supabase secrets set …` + `functions deploy discord-register --no-verify-jwt`  
6. Set Discord **Interactions Endpoint URL** → Save  
7. Run `register-discord-commands.mjs` with `POST_BUTTON=1` → pin button  
8. Desk Settings → Supabase URL + anon → Save → Income  
9. Test `/register` end-to-end  
