"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default async function RemoveMemberButton({
  groupId,
  userId,
}: {
  groupId: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = await createClient();

  async function handleRemove() {
    if (!confirm("Remove this member from the group?")) return;
    await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    router.refresh();
  }

  return (
    <button onClick={handleRemove} className="text-xs text-destructive hover:underline">
      Remove
    </button>
  );
}
