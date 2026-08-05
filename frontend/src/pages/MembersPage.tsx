import { useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadCsv, type Paginated } from "../lib/api";
import { useApi, useDebounced } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtDate, fullName, initials } from "../lib/format";
import { MemberForm } from "../components/MemberForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "../components/ui";
import type { Department, Family, Member } from "../lib/types";

export const MembersPage = () => {
  const { can } = useAuth();
  const mayEdit = can("FINANCE", "DEPT_HEAD");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [departmentId, setDepartmentId] = useState("");
  const [sort, setSort] = useState<"name" | "recent" | "joined">("name");
  const [creating, setCreating] = useState(false);

  const debouncedSearch = useDebounced(search);

  const members = useApi(
    (signal) =>
      api<Paginated<Member>>("/members", {
        query: { page, pageSize: 25, search: debouncedSearch, isActive: status, departmentId, sort },
        signal,
      }),
    [page, debouncedSearch, status, departmentId, sort],
  );

  const departments = useApi(
    (signal) => api<{ data: Department[] }>("/departments", { signal }),
    [],
  );
  const families = useApi((signal) => api<Paginated<Family>>("/families", { query: { pageSize: 100 }, signal }), []);

  // Any filter change resets to page 1 — otherwise page 4 of a 2-page result is blank.
  const resetTo = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="The congregation directory, with contact details, skills and involvement."
        actions={
          <>
            {mayEdit && (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsv("/members/export", {
                    search: debouncedSearch,
                    isActive: status,
                    departmentId,
                    sort,
                  })
                }
              >
                Export CSV
              </Button>
            )}
            {mayEdit && <Button onClick={() => setCreating(true)}>Add member</Button>}
          </>
        }
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search name, phone or email…"
            value={search}
            onChange={(e) => resetTo(setSearch)(e.target.value)}
          />
          <Select value={status} onChange={(e) => resetTo(setStatus)(e.target.value as typeof status)}>
            <option value="true">Active only</option>
            <option value="false">Archived only</option>
            <option value="all">All members</option>
          </Select>
          <Select value={departmentId} onChange={(e) => resetTo(setDepartmentId)(e.target.value)}>
            <option value="">All departments</option>
            {departments.data?.data.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => resetTo(setSort)(e.target.value as typeof sort)}>
            <option value="name">Sort by name</option>
            <option value="joined">Sort by joined date</option>
            <option value="recent">Sort by recently added</option>
          </Select>
        </div>

        {members.loading && <Spinner label="Loading members" />}
        {members.error && <ErrorBox message={members.error} onRetry={members.reload} />}

        {members.data &&
          (members.data.data.length === 0 ? (
            <EmptyState
              title="No members match those filters"
              hint="Try clearing the search box or switching to 'All members'."
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Contact</Th>
                    <Th>Family</Th>
                    <Th>Departments</Th>
                    <Th>Joined</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {members.data.data.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                            {initials(m.firstName, m.lastName)}
                          </span>
                          <div>
                            <Link
                              to={`/members/${m.id}`}
                              className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                            >
                              {fullName(m)}
                            </Link>
                            {m.occupation && (
                              <p className="text-xs text-slate-500">{m.occupation}</p>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td className="text-slate-600">
                        <div>{m.phone ?? "—"}</div>
                        {m.email && <div className="text-xs text-slate-400">{m.email}</div>}
                      </Td>
                      <Td className="text-slate-600">{m.family?.familyName ?? "—"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {m.departmentMemberships?.length ? (
                            m.departmentMemberships.map((d) => (
                              <Badge key={d.department.id} tone="blue">
                                {d.department.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </Td>
                      <Td className="text-slate-600">{fmtDate(m.joinedDate)}</Td>
                      <Td>
                        {m.isActive ? (
                          <Badge tone="green">Active</Badge>
                        ) : (
                          <Badge tone="slate">Archived</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <Pagination
                page={members.data.meta.page}
                totalPages={members.data.meta.totalPages}
                total={members.data.meta.total}
                onChange={setPage}
              />
            </>
          ))}
      </Card>

      <Modal open={creating} title="Add a member" onClose={() => setCreating(false)} wide>
        <MemberForm
          families={families.data?.data ?? []}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            members.reload();
          }}
        />
      </Modal>
    </>
  );
};
