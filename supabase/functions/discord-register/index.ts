/**
 * Discord Interactions endpoint for Frenchie's /register modal.
 * Deploy: supabase functions deploy discord-register --no-verify-jwt
 *
 * Secrets:
 *   DISCORD_PUBLIC_KEY
 *   DISCORD_BOT_TOKEN
 *   DISCORD_REGISTER_CHANNEL_ID
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const STATIONS = ['Bar', 'Floor', 'Door', 'Kitchen', 'Other'] as const;

type DiscordInteraction = {
  id: string;
  type: number;
  token: string;
  channel_id?: string;
  guild_id?: string;
  data?: {
    name?: string;
    custom_id?: string;
    components?: Array<{
      components?: Array<{ custom_id?: string; value?: string }>;
    }>;
  };
  member?: { user?: { id?: string; username?: string; global_name?: string } };
  user?: { id?: string; username?: string; global_name?: string };
};

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
} as const;

const ResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  MODAL: 9,
} as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToUint8Array(publicKeyHex),
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify'],
    );
    const message = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToUint8Array(signatureHex),
      message,
    );
  } catch {
    // Fallback for runtimes without Ed25519 in SubtleCrypto
    try {
      const nacl = await import('https://esm.sh/tweetnacl@1.0.3');
      const message = new TextEncoder().encode(timestamp + body);
      return nacl.default.sign.detached.verify(
        message,
        hexToUint8Array(signatureHex),
        hexToUint8Array(publicKeyHex),
      );
    } catch {
      return false;
    }
  }
}

function actorName(interaction: DiscordInteraction): { id: string; name: string } {
  const u = interaction.member?.user || interaction.user || {};
  const name = (u.global_name || u.username || 'Player').trim();
  return { id: String(u.id || ''), name };
}

function registerModal() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    type: ResponseType.MODAL,
    data: {
      custom_id: 'register_modal',
      title: "Log register drop",
      components: [
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'amount',
            label: 'Amount ($)',
            style: 1,
            min_length: 1,
            max_length: 12,
            placeholder: '1000',
            required: true,
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'station',
            label: 'Station',
            style: 1,
            min_length: 1,
            max_length: 20,
            placeholder: 'Bar | Floor | Door | Kitchen | Other',
            required: true,
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'source',
            label: 'What was sold / source',
            style: 2,
            min_length: 1,
            max_length: 200,
            placeholder: 'Food & drinks till drop',
            required: true,
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'sale_date',
            label: 'Date (YYYY-MM-DD)',
            style: 1,
            min_length: 10,
            max_length: 10,
            placeholder: today,
            required: true,
            value: today,
          }],
        },
      ],
    },
  };
}

function fieldMap(interaction: DiscordInteraction): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of interaction.data?.components || []) {
    for (const c of row.components || []) {
      if (c.custom_id) out[c.custom_id] = String(c.value || '').trim();
    }
  }
  return out;
}

function normalizeStation(raw: string): string | null {
  const t = raw.trim();
  const hit = STATIONS.find((s) => s.toLowerCase() === t.toLowerCase());
  return hit || null;
}

function parseAmount(raw: string): number {
  const n = Math.round(Number(String(raw).replace(/[$,\s]/g, '')) || 0);
  return n > 0 ? n : 0;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function postChannelEmbed(opts: {
  token: string;
  channelId: string;
  amount: number;
  station: string;
  source: string;
  saleDate: string;
  paidBy: string;
}): Promise<string | null> {
  const money = opts.amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  const res = await fetch(`https://discord.com/api/v10/channels/${opts.channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embeds: [{
        title: 'Register drop logged',
        color: 0x3f7a56,
        fields: [
          { name: 'Amount', value: money, inline: true },
          { name: 'Station', value: opts.station, inline: true },
          { name: 'Date', value: opts.saleDate, inline: true },
          { name: 'Source', value: opts.source.slice(0, 1024), inline: false },
          { name: 'Logged by', value: opts.paidBy.slice(0, 256), inline: true },
        ],
        footer: { text: "Frenchie's HR · /register · syncs to Income desk" },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (!res.ok) {
    console.error('channel post failed', res.status, await res.text());
    return null;
  }
  const msg = await res.json();
  return msg?.id ? String(msg.id) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return json({ ok: true, service: 'frenchies-discord-register' });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const publicKey = Deno.env.get('DISCORD_PUBLIC_KEY') || '';
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN') || '';
  const channelId = Deno.env.get('DISCORD_REGISTER_CHANNEL_ID') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const signature = req.headers.get('X-Signature-Ed25519') || '';
  const timestamp = req.headers.get('X-Signature-Timestamp') || '';
  const body = await req.text();

  if (!publicKey || !signature || !timestamp) {
    return json({ error: 'missing signature headers' }, 401);
  }

  const valid = await verifyDiscordSignature(publicKey, signature, timestamp, body);
  if (!valid) {
    return json({ error: 'invalid request signature' }, 401);
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  if (interaction.type === InteractionType.PING) {
    return json({ type: ResponseType.PONG });
  }

  // Open modal: /register or button
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    (interaction.data?.name || '').toLowerCase() === 'register'
  ) {
    return json(registerModal());
  }

  if (
    interaction.type === InteractionType.MESSAGE_COMPONENT &&
    interaction.data?.custom_id === 'register_open'
  ) {
    return json(registerModal());
  }

  if (
    interaction.type === InteractionType.MODAL_SUBMIT &&
    interaction.data?.custom_id === 'register_modal'
  ) {
    const fields = fieldMap(interaction);
    const amount = parseAmount(fields.amount || '');
    const station = normalizeStation(fields.station || '');
    const source = (fields.source || 'Register').slice(0, 200);
    let saleDate = (fields.sale_date || '').trim() || todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) saleDate = todayIso();
    const who = actorName(interaction);

    if (!amount) {
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Amount must be a positive number.', flags: 64 },
      });
    }
    if (!station) {
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Station must be one of: Bar, Floor, Door, Kitchen, Other.',
          flags: 64,
        },
      });
    }
    if (!supabaseUrl || !serviceKey) {
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Register sync is not configured (Supabase secrets missing).', flags: 64 },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error } = await sb
      .from('register_sales')
      .insert({
        sale_date: saleDate,
        station,
        amount,
        source,
        paid_by: who.name,
        discord_user_id: who.id || null,
        interaction_id: interaction.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      // Duplicate interaction (Discord retry) — treat as success
      if (String(error.code) === '23505') {
        return json({
          type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Already booked — **$${amount.toLocaleString()}** at **${station}**. Managers will see it on the Income desk.`,
            flags: 64,
          },
        });
      }
      console.error('insert error', error);
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Could not save register drop. Try again or ping management.', flags: 64 },
      });
    }

    let msgId: string | null = null;
    if (botToken && channelId) {
      msgId = await postChannelEmbed({
        token: botToken,
        channelId,
        amount,
        station,
        source,
        saleDate,
        paidBy: who.name,
      });
      if (msgId && row?.id) {
        await sb.from('register_sales').update({ discord_msg_id: msgId }).eq('id', row.id);
      }
    }

    const money = amount.toLocaleString('en-US');
    return json({
      type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content:
          `Register drop saved — **$${money}** · **${station}** · ${saleDate}` +
          (msgId ? '\nPosted in #register-sales. It will appear on the Income desk when management pulls.' : '\nSaved to Supabase for the Income desk.'),
        flags: 64,
      },
    });
  }

  return json({
    type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Unsupported interaction.', flags: 64 },
  });
});
