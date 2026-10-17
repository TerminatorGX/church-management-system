import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAssistantChat } from "../hooks/useAssistantChat";
import { useAuth } from "../context/AuthContext";
import { fmtRelative } from "../lib/format";
import { getSuggestions, TOOL_LABELS } from "../lib/assistantSuggestions";
import { Button, Card, ChatBubble, ErrorBox, Input, PageHeader, Spinner, ThinkingBubble } from "../components/ui";
import type { Conversation } from "../lib/types";

export const AssistantPage = () => {
  const { user, can } = useAuth();
  const chat = useAssistantChat();
  const [question, setQuestion] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = getSuggestions("/", can("FINANCE"));

  const conversations = useApi(
    (signal) => api<{ data: Conversation[] }>("/assistant/conversations", { signal }),
    [],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuestion("");
    void chat.send(trimmed, () => conversations.reload());
  };

  if (chat.statusLoading) return <Spinner label="Checking the assistant" />;

  if (chat.enabled === false) {
    return (
      <>
        <PageHeader title="AI Assistant" />
        <Card>
          <div className="py-8 text-center">
            <p className="font-medium text-slate-800">The assistant is switched off</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{chat.statusMessage}</p>
            <p className="mx-auto mt-4 max-w-md rounded-lg bg-slate-50 px-4 py-3 text-left font-mono text-xs text-slate-600">
              GROQ_API_KEY="gsk_..."
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
        actions={
          <Button variant="secondary" onClick={chat.startNew} disabled={chat.thinking}>
            New conversation
          </Button>
        }
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
                  onClick={() => chat.openConversation(c.id)}
                  disabled={chat.thinking}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    c.id === chat.conversationId
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
            {chat.messages.length === 0 && !chat.thinking && (
              <div className="py-8 text-center">
                <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
                  <Sparkles size={20} />
                </span>
                <p className="font-display font-medium text-slate-800">
                  Hello {user?.name.split(" ")[0]} — what would you like to know?
                </p>
                <p className="mt-1 text-sm text-slate-500">Try one of these:</p>
                <div className="mx-auto mt-4 grid max-w-lg gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="rounded-lg border border-slate-200 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.messages.map((m) => (
              <ChatBubble key={m.id} message={m} toolLabel={(t) => TOOL_LABELS[t] ?? t} />
            ))}

            {chat.thinking && <ThinkingBubble label="Looking through your records…" />}

            <div ref={endRef} />
          </div>

          {chat.error && (
            <div className="mt-4">
              <ErrorBox message={chat.error} />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(question);
            }}
            className="mt-4 flex gap-2 border-t border-slate-100 pt-4"
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about members, attendance, giving or the rota…"
              disabled={chat.thinking}
            />
            <Button type="submit" disabled={chat.thinking || !question.trim()}>
              Ask
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
};
