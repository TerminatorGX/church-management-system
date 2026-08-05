import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtRelative } from "../lib/format";
import { Button, Card, ErrorBox, Input, PageHeader, Spinner } from "../components/ui";
import type { ChatMessage, Conversation } from "../lib/types";

const SUGGESTIONS = [
  "How has attendance changed over the last three months?",
  "Who hasn't been to church recently and needs a follow-up call?",
  "Which volunteer slots are still unfilled for the next service?",
  "Who in the congregation can play keyboard or sing?",
];

const TOOL_LABELS: Record<string, string> = {
  search_members: "member directory",
  get_attendance_summary: "attendance records",
  get_giving_summary: "giving ledger",
  get_upcoming_schedule: "volunteer schedule",
  find_members_needing_follow_up: "follow-up list",
  get_church_overview: "church overview",
};

export const AssistantPage = () => {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const status = useApi(
    (signal) =>
      api<{ data: { enabled: boolean; message: string | null } }>("/assistant/status", { signal }),
    [],
  );

  const conversations = useApi(
    (signal) => api<{ data: Conversation[] }>("/assistant/conversations", { signal }),
    [],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

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

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    setError(null);
    setQuestion("");

    // Optimistic user bubble so the question appears immediately.
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
      conversations.reload();
    } catch (err) {
      // Roll the optimistic bubble back so the failed question isn't left hanging.
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      setQuestion(trimmed);
      setError(err instanceof ApiError ? err.message : "Could not reach the assistant.");
    } finally {
      setThinking(false);
    }
  };

  if (status.loading) return <Spinner label="Checking the assistant" />;

  if (status.data && !status.data.data.enabled) {
    return (
      <>
        <PageHeader title="AI Assistant" />
        <Card>
          <div className="py-8 text-center">
            <p className="font-medium text-slate-800">The assistant is switched off</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              {status.data.data.message}
            </p>
            <p className="mx-auto mt-4 max-w-md rounded-lg bg-slate-50 px-4 py-3 text-left font-mono text-xs text-slate-600">
              ANTHROPIC_API_KEY="sk-ant-..."
            </p>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AI Assistant"
        subtitle="Ask questions about your congregation. Answers come from your own data, scoped to your role."
        actions={<Button variant="secondary" onClick={startNew}>New conversation</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Card title="History" className="h-fit">
          {conversations.loading && <Spinner label="Loading" />}
          {conversations.data?.data.length === 0 && (
            <p className="text-sm text-slate-500">No conversations yet.</p>
          )}
          <ul className="space-y-1">
            {conversations.data?.data.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => openConversation(c.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    c.id === conversationId
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="line-clamp-2">{c.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {fmtRelative(c.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex min-h-[32rem] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto">
            {messages.length === 0 && !thinking && (
              <div className="py-8 text-center">
                <p className="font-medium text-slate-800">
                  Hello {user?.name.split(" ")[0]} — what would you like to know?
                </p>
                <p className="mt-1 text-sm text-slate-500">Try one of these:</p>
                <div className="mx-auto mt-4 grid max-w-lg gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-lg border border-slate-200 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    m.role === "USER"
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                  {m.role === "ASSISTANT" && m.toolsUsed.length > 0 && (
                    <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
                      Checked: {m.toolsUsed.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
                  Looking through your records…
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {error && (
            <div className="mt-4">
              <ErrorBox message={error} />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(question);
            }}
            className="mt-4 flex gap-2 border-t border-slate-100 pt-4"
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about members, attendance, giving or the rota…"
              disabled={thinking}
            />
            <Button type="submit" disabled={thinking || !question.trim()}>
              Ask
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
};
