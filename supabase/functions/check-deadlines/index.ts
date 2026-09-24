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

const missingSecrets = [
  !SUPABASE_URL && "SUPABASE_URL",
  !SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  !APP_URL && "APP_URL",
  !BREVO_API_KEY && "BREVO_API_KEY",
  !BREVO_SENDER && "BREVO_SENDER_EMAIL",
  !CRON_SECRET && "CRON_SECRET",
].filter(Boolean);

if (missingSecrets.length > 0) {
  throw new Error(`Missing required secrets: ${missingSecrets.join(", ")}`);
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MAX_VAULTS_PER_RUN = 50;
const EMAIL_MAX_ATTEMPTS = 3;
const EMAIL_RETRY_DELAY_MS = 1_000;

type ExpiredVault = {
  id: string;
  original_filename: string;
  recipient_email: string;
  storage_object_key: string;
};

type ReleaseResult = {
  vaultId: string;
  success: boolean;
  skipped?: boolean;
  emailRetries?: number;
  error?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const authHeader = req.headers.get("Authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return cors(json({ error: "Unauthorized" }, 401));
  }

  try {
    const results = await processExpiredVaults();

    return cors(json({
      processed: results.length,
      released: results.filter(r => r.success && !r.skipped).length,
      skipped: results.filter(r => r.skipped).length,
      failed: results.filter(r => !r.success).length,
      results,
    }));

  } catch (err) {
    console.error("check-deadlines fatal error:", err);
    return cors(json({ error: String(err) }, 500));
  }
});

async function processExpiredVaults(): Promise<ReleaseResult[]> {
  const { data: expired, error } = await supabase
    .from("vaults")
    .select("id, original_filename, recipient_email, storage_object_key")
    .lt("deadline_at", new Date().toISOString())
    .is("released_at", null)
    .not("recipient_email", "is", null)
    .order("deadline_at", { ascending: true })
    .limit(MAX_VAULTS_PER_RUN);

  if (error) throw error;
  if (!expired || expired.length === 0) {
    console.log("No expired vaults found");
    return [];
  }

  console.log(`Found ${expired.length} expired vault(s)`);

  const results: ReleaseResult[] = [];
  for (const vault of expired as ExpiredVault[]) {
    results.push(await releaseVault(vault));
  }
  return results;
}

async function releaseVault(vault: ExpiredVault): Promise<ReleaseResult> {
  let claimed = false;
  try {
    const { data: claimData, error: updateError } = await supabase
      .from("vaults")
      .update({ released_at: new Date().toISOString() })
      .eq("id", vault.id)
      .is("released_at", null)
      .select("id");

    if (updateError) throw updateError;

    if (!claimData || claimData.length === 0) {
      console.log(`Vault ${vault.id} already claimed by another instance, skipping`);
      return { vaultId: vault.id, success: true, skipped: true };
    }
    claimed = true;

    console.log(`Vault ${vault.id} claimed and marked as released`);

    await logEvent(vault.id, "deadline_missed");

    const attempts = await sendWithRetry(vault);

    await logEvent(vault.id, "email_sent", {
      recipient: maskEmail(vault.recipient_email),
    });

    console.log(`Email sent to ${vault.recipient_email} for vault ${vault.id} (attempts: ${attempts})`);
    return { vaultId: vault.id, success: true, emailRetries: attempts - 1 };

  } catch (err) {
    console.error(`Failed to process vault ${vault.id}:`, err);
    // Roll back so the next cron run retries.
    if (claimed) {
      const { error: rollbackError } = await supabase
        .from("vaults")
        .update({ released_at: null })
        .eq("id", vault.id);
      if (rollbackError) {
        console.error(`Rollback failed for vault ${vault.id}:`, rollbackError.message);
      } else {
        console.log(`Rolled back released_at for vault ${vault.id} for retry`);
        await logEvent(vault.id, "release_rollback", { error: String(err) });
      }
    }
    return { vaultId: vault.id, success: false, error: String(err) };
  }
}

async function sendWithRetry(vault: ExpiredVault): Promise<number> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt++) {
    try {
      await sendReleaseEmail(vault);
      return attempt;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `Email attempt ${attempt}/${EMAIL_MAX_ATTEMPTS} failed for vault ${vault.id}: ${lastError.message}`
      );
      if (attempt < EMAIL_MAX_ATTEMPTS) {
        const jitter = Math.random() * 500;
        await sleep(EMAIL_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + jitter);
      }
    }
  }

  throw lastError;
}

async function sendReleaseEmail(vault: ExpiredVault): Promise<void> {
  const decryptUrl = `${APP_URL}/verify.html?vault=${vault.id}`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY!,
    },
    body: JSON.stringify({
      sender: {
        name: "Titipan",
        email: BREVO_SENDER!,
      },
      to: [{ email: vault.recipient_email }],
      subject: `Vault telah dikirimkan kepadamu: ${vault.original_filename}`,
      htmlContent: buildEmailHtml(vault, decryptUrl),
      textContent: buildEmailText(vault, decryptUrl),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo error ${res.status}: ${body}`);
  }
}

async function logEvent(
  vaultId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("audit_logs")
    .insert({
      vault_id: vaultId,
      event_type: eventType,
      metadata: metadata ?? null,
    });

  if (error) console.warn(`audit log failed [${eventType}]:`, error.message);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 5))}@${domain}`;
}

function buildEmailHtml(vault: ExpiredVault, decryptUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <tr>
            <td style="padding-bottom:24px;">
              <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.02em;">
                Titipan
              </span>
            </td>
          </tr>

          <tr>
            <td style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:32px;">

              <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.02em;">
                Vault telah dikirimkan kepadamu
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
                Seseorang menunjukmu sebagai penerima dokumen terenkripsi.
                Batas waktu check-in mereka telah lewat, sehingga vault ini dikirim otomatis.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#F8F9FA;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;">
                    <span style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">File</span><br/>
                    <span style="font-size:14px;font-weight:500;color:#111827;font-family:monospace;">
                      ${escHtml(vault.original_filename)}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Vault ID</span><br/>
                    <span style="font-size:12px;color:#374151;font-family:monospace;">${vault.id}</span>
                  </td>
                </tr>
              </table>

              <a href="${decryptUrl}"
                style="display:block;text-align:center;background:#1D4ED8;color:#FFFFFF;
                       text-decoration:none;padding:12px 24px;border-radius:8px;
                       font-size:14px;font-weight:600;">
                Dekripsi &amp; unduh file
              </a>

            </td>
          </tr>

          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
                Kamu membutuhkan frasa sandi dari pemilik vault untuk mendekripsi file ini.<br/>
                Semua dekripsi terjadi di browsermu - tidak ada kunci yang dikirim ke server.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function buildEmailText(vault: ExpiredVault, decryptUrl: string): string {
  return `
Vault telah dikirimkan kepadamu - Titipan

Seseorang menunjukmu sebagai penerima dokumen terenkripsi.
Batas waktu check-in mereka telah lewat, sehingga vault ini dikirim otomatis.

File: ${vault.original_filename}
Vault ID: ${vault.id}

Dekripsi dan unduh: ${decryptUrl}

Kamu membutuhkan frasa sandi dari pemilik vault untuk mendekripsi file ini.
Semua dekripsi terjadi di browsermu.
  `.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(res.body, { status: res.status, headers: h });
}
