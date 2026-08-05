import { useState } from "react";
import { api, ApiError, type Paginated } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtRelative, fullName } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "../components/ui";
import type { Member, Role, User } from "../lib/types";

const ROLES: Role[] = ["ADMIN", "FINANCE", "DEPT_HEAD", "VIEWER"];

const ROLE_HINT: Record<Role, string> = {
  ADMIN: "Full access, including user management and deletions.",
  FINANCE: "Everything a department head can do, plus the giving ledger.",
  DEPT_HEAD: "Members, events, attendance and volunteer rotas. No giving data.",
  VIEWER: "Read-only. No giving data.",
};

const UserForm = ({
  members,
  onSaved,
  onCancel,
}: {
  members: Member[];
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "VIEWER" as Role,
    memberId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api("/auth/users", {
        method: "POST",
        body: { ...form, memberId: form.memberId || null },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <Field label="Full name">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          required
        />
      </Field>
      <Field label="Temporary password" hint="At least 8 characters. Ask them to change it after signing in.">
        <Input
          type="text"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          minLength={8}
          required
        />
      </Field>
      <Field label="Role" hint={ROLE_HINT[form.role]}>
        <Select value={form.role} onChange={(e) => set("role", e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Link to a member record" hint="Optional">
        <Select value={form.memberId} onChange={(e) => set("memberId", e.target.value)}>
          <option value="">Not linked</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {fullName(m)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create account"}
        </Button>
      </div>
    </form>
  );
};

export const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = useApi((signal) => api<{ data: User[] }>("/auth/users", { signal }), []);
  const members = useApi(
    (signal) => api<Paginated<Member>>("/members", { query: { pageSize: 100 }, signal }),
    [],
  );

  const update = async (id: string, body: Record<string, unknown>) => {
    setActionError(null);
    try {
      await api(`/auth/users/${id}`, { method: "PATCH", body });
      users.reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update the account.");
    }
  };

  return (
    <>
      <PageHeader
        title="User accounts"
        subtitle="Who can sign in, and what they are allowed to see."
        actions={<Button onClick={() => setCreating(true)}>Add user</Button>}
      />

      <Card>
        {actionError && (
          <div className="mb-4">
            <ErrorBox message={actionError} />
          </div>
        )}

        {users.loading && <Spinner label="Loading accounts" />}
        {users.error && <ErrorBox message={users.error} onRetry={users.reload} />}

        {users.data && (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Linked member</Th>
                <Th>Last signed in</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {users.data.data.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium text-slate-900">{u.name}</span>
                      {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </Td>
                    <Td className="text-slate-600">{u.email}</Td>
                    <Td>
                      {isSelf ? (
                        <Badge tone="blue">{u.role}</Badge>
                      ) : (
                        <Select
                          value={u.role}
                          onChange={(e) => update(u.id, { role: e.target.value })}
                          className="w-36 py-1 text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Td>
                    <Td className="text-slate-600">
                      {u.member ? `${u.member.firstName} ${u.member.lastName}` : "—"}
                    </Td>
                    <Td className="text-slate-600">
                      {u.lastLoginAt ? fmtRelative(u.lastLoginAt) : "Never"}
                    </Td>
                    <Td>
                      {isSelf ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={u.isActive ? "secondary" : "primary"}
                          onClick={() => update(u.id, { isActive: !u.isActive })}
                        >
                          {u.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm">
          <p className="mb-2 font-medium text-slate-800">What each role can do</p>
          <ul className="space-y-1 text-slate-600">
            {ROLES.map((r) => (
              <li key={r}>
                <strong className="text-slate-700">{r}</strong> — {ROLE_HINT[r]}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Modal open={creating} title="Add a user account" onClose={() => setCreating(false)}>
        <UserForm
          members={members.data?.data ?? []}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            users.reload();
          }}
        />
      </Modal>
    </>
  );
};
