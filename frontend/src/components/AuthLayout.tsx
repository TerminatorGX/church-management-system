import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

/** Shared hero shell for the sign-in / forgot-password / reset-password pages. */
export const AuthLayout = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 p-4">
    <div
      aria-hidden
      className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-300/40 via-brand-200/20 to-accent-300/30 blur-3xl"
    />
    <div className="relative w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark size="lg" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm shadow-slate-900/[0.03]">
        {children}
      </div>

      {footer && <div className="mt-4 text-center text-xs text-slate-500">{footer}</div>}
    </div>
  </div>
);
