import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AuthCallback() {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/groups");
  } else {
    redirect("/login");
  }
}
