import { useEffect, useMemo, useState } from "react";
import { api, type Paginated } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtDateTime, fullName, titleCase } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "../components/ui";
import type { AttendanceStatus, ChurchEvent, RosterEntry } from "../lib/types";

const STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "EXCUSED", "ABSENT"];

const STATUS_TONE: Record<AttendanceStatus, "green" | "amber" | "slate" | "red"> = {
  PRESENT: "green",
  LATE: "amber",
  EXCUSED: "slate",
  ABSENT: "red",
};

export const AttendancePage = () => {
  const { can } = useAuth();
  const mayRecord = can("FINANCE", "DEPT_HEAD");

  const [eventId, setEventId] = useState("");
  const [search, setSearch] = useState("");
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const events = useApi(
    (signal) =>
      api<Paginated<ChurchEvent>>("/events", { query: { pageSize: 40, order: "desc" }, signal }),
    [],
  );

  // Default to the most recent event so the page is useful immediately.
  useEffect(() => {
    if (!eventId && events.data?.data.length) setEventId(events.data.data[0]!.id);
  }, [events.data, eventId]);

  const roster = useApi(
    (signal) =>
      eventId
        ? api<{
            data: {
              event: ChurchEvent;
              roster: RosterEntry[];
              summary: { total: number; marked: number; present: number };
            };
          }>(`/attendance/event/${eventId}`, { signal })
        : Promise.resolve(null),
    [eventId],
  );

  // Reset local edits whenever the event changes.
  useEffect(() => {
    setMarks({});
    setSaved(null);
    setSaveError(null);
  }, [eventId]);

  const rows = roster.data?.data.roster ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.member.firstName} ${r.member.lastName} ${r.member.family?.familyName ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const statusOf = (entry: RosterEntry) => marks[entry.member.id] ?? entry.status;

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = { ...marks };
    for (const r of filtered) next[r.member.id] = status;
    setMarks(next);
  };

  const dirtyCount = Object.keys(marks).length;

  const save = async () => {
    if (!eventId || dirtyCount === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api("/attendance/bulk", {
        method: "POST",
        body: {
          eventId,
          entries: Object.entries(marks).map(([memberId, status]) => ({ memberId, status })),
        },
      });
      setSaved(`Saved attendance for ${dirtyCount} member${dirtyCount === 1 ? "" : "s"}.`);
      setMarks({});
      roster.reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  };

  const summary = roster.data?.data.summary;
  const liveMarked = rows.filter((r) => statusOf(r) !== null).length;
  const livePresent = rows.filter((r) => {
    const s = statusOf(r);
    return s === "PRESENT" || s === "LATE";
  }).length;

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Pick a service, mark the roster, and save. Re-saving corrects earlier mistakes."
        actions={
          mayRecord && (
            <Button onClick={save} disabled={saving || dirtyCount === 0}>
              {saving ? "Saving…" : dirtyCount ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "No changes"}
            </Button>
          )
        }
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Choose a service or event…</option>
            {events.data?.data.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} — {fmtDateTime(ev.startsAt)}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Filter the roster by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!eventId}
          />
        </div>

        {saved && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {saved}
          </div>
        )}
        {saveError && <div className="mb-4"><ErrorBox message={saveError} /></div>}

        {!eventId && <EmptyState title="Select an event above to load its roster" />}

        {eventId && roster.loading && <Spinner label="Loading roster" />}
        {roster.error && <ErrorBox message={roster.error} onRetry={roster.reload} />}

        {roster.data && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  <strong className="text-slate-900">{livePresent}</strong> present
                  {roster.data.data.event.capacity != null && (
                    <span
                      className={
                        livePresent >= roster.data.data.event.capacity
                          ? "font-medium text-red-600"
                          : livePresent >= roster.data.data.event.capacity * 0.9
                            ? "font-medium text-accent-700"
                            : "text-slate-400"
                      }
                    >
                      {" "}
                      / {roster.data.data.event.capacity} capacity
                    </span>
                  )}
                </span>
                <span className="text-slate-600">
                  {liveMarked} of {summary?.total ?? rows.length} marked
                </span>
                {dirtyCount > 0 && (
                  <span className="text-amber-700">{dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}</span>
                )}
              </div>
              {mayRecord && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => markAll("PRESENT")}>
                    Mark shown present
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMarks({})} disabled={!dirtyCount}>
                    Discard changes
                  </Button>
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="No members match that filter" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Family</Th>
                    <Th className="w-80">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const current = statusOf(entry);
                    const isDirty = marks[entry.member.id] !== undefined;
                    return (
                      <tr key={entry.member.id} className={isDirty ? "bg-amber-50/60" : undefined}>
                        <Td>
                          <span className="font-medium text-slate-900">{fullName(entry.member)}</span>
                          {entry.member.phone && (
                            <span className="ml-2 text-xs text-slate-400">{entry.member.phone}</span>
                          )}
                        </Td>
                        <Td className="text-slate-600">{entry.member.family?.familyName ?? "—"}</Td>
                        <Td>
                          {mayRecord ? (
                            <div className="flex flex-wrap gap-1">
                              {STATUSES.map((status) => (
                                <button
                                  key={status}
                                  onClick={() =>
                                    setMarks((m) => ({ ...m, [entry.member.id]: status }))
                                  }
                                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                                    current === status
                                      ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20"
                                      : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                  }`}
                                >
                                  {titleCase(status)}
                                </button>
                              ))}
                            </div>
                          ) : current ? (
                            <Badge tone={STATUS_TONE[current]}>{titleCase(current)}</Badge>
                          ) : (
                            <span className="text-slate-400">Not marked</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </>
        )}
      </Card>
    </>
  );
};
