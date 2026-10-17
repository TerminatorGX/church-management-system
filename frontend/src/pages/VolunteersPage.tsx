import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api, ApiError, type Paginated } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtDateTime, fullName, titleCase } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
} from "../components/ui";
import type { AssignmentStatus, ChurchEvent, VolunteerAssignment, VolunteerRole } from "../lib/types";

const STATUSES: AssignmentStatus[] = ["PENDING", "CONFIRMED", "DECLINED", "COMPLETED", "CANCELLED"];

const STATUS_TONE: Record<AssignmentStatus, "green" | "amber" | "red" | "slate"> = {
  PENDING: "amber",
  CONFIRMED: "green",
  COMPLETED: "green",
  DECLINED: "red",
  CANCELLED: "slate",
};

interface Suggestion {
  member: { id: string; firstName: string; lastName: string; phone: string | null; skills: string[] };
  skillMatch: boolean;
  lastServed: string | null;
}

/** Picks a volunteer for a role, ranked by skill match and how long since they served. */
const AssignModal = ({
  eventId,
  roles,
  onClose,
  onSaved,
}: {
  eventId: string;
  roles: VolunteerRole[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const suggestions = useApi(
    (signal) =>
      roleId
        ? api<{ data: { role: VolunteerRole; suggestions: Suggestion[] } }>("/volunteers/suggestions", {
            query: { roleId, eventId },
            signal,
          })
        : Promise.resolve(null),
    [roleId, eventId],
  );

  const assign = async (memberId: string) => {
    setError(null);
    setSavingId(memberId);
    try {
      await api("/volunteers/assignments", {
        method: "POST",
        body: { memberId, eventId, roleId, status: "PENDING" },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the assignment.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <Field label="Role to fill">
        <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.minimumAge != null ? ` (${r.minimumAge}+)` : ""}
              {r.requiresSafeguardingClearance ? " — clearance required" : ""}
            </option>
          ))}
        </Select>
      </Field>

      {suggestions.loading && <Spinner label="Finding suitable volunteers" />}
      {suggestions.error && <ErrorBox message={suggestions.error} onRetry={suggestions.reload} />}

      {suggestions.data && (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          {suggestions.data.data.suggestions.length === 0 ? (
            <EmptyState title="Everyone available is already scheduled for this event" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {suggestions.data.data.suggestions.map((s) => (
                <li key={s.member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{fullName(s.member)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {s.skillMatch && <Badge tone="green">Skill match</Badge>}
                      <span>
                        {s.lastServed
                          ? `Last served ${fmtDateTime(s.lastServed)}`
                          : "Has not served in this role"}
                      </span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={savingId === s.member.id}
                    onClick={() => assign(s.member.id)}
                  >
                    {savingId === s.member.id ? "Adding…" : "Assign"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
};

const RoleForm = ({
  role,
  onSaved,
  onCancel,
}: {
  role?: VolunteerRole;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState({
    name: role?.name ?? "",
    description: role?.description ?? "",
    minimumAge: role?.minimumAge != null ? String(role.minimumAge) : "",
    requiresSafeguardingClearance: role?.requiresSafeguardingClearance ?? false,
    isActive: role?.isActive ?? true,
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
      await api(role ? `/volunteers/roles/${role.id}` : "/volunteers/roles", {
        method: role ? "PATCH" : "POST",
        body: {
          ...form,
          description: form.description || null,
          minimumAge: form.minimumAge ? Number(form.minimumAge) : null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the role.");
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
      <Field label="Role name">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
      </Field>
      <Field label="Description">
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field
        label="Minimum age"
        hint="Optional — e.g. 18 for roles handling funds or working closely with children"
      >
        <Input
          type="number"
          min={0}
          max={120}
          value={form.minimumAge}
          onChange={(e) => set("minimumAge", e.target.value)}
          placeholder="No minimum"
          className="max-w-32"
        />
      </Field>
      <Checkbox
        label="Requires safeguarding clearance"
        checked={form.requiresSafeguardingClearance}
        onChange={(e) => set("requiresSafeguardingClearance", e.target.checked)}
      />
      <p className="-mt-2 text-xs text-slate-500">
        A separate, fairer factor than age alone — the volunteer must be marked "safeguarding
        cleared" on their member profile. The two requirements combine: a role can need either,
        both, or neither.
      </p>
      <Checkbox label="Active" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : role ? "Save changes" : "Add role"}
        </Button>
      </div>
    </form>
  );
};

const RolesManager = ({ roles, onChanged }: { roles: VolunteerRole[]; onChanged: () => void }) => {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VolunteerRole | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          New role
        </Button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {roles.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                {r.name}
                {!r.isActive && <span className="ml-1.5 text-xs text-slate-400">(inactive)</span>}
              </p>
              {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {r.minimumAge != null && <Badge tone="blue">{r.minimumAge}+ only</Badge>}
                {r.requiresSafeguardingClearance && (
                  <Badge tone="amber">
                    <ShieldCheck size={11} className="mr-1 inline" />
                    Clearance required
                  </Badge>
                )}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>

      <Modal open={creating} title="New volunteer role" onClose={() => setCreating(false)}>
        <RoleForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            onChanged();
          }}
        />
      </Modal>
      <Modal open={!!editing} title="Edit volunteer role" onClose={() => setEditing(null)}>
        {editing && (
          <RoleForm
            role={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        )}
      </Modal>
    </div>
  );
};

export const VolunteersPage = () => {
  const { can } = useAuth();
  const mayEdit = can("FINANCE", "DEPT_HEAD");

  const [eventId, setEventId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [managingRoles, setManagingRoles] = useState(false);

  const events = useApi(
    (signal) =>
      api<Paginated<ChurchEvent>>("/events", {
        query: { pageSize: 30, upcoming: true, order: "asc" },
        signal,
      }),
    [],
  );

  useEffect(() => {
    if (!eventId && events.data?.data.length) setEventId(events.data.data[0]!.id);
  }, [events.data, eventId]);

  const roles = useApi((signal) => api<{ data: VolunteerRole[] }>("/volunteers/roles", { signal }), []);

  const assignments = useApi(
    (signal) =>
      eventId
        ? api<Paginated<VolunteerAssignment>>("/volunteers/assignments", {
            query: { eventId, pageSize: 100 },
            signal,
          })
        : Promise.resolve(null),
    [eventId],
  );

  const setStatus = async (id: string, status: AssignmentStatus) => {
    await api(`/volunteers/assignments/${id}`, { method: "PATCH", body: { status } });
    assignments.reload();
  };

  const remove = async (id: string) => {
    await api(`/volunteers/assignments/${id}`, { method: "DELETE" });
    assignments.reload();
  };

  return (
    <>
      <PageHeader
        title="Volunteer scheduling"
        subtitle="Build the rota for upcoming services. Suggestions rank by declared skills and time since last serving."
        actions={
          mayEdit && (
            <>
              <Button variant="secondary" onClick={() => setManagingRoles(true)}>
                Manage roles
              </Button>
              <Button onClick={() => setAssigning(true)} disabled={!eventId}>
                Assign a volunteer
              </Button>
            </>
          )
        }
      />

      <Card>
        <div className="mb-4">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)} className="sm:max-w-md">
            <option value="">Choose an upcoming event…</option>
            {events.data?.data.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} — {fmtDateTime(ev.startsAt)}
              </option>
            ))}
          </Select>
        </div>

        {!eventId && events.data?.data.length === 0 && (
          <EmptyState
            title="No upcoming events"
            hint="Create an event first, then come back to schedule volunteers."
          />
        )}
        {!eventId && (events.data?.data.length ?? 0) > 0 && (
          <EmptyState title="Select an event to see its rota" />
        )}

        {eventId && assignments.loading && <Spinner label="Loading rota" />}
        {assignments.error && <ErrorBox message={assignments.error} onRetry={assignments.reload} />}

        {assignments.data &&
          (assignments.data.data.length === 0 ? (
            <EmptyState
              title="Nobody is scheduled for this event yet"
              hint={mayEdit ? "Use 'Assign a volunteer' to build the rota." : undefined}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Volunteer</Th>
                  <Th>Role</Th>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  {mayEdit && <Th>{""}</Th>}
                </tr>
              </thead>
              <tbody>
                {assignments.data.data.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{fullName(a.member)}</Td>
                    <Td>
                      <Badge tone="blue">{a.role.name}</Badge>
                    </Td>
                    <Td className="text-slate-600">{a.member.phone ?? "—"}</Td>
                    <Td>
                      {mayEdit ? (
                        <Select
                          value={a.status}
                          onChange={(e) => setStatus(a.id, e.target.value as AssignmentStatus)}
                          className="w-40 py-1 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {titleCase(s)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone={STATUS_TONE[a.status]}>{titleCase(a.status)}</Badge>
                      )}
                    </Td>
                    {mayEdit && (
                      <Td>
                        <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
                          Remove
                        </Button>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
      </Card>

      <Modal open={assigning} title="Assign a volunteer" onClose={() => setAssigning(false)}>
        {eventId && (
          <AssignModal
            eventId={eventId}
            roles={roles.data?.data ?? []}
            onClose={() => setAssigning(false)}
            onSaved={() => assignments.reload()}
          />
        )}
      </Modal>

      <Modal open={managingRoles} title="Volunteer roles" onClose={() => setManagingRoles(false)} wide>
        <RolesManager roles={roles.data?.data ?? []} onChanged={() => roles.reload()} />
      </Modal>
    </>
  );
};
