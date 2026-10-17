import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

const toDate = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : null;
};

export const fmtDate = (value: string | Date | null | undefined, fallback = "—") => {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy") : fallback;
};

export const fmtDateTime = (value: string | Date | null | undefined, fallback = "—") => {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy, HH:mm") : fallback;
};

export const fmtRelative = (value: string | Date | null | undefined, fallback = "—") => {
  const d = toDate(value);
  return d ? `${formatDistanceToNow(d)} ago` : fallback;
};

/** For <input type="date"> values. */
export const toDateInput = (value: string | Date | null | undefined) => {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
};

/** For <input type="datetime-local"> values. */
export const toDateTimeInput = (value: string | Date | null | undefined) => {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
};

const money = new Intl.NumberFormat("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMoney = (value: string | number | null | undefined, currency = "ZMW") => {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  return `${currency} ${money.format(n)}`;
};

/** Compact form for chart axes and tiles: 12.4k, 1.2M. */
export const fmtCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
};

export const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/**
 * Reformats a typed name on blur so it displays the same way it'll be saved
 * ("JOHN" / "john" -> "John") — the backend applies the same normalisation
 * (see `backend/src/lib/validators.ts`) as the actual source of truth; this
 * is just instant visual feedback instead of a reformat-on-reload surprise.
 */
export const titleCaseName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());

export const initials = (first: string, last: string) =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

export const fullName = (m: { firstName: string; lastName: string }) =>
  `${m.firstName} ${m.lastName}`;
