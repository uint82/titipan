import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRegistrationResponse } from "https://esm.sh/@simplewebauthn/server@13";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RP_ID = Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost";
const EXPECTED_ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") ?? "http://localhost:5173";
const ALLOWED_ORIGIN = EXPECTED_ORIGIN;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  try {
    const { email, challenge, credential } = await req.json();
    if (!email || !challenge || !credential) {
      return cors(error("email, challenge, dan credential wajib diisi", 400));
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return cors(error("Sesi tidak ditemukan. Masuk dulu.", 401));

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return cors(error("Sesi tidak valid atau kedaluwarsa. Masuk dulu.", 401));
    }

    if (user.email !== email) {
      return cors(error("Email tidak cocok", 403));
    }

    const valid = await consumeChallenge(challenge, email);
    if (!valid) return cors(error("Challenge tidak valid atau kedaluwarsa", 400));

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return cors(error("Verifikasi kredensial gagal", 400));
    }

    const { credential: verifiedCredential } = verification.registrationInfo;

    const { error: insertError } = await supabase
      .from("passkeys")
      .insert({
        id: verifiedCredential.id,
        user_id: user.id,
        public_key: toBase64url(verifiedCredential.publicKey),
        counter: verifiedCredential.counter,
        device_name: `Passkey ${verifiedCredential.id.slice(0, 8)}`,
      });

    if (insertError) throw insertError;

    return cors(json({ success: true }));

  } catch (err) {
    console.error("auth-register error:", err);
    return cors(error(String(err), 500));
  }
});

async function consumeChallenge(challenge: string, email: string): Promise<boolean> {
  const { data } = await supabase
    .from("webauthn_challenges")
    .select("id, used, expires_at")
    .eq("challenge", challenge)
    .eq("email", email)
    .single();

  if (!data || data.used || new Date(data.expires_at) < new Date()) return false;

  await supabase
    .from("webauthn_challenges")
    .update({ used: true })
    .eq("id", data.id);

  return true;
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function cors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(res.body, { status: res.status, headers });
}
