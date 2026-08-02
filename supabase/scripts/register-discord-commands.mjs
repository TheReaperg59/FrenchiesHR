#!/usr/bin/env node
/**
 * Register the /register guild slash command and optionally post the
 * "Log register drop" button message in #register-sales.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=... DISCORD_APP_ID=... DISCORD_GUILD_ID=... \
 *     node supabase/scripts/register-discord-commands.mjs
 *
 * Optional — post/pin button message:
 *   DISCORD_REGISTER_CHANNEL_ID=... POST_BUTTON=1 \
 *     node supabase/scripts/register-discord-commands.mjs
 */
const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const channelId = process.env.DISCORD_REGISTER_CHANNEL_ID;
const postButton = process.env.POST_BUTTON === '1' || process.env.POST_BUTTON === 'true';

if (!token || !appId || !guildId) {
  console.error('Missing DISCORD_BOT_TOKEN, DISCORD_APP_ID, or DISCORD_GUILD_ID');
  process.exit(1);
}

const command = {
  name: 'register',
  description: "Log house income — register, deposit/treasury, event, rebate (tips stay with staff)",
  type: 1,
};

const api = async (method, path, body) => {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    console.error(method, path, res.status, data);
    throw new Error(`Discord API ${res.status}`);
  }
  return data;
};

const main = async () => {
  const created = await api('POST', `/applications/${appId}/guilds/${guildId}/commands`, command);
  console.log('Registered /register command:', created.id || created.name);

  if (postButton) {
    if (!channelId) {
      console.error('POST_BUTTON set but DISCORD_REGISTER_CHANNEL_ID missing');
      process.exit(1);
    }
    try {
      const msg = await api('POST', `/channels/${channelId}/messages`, {
        content:
          "**House income**\n" +
          "Tap the button (or type `/register`) to log register drops, deposits / treasury, events, or rebates.\n" +
          "Staff keep 100% of tips — do not log tips as house income. Rows sync to the Frenchie's Income desk via Supabase.",
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 3,
            custom_id: 'register_open',
            label: 'Log house income',
          }],
        }],
      });
      console.log('Posted button message:', msg.id);
      console.log('Pin it in #register-sales so players always see it.');
    } catch (err) {
      console.error('\n/register command is OK, but the bot cannot post in that channel (Missing Access).');
      console.error('Fix: Discord → #register-sales → Edit Channel → Permissions → add Frenchies Register');
      console.error('Allow: View Channel, Send Messages, Embed Links, Read Message History → Save.');
      console.error('Confirm channel ID: right-click the channel → Copy Channel ID (must match DISCORD_REGISTER_CHANNEL_ID).');
      console.error('You can still use /register in Discord without the button.');
      process.exitCode = 2;
    }
  } else {
    console.log('Tip: set POST_BUTTON=1 and DISCORD_REGISTER_CHANNEL_ID to post the channel button.');
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
