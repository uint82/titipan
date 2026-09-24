import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@13";

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
    const { email, challenge, assertion } = await req.json();
    if (!email || !challenge || !assertion) {
      return cors(error("email, challenge, dan assertion wajib diisi", 400));
    }

    const valid = await consumeChallenge(challenge, email);
    if (!valid) return cors(error("Challenge tidak valid atau kedaluwarsa", 400));

    const passkey = await getPasskeyByCredentialId(assertion.id);
    if (!passkey) return cors(error("Autentikasi gagal", 401));

    const { data: { user } } = await supabase.auth.admin.getUserById(passkey.user_id);
    if (!user) return cors(error("Autentikasi gagal", 401));
    if (user.email !== email) return cors(error("Autentikasi gagal", 401));

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.id,
        publicKey: fromBase64url(passkey.public_key),
        counter: passkey.counter,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return cors(error("Verifikasi tanda tangan gagal", 401));
    }

    await supabase
      .from("passkeys")
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq("id", passkey.id);

    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({ type: "magiclink", email });

    if (linkError || !linkData) throw linkError ?? new Error("generateLink failed");

    const token_hash = linkData.properties.hashed_token;

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("ANON_KEY")!);
    const { data: sessionData, error: sessionError } =
      await anonClient.auth.verifyOtp({ token_hash, type: "magiclink" });

    if (sessionError || !sessionData.session) {
      throw sessionError ?? new Error("verifyOtp failed");
    }

    return cors(json({
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
    }));

  } catch (err) {
    console.error("auth-login error:", err);
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

async function getPasskeyByCredentialId(credentialId: string) {
  const { data } = await supabase
    .from("passkeys")
    .select("id, public_key, counter, user_id")
    .eq("id", credentialId)
    .single();

  return data ?? null;
}

function fromBase64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
