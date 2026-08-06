import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Button, Field, Input } from "../components/ui";

export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, newPassword } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            C
          </span>
          <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!token ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-red-700">
                This link is missing its reset token. Use the link from your email, or request a
                new one.
              </p>
              <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
                Request a new link
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-700">
                Your password has been reset. You can sign in with it now.
              </p>
              <Link to="/login" className="text-sm font-medium text-brand-700 hover:underline">
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}
              <Field label="New password" hint="At least 8 characters.">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Confirm new password">
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Resetting…" : "Reset password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
