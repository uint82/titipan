// butuh CRON_SECRET bearer auth.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL,
// BREVO_API_KEY, BREVO_SENDER_EMAIL, CRON_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const BREVO_SENDER = Deno.env.get("BREVO_SENDER_EMAIL");
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const ALLOWED_ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") ?? "http://localhost:5173";

const missing = [
  !SUPABASE_URL && "SUPABASE_URL",
  !SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  !APP_URL && "APP_URL",
  !BREVO_API_KEY && "BREVO_API_KEY",
  !BREVO_SENDER && "BREVO_SENDER_EMAIL",
  !CRON_SECRET && "CRON_SECRET",
].filter(Boolean);

if (missing.length > 0) {
  throw new Error(`Missing required secrets: ${missing.join(", ")}`);
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ReminderVault = {
  id: string;
  original_filename: string;
  deadline_at: string;
  user_id: string;
};

type ReminderType = "7d" | "1d";

type ReminderResult = {
  vaultId: string;
  reminderType: ReminderType;
  success: boolean;
  error?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const authHeader = req.headers.get("Authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return cors(json({ error: "Unauthorized" }, 401));
  }

  try {
    const results = await processReminders();
    return cors(json({
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }));
  } catch (err) {
    console.error("send-reminders fatal error:", err);
    return cors(json({ error: String(err) }, 500));
  }
});

async function processReminders(): Promise<ReminderResult[]> {
  const now = new Date();
  const results: ReminderResult[] = [];

  const [sevenDay, oneDay] = await Promise.all([
    fetchVaultsNeedingReminder("7d", now),
    fetchVaultsNeedingReminder("1d", now),
  ]);

  console.log(`H-7 reminders needed: ${sevenDay.length}`);
  console.log(`H-1 reminders needed: ${oneDay.length}`);

  for (const vault of sevenDay) {
    results.push(await sendReminder(vault, "7d"));
  }
  for (const vault of oneDay) {
    results.push(await sendReminder(vault, "1d"));
  }

  return results;
}

async function fetchVaultsNeedingReminder(
  type: ReminderType,
  now: Date
): Promise<ReminderVault[]> {
  const hours = type === "7d" ? 7 * 24 : 24;
  const windowStart = new Date(now.getTime() + (hours - 1) * 3_600_000);
  const windowEnd = new Date(now.getTime() + (hours + 1) * 3_600_000);

  const sentColumn = type === "7d" ? "reminder_7d_sent_at" : "reminder_1d_sent_at";

  const { data, error } = await supabase
    .from("vaults")
    .select("id, original_filename, deadline_at, user_id")
    .is("released_at", null)
    .is(sentColumn, null)
    .gte("deadline_at", windowStart.toISOString())
    .lte("deadline_at", windowEnd.toISOString());

  if (error) throw error;
  return (data ?? []) as ReminderVault[];
}

