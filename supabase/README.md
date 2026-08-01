# Frenchie's register sales (Discord → Supabase → Income desk)

Players log register drops with Discord **`/register`** (modal form) or the **Log register drop** button. Rows land in Supabase; management’s Income tab auto-pulls them into the desk.

```
/register or button → Discord modal → Edge Function → register_sales
                                              ↓
                              Desk Pull / auto-pull → s.incomes
```

## 1. Supabase project

1. Create a project (or use your existing one).
2. Run the migration in **SQL Editor** (or `supabase db push`):

   - [`migrations/20260801_register_sales.sql`](migrations/20260801_register_sales.sql)

3. Deploy the Edge Function (**disable JWT verification** — Discord signs requests itself):

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set \
  DISCORD_PUBLIC_KEY=... \
  DISCORD_BOT_TOKEN=... \
  DISCORD_REGISTER_CHANNEL_ID=... \
  SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=...
supabase functions deploy discord-register --no-verify-jwt
```

Function URL (Interactions Endpoint):

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-register`

## 2. Discord application

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → Bot.
2. Copy **Public Key** → `DISCORD_PUBLIC_KEY`.
3. Bot → Reset Token → `DISCORD_BOT_TOKEN`.
4. OAuth2 → URL Generator: scopes `bot` + `applications.commands`; permissions **Send Messages**, **Embed Links**.
5. Invite the bot to your guild.
6. **Interactions Endpoint URL** = the Edge Function URL above → Save (Discord sends a PING).
7. Enable Developer Mode in Discord → copy `#register-sales` channel ID → `DISCORD_REGISTER_CHANNEL_ID`.

## 3. Register slash command + button

```bash
DISCORD_BOT_TOKEN=... \
DISCORD_APP_ID=... \
DISCORD_GUILD_ID=... \
DISCORD_REGISTER_CHANNEL_ID=... \
POST_BUTTON=1 \
node supabase/scripts/register-discord-commands.mjs
```

Pin the button message in `#register-sales`.

## 4. Desk Settings

On the Frenchie's desk (management → Settings):

| Field | Value |
|--------|--------|
| Supabase URL | `https://YOUR_PROJECT_REF.supabase.co` |
| Supabase anon key | Project Settings → API → `anon` `public` |
| Auto-pull register sales | On |

Income tab → **Pull from Supabase** (or open Income / focus the tab with auto-pull on).

Anon key is safe with the migration RLS: it can only **select pending** rows and call `book_register_sale`. Inserts use the service role inside the Edge Function only.

## Player flow

1. `/register` or click **Log register drop**
2. Fill Amount, Station (`Bar` / `Floor` / `Door` / `Kitchen` / `Other`), Source, Date
3. Embed posts in `#register-sales`
4. Desk books it into Income as **Register**

Paste Import of `REGISTER | …` lines remains as a backup on the Income tab.
