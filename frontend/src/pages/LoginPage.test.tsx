import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { LoginPage } from "./LoginPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("LoginPage", () => {
  it("signs in with the typed credentials and stores the returned token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: "test-token-123",
        user: { id: "u1", email: "admin@church.local", name: "Admin", role: "ADMIN", memberId: null },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.queryByText(/checking your session/i)).not.toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), "admin@church.local");
    await user.type(screen.getByLabelText(/password/i), "ChangeMe123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(localStorage.getItem("cms.token")).toBe("test-token-123"));

    const loginCall = fetchMock.mock.calls.find((call: unknown[]) => String(call[0]).includes("/auth/login"));
    expect(loginCall).toBeTruthy();
    expect(JSON.parse(loginCall![1].body)).toEqual({
      email: "admin@church.local",
      password: "ChangeMe123!",
    });
  });

  it("shows an error message for invalid credentials and does not store a token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid email or password" }),
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.queryByText(/checking your session/i)).not.toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), "admin@church.local");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
    expect(localStorage.getItem("cms.token")).toBeNull();
  });
});
