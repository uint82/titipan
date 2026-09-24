import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RP_ID = Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost";
const RP_NAME = Deno.env.get("WEBAUTHN_RP_NAME") ?? "Deadman Vault";
const ALLOWED_ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") ?? "http://localhost:5173";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }

  try {
    const { email, type } = await req.json();

    if (!email || !type) {
      return cors(error("email dan tipe wajib diisi", 400));
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return cors(error("Format email tidak valid", 400));
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from("webauthn_challenges")
      .select("*", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", windowStart);

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return cors(error("Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.", 429));
    }

    supabase
      .from("webauthn_challenges")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .then(() => { });

    const rawChallenge = crypto.getRandomValues(new Uint8Array(32));
    const challenge = toBase64url(rawChallenge);

    const { error: insertError } = await supabase
      .from("webauthn_challenges")
      .insert({
        challenge,
        email,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

    if (insertError) throw insertError;

    if (type === "registration") {
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

      return cors(json({
        challenge,
        userId: toBase64url(uuidToBytes(user.id)),
        rpId: RP_ID,
        rpName: RP_NAME,
      }));
    }

    if (type === "authentication") {
      const credentialIds = await getCredentialIds(email);

      return cors(json({ challenge, credentialIds, rpId: RP_ID }));
    }

    return cors(error("tipe harus registration atau authentication", 400));

  } catch (err) {
    console.error("auth-challenge error:", err);
    return cors(error(String(err), 500));
  }
});



async function getCredentialIds(email: string): Promise<string[]> {
  const normalized = email.toLowerCase();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return [];
    const user = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (user) {
      const { data: keys } = await supabase
        .from("passkeys")
        .select("id")
        .eq("user_id", user.id);
      return (keys ?? []).map((row: { id: string }) => row.id);
    }
    if (data.users.length < perPage) return [];
    if (++page > 100) return [];
  }
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
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
