import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ForgotPasswordPage", () => {
  it("shows the generic confirmation message after a successful submit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "If an account exists for that email, a password reset link has been sent." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), "admin@church.local");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/reset link is on its way/i)).toBeInTheDocument();
    });

    // The request went to the forgot-password endpoint with the typed email.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/auth/forgot-password");
    expect(JSON.parse(init.body)).toEqual({ email: "admin@church.local" });
  });

  it("shows an error message when the request is rate-limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many reset requests. Try again in 15 minutes." }),
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), "admin@church.local");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many reset requests/i)).toBeInTheDocument();
    });
  });
});
