"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteExpenseButton({
  expenseId,
  groupId,
}: {
  expenseId: string;
  groupId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (!error) {
      router.push(`/groups/${groupId}`);
      router.refresh();
    } else {
      alert(error.message);
    }
  }

  return (
    <button onClick={handleDelete} className="text-sm text-destructive hover:underline">
      Delete expense
    </button>
  );
}
