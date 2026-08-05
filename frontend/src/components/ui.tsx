import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

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
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
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
  <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          {title && <h2 className="font-semibold text-slate-900">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
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
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-brand-100 text-brand-800",
  } as const;
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
};

// --- Form controls ---------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = ({ variant = "primary", size = "md", className, ...props }: ButtonProps) => {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
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

// --- Table -----------------------------------------------------------------

export const Table = ({ children }: { children: ReactNode }) => (
  <div className="-mx-5 overflow-x-auto px-5">
    <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
  </div>
);

export const Th = ({ children, className }: { children: ReactNode; className?: string }) => (
  <th
    className={cx(
      "border-b border-slate-200 pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div
        className={cx(
          "w-full rounded-xl bg-white shadow-xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
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
