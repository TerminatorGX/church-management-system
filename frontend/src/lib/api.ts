const BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "cms.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Set by AuthProvider so a 401 anywhere drops the session instead of looping. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

const buildUrl = (path: string, query?: RequestOptions["query"]) => {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
};

export const api = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const token = tokenStore.get();

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  // A 401 from the login endpoint itself means "wrong credentials", not an
  // expired session — let it fall through to the generic error handling
  // below so the server's actual message reaches the user.
  if (response.status === 401 && path !== "/auth/login") {
    tokenStore.clear();
    onUnauthorized?.();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let details: { field: string; message: string }[] | undefined;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
      if (Array.isArray(payload?.details)) details = payload.details;
    } catch {
      // Non-JSON error body (proxy error page, gateway timeout) — keep the default.
    }
    throw new ApiError(response.status, message, details);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

/** Downloads any file export (CSV, PDF, ...) with the auth header attached. */
export const downloadFile = async (
  path: string,
  query?: RequestOptions["query"],
  fallbackName = "export",
) => {
  const token = tokenStore.get();
  const response = await fetch(buildUrl(path, query), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, "Export failed");

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
