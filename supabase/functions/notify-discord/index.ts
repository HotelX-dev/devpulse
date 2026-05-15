import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface TaskEntry {
  type: string;
  ticket_ref: string;
  desc: string;
}

function parseTasks(raw: string | null): TaskEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function taskLines(tasks: TaskEntry[]): string {
  return tasks
    .map(t => {
      const ref = t.ticket_ref ? ` \`${t.ticket_ref}\`` : '';
      return `• [${t.type}]${ref} ${t.desc}`;
    })
    .join('\n');
}

const TASK_TYPE_EMOJI: Record<string, string> = {
  Ticket: '🎫', Adhoc: '⚡', Migration: '🔄',
  'Bug fix': '🐛', Performance: '🚀', Other: '📌',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = await req.json();
    const { member_name, product_code, date, today, yesterday, blockers, task_type } = body;

    // Fetch webhook URL from app_settings
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'discord_standup_webhook')
      .single();

    const webhookUrl = setting?.value?.trim();
    if (!webhookUrl) {
      return new Response(JSON.stringify({ ok: false, reason: 'no webhook configured' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const todayTasks  = parseTasks(today);
    const yesterdayTasks = parseTasks(yesterday);

    const typeEmoji = TASK_TYPE_EMOJI[task_type] ?? '📌';
    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-MY', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const fields: object[] = [
      {
        name: '📅 Today',
        value: taskLines(todayTasks) || '_No tasks_',
        inline: false,
      },
    ];

    if (yesterdayTasks.length > 0) {
      fields.unshift({
        name: '✅ Yesterday',
        value: taskLines(yesterdayTasks),
        inline: false,
      });
    }

    if (blockers?.trim()) {
      fields.push({
        name: '🚧 Blockers',
        value: blockers.trim(),
        inline: false,
      });
    }

    const embed = {
      title: `${typeEmoji} Standup — ${member_name}`,
      description: product_code
        ? `**Product:** \`${product_code}\`  •  ${formattedDate}`
        : formattedDate,
      color: 0x6366f1, // indigo
      fields,
      footer: { text: 'DevPulse' },
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ ok: false, reason: text }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
