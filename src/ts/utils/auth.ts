import { supabase } from "./supabase";

export type AppUser = {
  id: string;
  email: string;
};

export async function getUser(): Promise<AppUser | null> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? "" };
}

export async function setSession(
  accessToken: string,
  refreshToken: string
): Promise<AppUser> {
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error || !data.user) throw error ?? new Error("setSession failed");

  return {
    id: data.user.id,
    email: data.user.email ?? "",
  };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function onAuthChange(
  callback: (user: AppUser | null) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      callback({ id: session.user.id, email: session.user.email ?? "" });
    } else {
      callback(null);
    }
  });

  return () => data.subscription.unsubscribe();
}
