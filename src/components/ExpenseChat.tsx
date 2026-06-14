"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseMessage } from "@/lib/types";

export default async function ExpenseChat({
  expenseId,
  currentUserId,
  initialMessages,
}: {
  expenseId: string;
  currentUserId: string;
  initialMessages: ExpenseMessage[];
}) {
  const supabase = await createClient();
  const [messages, setMessages] = useState<ExpenseMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`expense-${expenseId}-messages`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "expense_messages",
          filter: `expense_id=eq.${expenseId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ExpenseMessage;
          // Fetch the sender's profile for display
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, email, avatar_url")
            .eq("id", newMsg.user_id)
            .single();

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, profiles: profile ?? undefined }];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);

    const { error } = await supabase.from("expense_messages").insert({
      expense_id: expenseId,
      user_id: currentUserId,
      message: trimmed,
    });

    setSending(false);
    if (!error) setText("");
  }

  return (
    <div className="card flex flex-col h-[28rem]">
      <h2 className="font-semibold mb-2">Discussion</h2>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet. Say something!</p>
        )}
        {messages.map((m) => {
          const isMine = m.user_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  isMine ? "bg-primary text-on-primary" : "bg-muted text-foreground"
                }`}
              >
                {!isMine && (
                  <p className="text-xs font-semibold opacity-70 mb-0.5">
                    {m.profiles?.display_name ?? "Unknown"}
                  </p>
                )}
                <p>{m.message}</p>
                <p className={`text-[10px] mt-0.5 ${isMine ? "text-on-primary/70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2 mt-3 pt-3 border-t border-border">
        <input
          className="input"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={sending} className="btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}
