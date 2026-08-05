import Anthropic from "@anthropic-ai/sdk";
import { env, assistantEnabled } from "../../config/env";
import type { AuthedUser } from "../../middleware/auth";
import { runTool, toolDefinitions } from "./tools";

const client = assistantEnabled ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

/** Guards against a tool loop that never converges. */
const MAX_TURNS = 8;

const systemPrompt = (user: AuthedUser) => `
You are the assistant inside a Church Management System. You help church staff
answer questions about their congregation by querying the system's data.

The person you are talking to:
- Name: ${user.name}
- Role: ${user.role}

Role meanings:
- ADMIN — full access to everything.
- FINANCE — may see contributions and giving data.
- DEPT_HEAD — may see members, attendance, events and volunteer rotas, but NOT giving data.
- VIEWER — read-only access to members, attendance and events; NOT giving data.

Answer from the tools, not from memory. If a tool returns no rows, say the data
is not in the system rather than guessing or inventing plausible-looking numbers.
If a tool returns an access-denied error, tell the person their role does not
permit that information and move on — do not try a different tool to work around it.

Currency is Zambian Kwacha (ZMW); write amounts as "ZMW 1,234.00".
Today is ${new Date().toISOString().slice(0, 10)}.

Keep answers short and concrete. Lead with the number or the name the person
asked for, then any context that changes what they would do next. Use a short
list when you are naming several people; use prose otherwise. Do not restate the
question back to them, and do not describe which tools you called.

You can read data but you cannot change it. If asked to add, edit or delete
anything, explain which page of the app does that instead.
`.trim();

export interface AssistantReply {
  text: string;
  toolsUsed: string[];
}

export const askAssistant = async (
  user: AuthedUser,
  history: { role: "USER" | "ASSISTANT"; content: string }[],
  question: string,
): Promise<AssistantReply> => {
  if (!client) {
    throw new Error(
      "The AI assistant is not configured. Add ANTHROPIC_API_KEY to backend/.env and restart the server.",
    );
  }

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 4096,
      // Effort low keeps this snappy for a chat box. Thinking stays on (the
      // default): disabling it can make the model emit a tool call as plain
      // text, which would silently never run.
      output_config: { effort: "low" },
      system: systemPrompt(user),
      tools: toolDefinitions,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return {
        text: "I can't help with that request. Try rephrasing, or ask about members, attendance, giving, or the volunteer schedule.",
        toolsUsed,
      };
    }

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return {
        text: text || "I could not produce an answer for that. Try asking a different way.",
        toolsUsed,
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (call) => {
        toolsUsed.push(call.name);
        try {
          const result = await runTool(call.name, call.input as Record<string, unknown>, user);
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: JSON.stringify(result),
          };
        } catch (err) {
          console.error(`[assistant] tool ${call.name} failed:`, err);
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: "The query failed. Tell the user the data could not be retrieved.",
            is_error: true,
          };
        }
      }),
    );

    messages.push({ role: "user", content: results });
  }

  return {
    text: "That question needed more lookups than I'm allowed to make in one go. Try narrowing it down.",
    toolsUsed,
  };
};

/** First user message becomes the conversation title in the sidebar. */
export const titleFrom = (question: string) =>
  question.length <= 60 ? question : `${question.slice(0, 57)}...`;
