import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditLogPage } from "./AuditLogPage";

const mockFetchRouter = (routes: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    const match = Object.entries(routes).find(([path]) => url.includes(path));
    if (!match) throw new Error(`No mock route for ${url}`);
    return { ok: true, status: 200, json: async () => match[1] };
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseRow = {
  id: "log1",
  action: "CREATE",
  entity: "Fund",
  entityId: "f1",
  summary: "Missions Fund",
  ipAddress: "127.0.0.1",
  createdAt: "2026-10-01T10:00:00.000Z",
  user: { id: "u1", name: "Finance User", email: "finance@church.local" },
};

describe("AuditLogPage", () => {
  it("renders audit log rows with who, action and entity", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRouter({
        "/audit-logs/entities": { data: ["Fund", "Member"] },
        "/audit-logs": { data: [baseRow], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } },
      }),
    );

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText("Finance User")).toBeInTheDocument();
    });
    expect(screen.getByText("Missions Fund")).toBeInTheDocument();
    expect(screen.getByText("CREATE")).toBeInTheDocument();
  });

  it("shows an empty state when no entries match the filters", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRouter({
        "/audit-logs/entities": { data: ["Fund"] },
        "/audit-logs": { data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 } },
      }),
    );

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText(/no matching audit log entries/i)).toBeInTheDocument();
    });
  });

  it("re-fetches with the entity filter applied when it changes", async () => {
    const fetchMock = mockFetchRouter({
      "/audit-logs/entities": { data: ["Fund", "Member"] },
      "/audit-logs": { data: [baseRow], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuditLogPage />);
    const user = userEvent.setup();

    await screen.findByText("Finance User");

    await user.selectOptions(screen.getByDisplayValue(/all entities/i), "Fund");

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("entity=Fund"));
      expect(call).toBeTruthy();
    });
  });
});
