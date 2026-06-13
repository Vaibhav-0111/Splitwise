import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // called from a Server Component — safe to ignore
            // because middleware refreshes the session.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // ignore, see above
          }
        },
      },
    }
  );

  const firebaseUid = cookieStore.get("firebase_uid")?.value;
  const firebaseEmail = cookieStore.get("firebase_email")?.value ?? null;
  const firebaseDisplayName = cookieStore.get("firebase_display_name")?.value ?? null;

  if (firebaseUid) {
    const user = {
      id: firebaseUid,
      email: firebaseEmail,
      user_metadata: {
        display_name: firebaseDisplayName,
      },
    };

    (client.auth as any).getUser = async () => ({
      data: { user },
      error: null,
    });

    (client.auth as any).getSession = async () => ({
      data: {
        session: {
          user,
        },
      },
      error: null,
    });
  }

  return client;
}