async function sendReminder(
  vault: ReminderVault,
  type: ReminderType
): Promise<ReminderResult> {
  try {
    const userEmail = await getUserEmail(vault.user_id);
    if (!userEmail) {
      throw new Error(`No email found for user ${vault.user_id}`);
    }

    await sendReminderEmail(vault, type, userEmail);

    const sentColumn = type === "7d" ? "reminder_7d_sent_at" : "reminder_1d_sent_at";
    const { error: updateError } = await supabase
      .from("vaults")
      .update({ [sentColumn]: new Date().toISOString() })
      .eq("id", vault.id);

    if (updateError) throw updateError;

    await logEvent(vault.id, "reminder_sent", { type });

    console.log(`H-${type} reminder sent for vault ${vault.id} to ${userEmail}`);
    return { vaultId: vault.id, reminderType: type, success: true };

  } catch (err) {
    console.error(`Failed to send H-${type} reminder for vault ${vault.id}:`, err);
    return { vaultId: vault.id, reminderType: type, success: false, error: String(err) };
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}

async function sendReminderEmail(
  vault: ReminderVault,
  type: ReminderType,
  toEmail: string
): Promise<void> {
  const dashboardUrl = `${APP_URL}/dashboard.html`;
  const deadline = new Date(vault.deadline_at);
  const label = type === "7d" ? "7 hari" : "1 hari";
  const urgency = type === "1d" ? "PENTING: " : "";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY!,
    },
    body: JSON.stringify({
      sender: { name: "Titipan", email: BREVO_SENDER! },
      to: [{ email: toEmail }],
      subject: type === "7d"
        ? `"${vault.original_filename}" - deadline dalam 7 hari`
        : `PENTING: "${vault.original_filename}" - deadline besok`,
      reply_to: { email: BREVO_SENDER!, name: "Titipan" },
      htmlContent: buildReminderHtml(vault, type, deadline, dashboardUrl),
      textContent: buildReminderText(vault, type, deadline, dashboardUrl),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo error ${res.status}: ${body}`);
  }
}

function buildReminderHtml(
  vault: ReminderVault,
  type: ReminderType,
  deadline: Date,
  dashboardUrl: string
): string {
  const label = type === "7d" ? "7 hari" : "1 hari";
  const urgency = type === "1d"
    ? `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
         <p style="margin:0;font-size:13px;color:#92400E;font-weight:500;">
            Deadline besok - segera lakukan check-in untuk mencegah file terkirim.
         </p>
       </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <tr><td style="padding-bottom:24px;">
          <span style="font-size:18px;font-weight:700;color:#111827;">Titipan</span>
        </td></tr>

        <tr><td style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:32px;">

          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">
            Check-in diperlukan dalam ${label}
          </p>
          <p style="margin:0 0 20px;font-size:14px;color:#6B7280;line-height:1.6;">
            Salah satu vault kamu memiliki deadline yang akan datang.
            Lakukan check-in untuk memperbarui deadline dan mencegah file dikirim ke recipient.
          </p>

          ${urgency}

          <table width="100%" cellpadding="0" cellspacing="0"
            style="background:#F8F9FA;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;">
              <span style="font-size:12px;color:#6B7280;text-transform:uppercase;">File</span><br/>
              <span style="font-size:14px;font-weight:500;color:#111827;font-family:monospace;">
                ${escHtml(vault.original_filename)}
              </span>
            </td></tr>
            <tr><td style="padding:12px 16px;">
              <span style="font-size:12px;color:#6B7280;text-transform:uppercase;">Deadline</span><br/>
              <span style="font-size:14px;font-weight:500;color:#111827;">
                ${deadline.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric",
    month: "long", year: "numeric",
  })}
              </span>
            </td></tr>
          </table>

          <a href="${dashboardUrl}"
            style="display:block;text-align:center;background:#1D4ED8;color:#fff;
                   text-decoration:none;padding:12px 24px;border-radius:8px;
                   font-size:14px;font-weight:600;">
            Buka Dashboard &amp; Check In
          </a>

        </td></tr>

        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
            Jika kamu tidak melakukan check-in sebelum deadline,<br/>
            file akan otomatis dikirim ke recipient yang telah kamu tentukan.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

function buildReminderText(
  vault: ReminderVault,
  type: ReminderType,
  deadline: Date,
  dashboardUrl: string
): string {
  const label = type === "7d" ? "7 hari" : "1 hari";
  return `
Check-in diperlukan dalam ${label} - Titipan

File: ${vault.original_filename}
Deadline: ${deadline.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}

Lakukan check-in sekarang: ${dashboardUrl}

Jika kamu tidak check-in sebelum deadline, file akan otomatis dikirim ke recipient.
  `.trim();
}

async function logEvent(
  vaultId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("audit_logs")
    .insert({ vault_id: vaultId, event_type: eventType, metadata: metadata ?? null });

  if (error) console.warn(`audit log failed [${eventType}]:`, error.message);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function cors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(res.body, { status: res.status, headers: h });
}
