import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") ?? "http://localhost:5173";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  try {
    const { vaultId, token } = await req.json();
    if (!vaultId) {
      return cors(error("vaultId wajib diisi", 400));
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("vault_id", vaultId)
      .eq("event_type", "verify_opened")
      .gte("created_at", windowStart);

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return cors(error("Terlalu banyak permintaan. Coba lagi nanti.", 429));
    }

    const { data: vault, error: vaultError } = await supabase
      .from("vaults")
      .select("id, original_filename, enc_filename, filename_iv, kdf_iterations, release_token, mime_type, released_at, wrapped_file_key, wrap_iv, file_iv, salt, storage_object_key")
      .eq("id", vaultId)
      .single();

    if (vaultError || !vault || !tokenMatches(token, vault.release_token)) {
      return cors(error("Vault tidak ditemukan", 404));
    }

    if (!vault.released_at) {
      return cors(json({
        id: vault.id,
        original_filename: vault.original_filename,
        mime_type: vault.mime_type,
        released_at: null
      }));
    }

    await supabase.from("audit_logs").insert({
      vault_id: vault.id,
      event_type: "verify_opened",
      metadata: null
    });

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("vaults")
      .createSignedUrl(vault.storage_object_key, 900);

    if (signedUrlError || !signedUrlData) {
      throw signedUrlError ?? new Error("Failed to generate signed URL");
    }

    const { release_token: _withheld, ...safeVault } = vault;

    return cors(json({
      ...safeVault,
      signed_url: signedUrlData.signedUrl
    }));

  } catch (err) {
    console.error("verify-vault error:", err);
    return cors(error("Internal server error", 500));
  }
});

function tokenMatches(provided: unknown, stored: string | null): boolean {
  if (!stored) return true;
  if (typeof provided !== "string" || provided.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) {
    diff |= provided.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}

function json(data: unknown, status = 200): Response {  return new Response(JSON.stringify(data), {
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
