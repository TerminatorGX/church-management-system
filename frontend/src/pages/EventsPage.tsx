import { useState } from "react";
import { api, ApiError, type Paginated } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtDateTime, titleCase, toDateTimeInput } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
} from "../components/ui";
import type { ChurchEvent, Department, EventType } from "../lib/types";

const TYPES: EventType[] = [
  "SUNDAY_SERVICE",
  "MIDWEEK_SERVICE",
  "SMALL_GROUP",
  "SPECIAL_EVENT",
  "OUTREACH",
  "CONFERENCE",
];

const EventForm = ({
  event,
  departments,
  onSaved,
  onCancel,
}: {
  event?: ChurchEvent;
  departments: Department[];
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState({
    name: event?.name ?? "",
    type: event?.type ?? ("SUNDAY_SERVICE" as EventType),
    startsAt: toDateTimeInput(event?.startsAt) || toDateTimeInput(new Date()),
    endsAt: toDateTimeInput(event?.endsAt),
    location: event?.location ?? "",
    description: event?.description ?? "",
    departmentId: event?.departmentId ?? "",
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
      await api(event ? `/events/${event.id}` : "/events", {
        method: event ? "PATCH" : "POST",
        body: {
          ...form,
          endsAt: form.endsAt || null,
          location: form.location || null,
          description: form.description || null,
          departmentId: form.departmentId || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the event.");
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
      <Field label="Event name">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={form.type} onChange={(e) => set("type", e.target.value as EventType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department" hint="Optional — for departmental events">
          <Select value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}>
            <option value="">Whole church</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starts">
          <Input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
            required
          />
        </Field>
        <Field label="Ends" hint="Optional">
          <Input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Location">
        <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
      </Field>
      <Field label="Description">
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : event ? "Save changes" : "Create event"}
        </Button>
      </div>
    </form>
  );
};

export const EventsPage = () => {
  const { can } = useAuth();
  const mayEdit = can("FINANCE", "DEPT_HEAD");

  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [when, setWhen] = useState<"all" | "upcoming">("all");
  const [editing, setEditing] = useState<ChurchEvent | null>(null);
  const [creating, setCreating] = useState(false);

  const events = useApi(
    (signal) =>
      api<Paginated<ChurchEvent>>("/events", {
        query: {
          page,
          pageSize: 20,
          type: type || undefined,
          upcoming: when === "upcoming" ? true : undefined,
          order: "desc",
        },
        signal,
      }),
    [page, type, when],
  );

  const departments = useApi((signal) => api<{ data: Department[] }>("/departments", { signal }), []);

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Services, small groups and special events."
        actions={mayEdit && <Button onClick={() => setCreating(true)}>New event</Button>}
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </Select>
          <Select
            value={when}
            onChange={(e) => {
              setWhen(e.target.value as typeof when);
              setPage(1);
            }}
          >
            <option value="all">All dates</option>
            <option value="upcoming">Upcoming only</option>
          </Select>
        </div>

        {events.loading && <Spinner label="Loading events" />}
        {events.error && <ErrorBox message={events.error} onRetry={events.reload} />}

        {events.data &&
          (events.data.data.length === 0 ? (
            <EmptyState title="No events yet" hint="Create one to start recording attendance." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>When</Th>
                    <Th>Location</Th>
                    <Th>Attendance</Th>
                    <Th>Volunteers</Th>
                    {mayEdit && <Th>{""}</Th>}
                  </tr>
                </thead>
                <tbody>
                  {events.data.data.map((ev) => {
                    const upcoming = new Date(ev.startsAt) > new Date();
                    return (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <Td>
                          <div className="font-medium text-slate-900">{ev.name}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge>{titleCase(ev.type)}</Badge>
                            {ev.department && <Badge tone="blue">{ev.department.name}</Badge>}
                            {upcoming && <Badge tone="green">Upcoming</Badge>}
                          </div>
                        </Td>
                        <Td className="text-slate-600">{fmtDateTime(ev.startsAt)}</Td>
                        <Td className="text-slate-600">{ev.location ?? "—"}</Td>
                        <Td>{ev._count?.attendances ?? 0}</Td>
                        <Td>{ev._count?.assignments ?? 0}</Td>
                        {mayEdit && (
                          <Td>
                            <Button size="sm" variant="secondary" onClick={() => setEditing(ev)}>
                              Edit
                            </Button>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>

              <Pagination
                page={events.data.meta.page}
                totalPages={events.data.meta.totalPages}
                total={events.data.meta.total}
                onChange={setPage}
              />
            </>
          ))}
      </Card>

      <Modal open={creating} title="New event" onClose={() => setCreating(false)}>
        <EventForm
          departments={departments.data?.data ?? []}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            events.reload();
          }}
        />
      </Modal>

      <Modal open={!!editing} title="Edit event" onClose={() => setEditing(null)}>
        {editing && (
          <EventForm
            event={editing}
            departments={departments.data?.data ?? []}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              events.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
};
