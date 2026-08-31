import { useRef, useState } from "react";
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

  // Bumped whenever the visible conversation changes for a reason other than
  // `send`'s own reply landing, so a reply that arrives after the user has
  // switched away doesn't get attached to whatever's now on screen.
  const requestIdRef = useRef(0);

  const openConversation = async (id: string) => {
    requestIdRef.current++;
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
    requestIdRef.current++;
    setConversationId(null);
    setMessages([]);
    setError(null);
  };

  const send = async (text: string, onSent?: () => void) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const myRequestId = ++requestIdRef.current;
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
      if (requestIdRef.current !== myRequestId) return; // superseded — user switched conversations
      setConversationId(res.data.conversationId);
      setMessages((m) => [...m, res.data.message]);
      onSent?.();
    } catch (err) {
      if (requestIdRef.current !== myRequestId) return;
      // Roll the optimistic bubble back so the failed question isn't left hanging.
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      setError(err instanceof ApiError ? err.message : "Could not reach the assistant.");
    } finally {
      if (requestIdRef.current === myRequestId) setThinking(false);
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
