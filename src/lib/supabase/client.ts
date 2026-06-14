import { createBrowserClient } from "@supabase/ssr";

// Client-side helper to read document cookies synchronously
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(";").shift() ?? "");
  return null;
}

// Deterministic UUID generator to map Firebase string UID -> valid Postgres UUID
export function deterministicUuid(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  const hex = ((h1 >>> 0).toString(16).padStart(8, '0') + 
               (h2 >>> 0).toString(16).padStart(8, '0') + 
               ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0') + 
               ((h1 + h2) >>> 0).toString(16).padStart(8, '0')).slice(0, 32);
               
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function createClient() {
  const client = await createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const firebaseUid = getCookie("firebase_uid");
  const firebaseEmail = getCookie("firebase_email");
  const firebaseDisplayName = getCookie("firebase_display_name");

  if (firebaseUid) {
    const uuid = deterministicUuid(firebaseUid);
    const user = {
      id: uuid,
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

