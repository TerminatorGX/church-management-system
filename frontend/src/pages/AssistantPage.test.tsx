import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { AssistantPage } from "./AssistantPage";

/** Routes each fetch call to a canned JSON response by matching the URL. */
const mockFetchRouter = (routes: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    const match = Object.entries(routes).find(([path]) => url.includes(path));
    if (!match) throw new Error(`No mock route for ${url}`);
    return { ok: true, status: 200, json: async () => match[1] };
  });

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <AssistantPage />
      </AuthProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AssistantPage", () => {
  it("shows a message explaining the assistant is off when disabled", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRouter({
        "/assistant/status": { data: { enabled: false, message: "Set GROQ_API_KEY to enable this." } },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/assistant is switched off/i)).toBeInTheDocument();
    });
  });

  it("sends a question and renders the reply as a chat bubble with its sources", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRouter({
        "/assistant/status": { data: { enabled: true, message: null } },
        "/assistant/conversations/": { data: { id: "c1", title: "Q", messages: [] } },
        "/assistant/conversations": { data: [] },
        "/assistant/ask": {
          data: {
            conversationId: "c1",
            message: {
              id: "m1",
              role: "ASSISTANT",
              content: "104 active members.",
              toolsUsed: ["get_church_overview"],
              createdAt: new Date().toISOString(),
            },
          },
        },
      }),
    );

    renderPage();
    const user = userEvent.setup();

    const input = await screen.findByPlaceholderText(/ask about members/i);
    await user.type(input, "How many active members do we have?");
    await user.click(screen.getByRole("button", { name: /^ask$/i }));

    await waitFor(() => {
      expect(screen.getByText("104 active members.")).toBeInTheDocument();
    });
    expect(screen.getByText(/checked: church overview/i)).toBeInTheDocument();
    // The question itself renders as the user's own bubble.
    expect(screen.getByText("How many active members do we have?")).toBeInTheDocument();
  });
});
