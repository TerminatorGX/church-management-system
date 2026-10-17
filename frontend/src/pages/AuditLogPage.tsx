import { useState } from "react";
import { api, type Paginated } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { fmtDateTime } from "../lib/format";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Input,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "../components/ui";
import type { AuditAction, AuditLogEntry } from "../lib/types";

const ACTION_TONE: Record<AuditAction, "green" | "blue" | "red" | "slate" | "amber"> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  LOGIN: "slate",
  EXPORT: "amber",
};

export const AuditLogPage = () => {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const resetTo = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const entities = useApi((signal) => api<{ data: string[] }>("/audit-logs/entities", { signal }), []);

  const logs = useApi(
    (signal) =>
      api<Paginated<AuditLogEntry>>("/audit-logs", {
        query: { page, pageSize: 25, entity, action, from, to },
        signal,
      }),
    [page, entity, action, from, to],
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Who changed what, when, and from where. Every mutation across the system is recorded here."
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={entity} onChange={(e) => resetTo(setEntity)(e.target.value)}>
            <option value="">All entities</option>
            {entities.data?.data.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <Select value={action} onChange={(e) => resetTo(setAction)(e.target.value as AuditAction | "")}>
            <option value="">All actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="LOGIN">Login</option>
            <option value="EXPORT">Export</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => resetTo(setFrom)(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => resetTo(setTo)(e.target.value)} aria-label="To date" />
        </div>

        {logs.loading && <Spinner label="Loading audit log" />}
        {logs.error && <ErrorBox message={logs.error} onRetry={logs.reload} />}

        {logs.data &&
          (logs.data.data.length === 0 ? (
            <EmptyState title="No matching audit log entries" hint="Try clearing one of the filters above." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Who</Th>
                    <Th>Action</Th>
                    <Th>Entity</Th>
                    <Th>Summary</Th>
                    <Th>IP</Th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.data.map((row) => (
                    <tr key={row.id}>
                      <Td className="whitespace-nowrap text-slate-600">{fmtDateTime(row.createdAt)}</Td>
                      <Td>
                        {row.user ? (
                          <div>
                            <div className="font-medium text-slate-900">{row.user.name}</div>
                            <div className="text-xs text-slate-400">{row.user.email}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">System</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={ACTION_TONE[row.action]}>{row.action}</Badge>
                      </Td>
                      <Td className="text-slate-600">{row.entity}</Td>
                      <Td className="text-slate-600">{row.summary ?? "—"}</Td>
                      <Td className="text-slate-400">{row.ipAddress ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <Pagination
                page={logs.data.meta.page}
                totalPages={logs.data.meta.totalPages}
                total={logs.data.meta.total}
                onChange={setPage}
              />
            </>
          ))}
      </Card>
    </>
  );
};
