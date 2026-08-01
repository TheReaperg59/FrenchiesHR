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

const INCOME_KINDS: Record<string, string> = {
  register: 'Register',
  tips: 'Tip jar',
  event: 'Event proceeds',
  deposit: 'Deposit / Treasury',
  rebate: 'Rebate cash-in',
  other: 'Other',
};

type DiscordComponent = {
  type?: number;
  custom_id?: string;
  value?: string;
  values?: string[];
  components?: DiscordComponent[];
  component?: DiscordComponent;
};

type DiscordInteraction = {
  id: string;
  type: number;
  token: string;
  channel_id?: string;
  guild_id?: string;
  data?: {
    name?: string;
    custom_id?: string;
    components?: DiscordComponent[];
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

const ComponentType = {
  ACTION_ROW: 1,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  LABEL: 18,
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

function labelText(label: string, description: string | undefined, component: Record<string, unknown>) {
  return {
    type: ComponentType.LABEL,
    label,
    ...(description ? { description } : {}),
    component,
  };
}

function registerModal() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    type: ResponseType.MODAL,
    data: {
      custom_id: 'register_modal',
      title: 'Log house income',
      components: [
        labelText('Income type', 'Matches the Income desk kinds', {
          type: ComponentType.STRING_SELECT,
          custom_id: 'kind',
          required: true,
          placeholder: 'Choose type…',
          options: [
            { label: 'Register', value: 'register', description: 'Till / register drop' },
            { label: 'Tip jar', value: 'tips', description: 'Tip jar into the house' },
            { label: 'Event proceeds', value: 'event', description: 'Event cash-in' },
            { label: 'Deposit / Treasury', value: 'deposit', description: 'House deposit / treasury' },
            { label: 'Rebate cash-in', value: 'rebate', description: 'Rebate returned to house' },
            { label: 'Other', value: 'other', description: 'Other house income' },
          ],
        }),
        labelText('Station', 'Optional for deposit / tip jar / rebate', {
          type: ComponentType.STRING_SELECT,
          custom_id: 'station',
          required: true,
          placeholder: 'Choose station…',
          options: [
            { label: 'None / House', value: 'none', description: 'No specific station' },
            ...STATIONS.map((s) => ({ label: s, value: s })),
          ],
        }),
        labelText('Amount ($)', undefined, {
          type: ComponentType.TEXT_INPUT,
          custom_id: 'amount',
          style: 1,
          min_length: 1,
          max_length: 12,
          placeholder: '1000',
          required: true,
        }),
        labelText('Source / notes', 'What was sold, or why the deposit', {
          type: ComponentType.TEXT_INPUT,
          custom_id: 'source',
          style: 2,
          min_length: 1,
          max_length: 200,
          placeholder: 'Food & drinks · House deposit · Tip jar',
          required: true,
        }),
        labelText('Date (YYYY-MM-DD)', undefined, {
          type: ComponentType.TEXT_INPUT,
          custom_id: 'sale_date',
          style: 1,
          min_length: 10,
          max_length: 10,
          placeholder: today,
          required: true,
          value: today,
        }),
      ],
    },
  };
}

function collectField(out: Record<string, string>, c: DiscordComponent | undefined) {
  if (!c) return;
  if (c.type === ComponentType.LABEL && c.component) {
    collectField(out, c.component);
    return;
  }
  if (c.type === ComponentType.ACTION_ROW && c.components) {
    for (const child of c.components) collectField(out, child);
    return;
  }
  if (!c.custom_id) return;
  if (Array.isArray(c.values) && c.values.length) {
    out[c.custom_id] = String(c.values[0] || '').trim();
    return;
  }
  if (c.value != null) out[c.custom_id] = String(c.value || '').trim();
}

function fieldMap(interaction: DiscordInteraction): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of interaction.data?.components || []) {
    collectField(out, row);
  }
  return out;
}

function normalizeKind(raw: string): string | null {
  const t = (raw || '').trim().toLowerCase();
  return INCOME_KINDS[t] ? t : null;
}

function normalizeStation(raw: string): string | null {
  const t = (raw || '').trim();
  if (!t || t.toLowerCase() === 'none' || t.toLowerCase() === 'house') return '';
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

function defaultSource(kind: string): string {
  if (kind === 'deposit') return 'House deposit';
  if (kind === 'tips') return 'Tip jar';
  if (kind === 'event') return 'Event proceeds';
  if (kind === 'rebate') return 'Rebate cash-in';
  if (kind === 'register') return 'Register';
  return 'Income';
}

async function postChannelEmbed(opts: {
  token: string;
  channelId: string;
  kind: string;
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
  const kindLabel = INCOME_KINDS[opts.kind] || opts.kind;
  const res = await fetch(`https://discord.com/api/v10/channels/${opts.channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embeds: [{
        title: `${kindLabel} logged`,
        color: opts.kind === 'deposit' ? 0xc4a35a : 0x3f7a56,
        fields: [
          { name: 'Type', value: kindLabel, inline: true },
          { name: 'Amount', value: money, inline: true },
          { name: 'Station', value: opts.station || 'House', inline: true },
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
    const kind = normalizeKind(fields.kind || 'register') || (fields.kind ? null : 'register');
    const amount = parseAmount(fields.amount || '');
    const stationRaw = fields.station || '';
    const stationNorm = normalizeStation(stationRaw);
    const source = (fields.source || defaultSource(kind || 'register')).slice(0, 200);
    let saleDate = (fields.sale_date || '').trim() || todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) saleDate = todayIso();
    const who = actorName(interaction);

    if (!kind) {
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Pick an income type: Register, Tip jar, Event, Deposit / Treasury, Rebate, or Other.',
          flags: 64,
        },
      });
    }
    if (!amount) {
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Amount must be a positive number.', flags: 64 },
      });
    }
    if (stationNorm === null) {
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Station must be None/House, Bar, Floor, Door, Kitchen, or Other.',
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

    const station = stationNorm;
    const kindLabel = INCOME_KINDS[kind] || kind;

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error } = await sb
      .from('register_sales')
      .insert({
        sale_date: saleDate,
        kind,
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
      if (String(error.code) === '23505') {
        return json({
          type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Already booked — **${kindLabel}** · **$${amount.toLocaleString()}**${station ? ` at **${station}**` : ''}. Managers will see it on the Income desk.`,
            flags: 64,
          },
        });
      }
      console.error('insert error', error);
      return json({
        type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content:
            'Could not save income row. If you just added kinds, run the kind migration in Supabase SQL Editor, then try again.',
          flags: 64,
        },
      });
    }

    let msgId: string | null = null;
    if (botToken && channelId) {
      msgId = await postChannelEmbed({
        token: botToken,
        channelId,
        kind,
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
          `${kindLabel} saved — **$${money}**` +
          (station ? ` · **${station}**` : ' · House') +
          ` · ${saleDate}` +
          (msgId
            ? '\nPosted in #register-sales. It will appear on the Income desk when management pulls.'
            : '\nSaved to Supabase for the Income desk.'),
        flags: 64,
      },
    });
  }

  return json({
    type: ResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Unsupported interaction.', flags: 64 },
  });
});
