import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

import { setSession } from "./auth";
import type { AppUser } from "./auth";
import { supabase } from "./supabase";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function fnHeaders(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token ?? ANON_KEY}`,
  };
}

export async function registerPasskey(email: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Must be logged in to register a passkey");

  const challengeRes = await fetch(`${FUNCTIONS_URL}/auth-challenge`, {
    method: "POST",
    headers: fnHeaders(session.access_token),
    body: JSON.stringify({ email, type: "registration" }),
  });

  if (!challengeRes.ok) {
    const err = await challengeRes.json();
    throw new Error(err.error ?? "Failed to get challenge");
  }

  const { challenge, userId, rpId, rpName } = await challengeRes.json();

  const credential = await startRegistration({
    optionsJSON: {
      challenge,
      rp: { id: rpId, name: rpName },
      user: {
        id: userId,
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },  // ES256
        { alg: -257, type: "public-key" },  // fallack ke RS256
      ],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        // no authenticatorAttachment - (nggk bekerja di linux harus pake chrome dan simulasi webauth)
      },
      timeout: 60_000,
      attestation: "none",
    },
  });

  const registerRes = await fetch(`${FUNCTIONS_URL}/auth-register`, {
    method: "POST",
    headers: fnHeaders(session.access_token),
    body: JSON.stringify({ email, challenge, credential }),
  });

  if (!registerRes.ok) {
    const err = await registerRes.json();
    throw new Error(err.error ?? "Registration verification failed");
  }
}

export async function authenticatePasskey(email: string): Promise<AppUser> {
  const challengeRes = await fetch(`${FUNCTIONS_URL}/auth-challenge`, {
    method: "POST",
    headers: fnHeaders(),
    body: JSON.stringify({ email, type: "authentication" }),
  });

  if (!challengeRes.ok) {
    const err = await challengeRes.json();
    throw new Error(err.error ?? "Failed to get challenge");
  }

  const { challenge, credentialIds, rpId } = await challengeRes.json();

  if (!Array.isArray(credentialIds) || credentialIds.length === 0) {
    throw new Error("NO_PASSKEY");
  }

  const assertion = await startAuthentication({
    optionsJSON: {
      challenge,
      rpId,
      allowCredentials: credentialIds.map((id: string) => ({
        id,
        type: "public-key",
      })),
      userVerification: "preferred",
      timeout: 60_000,
    },
  });

  const loginRes = await fetch(`${FUNCTIONS_URL}/auth-login`, {
    method: "POST",
    headers: fnHeaders(),
    body: JSON.stringify({ email, challenge, assertion }),
  });

  if (!loginRes.ok) {
    const err = await loginRes.json();
    throw new Error(err.error ?? "Authentication failed");
  }

  const { accessToken, refreshToken } = await loginRes.json();
  return setSession(accessToken, refreshToken);
}

export async function isPasskeySupported(): Promise<boolean> {
  return typeof window.PublicKeyCredential !== "undefined";
}
