import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { ChatMessage } from "../lib/types";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// --- Layout ----------------------------------------------------------------

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) => (
  <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Card = ({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cx("rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03]", className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          {title && <h2 className="font-display font-semibold text-slate-900">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
);

/** A dashboard headline tile: icon + label + value + optional trend. */
export const StatCard = ({
  icon,
  label,
  value,
  hint,
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: { value: number; label?: string };
}) => (
  <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
    <div className="flex items-center justify-between">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      {trend && (
        <span
          className={cx(
            "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
            trend.value > 0
              ? "bg-emerald-100 text-emerald-700"
              : trend.value < 0
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600",
          )}
        >
          {trend.value > 0 ? (
            <ArrowUp size={12} strokeWidth={2.5} />
          ) : trend.value < 0 ? (
            <ArrowDown size={12} strokeWidth={2.5} />
          ) : null}
          {Math.abs(trend.value)}%
        </span>
      )}
    </div>
    <p className="mt-4 font-display text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    <p className="mt-0.5 text-sm text-slate-500">{label}</p>
    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
  </div>
);

// --- Feedback --------------------------------------------------------------

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
    <span className="text-sm">{label}…</span>
  </div>
);

export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
    <p>{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="mt-2 font-medium text-red-900 underline">
        Try again
      </button>
    )}
  </div>
);

export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="py-12 text-center">
    <p className="font-medium text-slate-700">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
  </div>
);

export const Badge = ({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-accent-100 text-accent-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-brand-100 text-brand-800",
  } as const;
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
};

/** A pulsing placeholder block for loading states on heavier pages. */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cx("animate-pulse rounded-lg bg-slate-200/70", className)} />
);

// --- Form controls ---------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = ({ variant = "primary", size = "md", className, ...props }: ButtonProps) => {
  const variants = {
    primary:
      "bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 disabled:bg-brand-300 disabled:shadow-none",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  } as const;
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" } as const;

  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-70",
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
};

export const Field = ({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
  </label>
);

const controlClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cx(controlClass, className)} />
);

export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cx(controlClass, className)} />
);

export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} rows={3} className={cx(controlClass, className)} />
);

export const Checkbox = ({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700", className)}>
    <input type="checkbox" {...props} className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
    {label}
  </label>
);

// --- Table -----------------------------------------------------------------

export const Table = ({ children }: { children: ReactNode }) => (
  <div className="-mx-5 overflow-x-auto px-5">
    <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
  </div>
);

export const Th = ({ children, className }: { children: ReactNode; className?: string }) => (
  <th
    className={cx(
      "border-b border-slate-200 pb-2.5 pr-4 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-slate-400",
      className,
    )}
  >
    {children}
  </th>
);

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cx("border-b border-slate-100 py-3 pr-4 align-middle", className)}>{children}</td>
);

// --- Modal -----------------------------------------------------------------

export const Modal = ({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8">
      <div
        className={cx(
          "w-full rounded-2xl bg-white shadow-xl shadow-slate-900/10",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-display font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

// --- Pagination ------------------------------------------------------------

export const Pagination = ({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) => (
  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
    <span>
      Page {page} of {totalPages} · {total} record{total === 1 ? "" : "s"}
    </span>
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  </div>
);

// --- Chat --------------------------------------------------------------

/** One message bubble, shared between the full assistant page and the floating widget. */
export const ChatBubble = ({
  message,
  toolLabel,
  compact = false,
}: {
  message: Pick<ChatMessage, "role" | "content" | "toolsUsed">;
  toolLabel?: (tool: string) => string;
  compact?: boolean;
}) => (
  <div className={cx("flex", message.role === "USER" ? "justify-end" : "justify-start")}>
    <div
      className={cx(
        "max-w-[85%] leading-relaxed",
        compact ? "rounded-xl px-3 py-2 text-sm" : "rounded-2xl px-4 py-2.5 text-sm",
        message.role === "USER"
          ? "bg-brand-600 text-white"
          : "border border-slate-200 bg-white text-slate-800",
      )}
    >
      <p className="whitespace-pre-wrap">{message.content}</p>
      {message.role === "ASSISTANT" && message.toolsUsed.length > 0 && (
        <p className={cx("mt-2 border-t border-slate-100 pt-2 text-slate-400", compact ? "text-[11px]" : "text-xs")}>
          Checked: {message.toolsUsed.map((t) => toolLabel?.(t) ?? t).join(", ")}
        </p>
      )}
    </div>
  </div>
);

export const ThinkingBubble = ({ label, compact = false }: { label: string; compact?: boolean }) => (
  <div className="flex justify-start">
    <div
      className={cx(
        "flex items-center gap-2 rounded-2xl border border-slate-200 bg-white text-slate-500",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
      )}
    >
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  </div>
);
