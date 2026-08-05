import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApi } from "./useApi";
import type { ChatMessage, Conversation } from "../lib/types";

/**
 * Core chat state shared by the full assistant page and the floating bubble,
 * so the send/optimistic-update/rollback logic only exists once.
 */
export const useAssistantChat = () => {
  const status = useApi(
    (signal) =>
      api<{ data: { enabled: boolean; message: string | null } }>("/assistant/status", { signal }),
    [],
  );

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openConversation = async (id: string) => {
    setError(null);
    try {
      const res = await api<{ data: Conversation }>(`/assistant/conversations/${id}`);
      setConversationId(id);
      setMessages(res.data.messages ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open that conversation.");
    }
  };

  const startNew = () => {
    setConversationId(null);
    setMessages([]);
    setError(null);
  };

  const send = async (text: string, onSent?: () => void) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    setError(null);

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "USER",
      content: trimmed,
      toolsUsed: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setThinking(true);

    try {
      const res = await api<{ data: { conversationId: string; message: ChatMessage } }>(
        "/assistant/ask",
        { method: "POST", body: { question: trimmed, conversationId } },
      );
      setConversationId(res.data.conversationId);
      setMessages((m) => [...m, res.data.message]);
      onSent?.();
    } catch (err) {
      // Roll the optimistic bubble back so the failed question isn't left hanging.
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      setError(err instanceof ApiError ? err.message : "Could not reach the assistant.");
    } finally {
      setThinking(false);
    }
  };

  return {
    enabled: status.data?.data.enabled ?? null,
    statusMessage: status.data?.data.message ?? null,
    statusLoading: status.loading,
    conversationId,
    messages,
    thinking,
    error,
    send,
    startNew,
    openConversation,
  };
};

export type AssistantChat = ReturnType<typeof useAssistantChat>;
