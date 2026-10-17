import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Maximize2, Sparkles, X } from "lucide-react";
import { useAssistantChat } from "../hooks/useAssistantChat";
import { useAuth } from "../context/AuthContext";
import { getSuggestions, TOOL_LABELS } from "../lib/assistantSuggestions";
import { ChatBubble, Spinner, ThinkingBubble } from "./ui";

/**
 * A quick-question chat bubble mounted once in the shared Layout, so it's
 * available on every authenticated page without navigating away. Deliberately
 * lighter than the full /assistant page — no conversation history browser,
 * just "ask a thing, get an answer" with a link across for the full view.
 */
export const FloatingAssistant = () => {
  const chat = useAssistantChat();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const suggestions = getSuggestions(location.pathname, can("FINANCE"));

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking, open]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuestion("");
    void chat.send(trimmed);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-xl shadow-slate-900/10 sm:w-96">
          <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div>
              <p className="font-display text-sm font-semibold text-slate-900">AI Assistant</p>
              <p className="text-xs text-slate-500">Ask about your data</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate("/assistant")}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                title="Open full page"
              >
                <Maximize2 size={14} />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          {chat.statusLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Checking" />
            </div>
          ) : chat.enabled === false ? (
            <div className="flex flex-1 items-center justify-center px-5 text-center">
              <p className="text-sm text-slate-500">{chat.statusMessage}</p>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {chat.messages.length === 0 && !chat.thinking && (
                  <div className="pt-3">
                    <p className="text-center text-sm text-slate-500">Try asking:</p>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => submit(s)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs leading-snug text-slate-700 transition hover:border-brand-300 hover:bg-brand-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chat.messages.map((m) => (
                  <ChatBubble key={m.id} message={m} toolLabel={(t) => TOOL_LABELS[t] ?? t} compact />
                ))}

                {chat.thinking && <ThinkingBubble label="Looking that up…" compact />}

                {chat.error && <p className="text-xs text-red-600">{chat.error}</p>}
                <div ref={endRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(question);
                }}
                className="flex shrink-0 gap-2 border-t border-slate-100 p-3"
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question…"
                  disabled={chat.thinking}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={chat.thinking || !question.trim()}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Ask
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-600/30 transition hover:from-brand-700 hover:to-brand-800"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </div>
  );
};
