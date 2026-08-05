import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { env, assistantEnabled } from "../../config/env";
import type { AuthedUser } from "../../middleware/auth";
import { runTool, toolDefinitions } from "./tools";

const client = assistantEnabled ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

/**
 * Groq's free tier is a shared, account-wide budget (not per user), so these
 * are deliberately tight: most questions here resolve in 1-2 real API calls
 * (decide tool -> read result -> answer), and a short cap keeps a runaway
 * loop from burning through the daily quota on its own.
 */
const MAX_TURNS = 4;
const MAX_ANSWER_TOKENS = 600;

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
      "The AI assistant is not configured. Add GROQ_API_KEY to backend/.env and restart the server.",
    );
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(user) },
    // Only the last few turns — the free tier is billed on total tokens per
    // request, and this is a short-answer Q&A tool, not a long conversation.
    ...history.slice(-6).map(
      (m): ChatCompletionMessageParam => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      }),
    ),
    { role: "user", content: question },
  ];

  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.chat.completions.create({
      model: env.GROQ_MODEL,
      max_completion_tokens: MAX_ANSWER_TOKENS,
      temperature: 0.3,
      tools: toolDefinitions,
      tool_choice: "auto",
      messages,
    });

    const choice = response.choices[0];
    if (!choice) {
      return { text: "The assistant did not return a response. Try again.", toolsUsed };
    }

    const toolCalls = choice.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      const text = choice.message.content?.trim();
      return {
        text: text || "I could not produce an answer for that. Try asking a different way.",
        toolsUsed,
      };
    }

    messages.push(choice.message);

    const results = await Promise.all(
      toolCalls.map(async (call) => {
        toolsUsed.push(call.function.name);
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          const result = await runTool(call.function.name, args, user);
          return {
            role: "tool" as const,
            tool_call_id: call.id,
            content: JSON.stringify(result),
          };
        } catch (err) {
          console.error(`[assistant] tool ${call.function.name} failed:`, err);
          return {
            role: "tool" as const,
            tool_call_id: call.id,
            content: "The query failed. Tell the user the data could not be retrieved.",
          };
        }
      }),
    );

    messages.push(...results);
  }

  return {
    text: "That question needed more lookups than I'm allowed to make in one go. Try narrowing it down.",
    toolsUsed,
  };
};

/** First user message becomes the conversation title in the sidebar. */
export const titleFrom = (question: string) =>
  question.length <= 60 ? question : `${question.slice(0, 57)}...`;
