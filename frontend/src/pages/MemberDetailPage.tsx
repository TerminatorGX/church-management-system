import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Paginated } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtDate, fmtMoney, fullName, initials, titleCase } from "../lib/format";
import { MemberForm } from "../components/MemberForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "../components/ui";
import type { Family, Member } from "../lib/types";

const Detail = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-sm text-slate-800">{value || "—"}</dd>
  </div>
);

export const MemberDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const mayEdit = can("FINANCE", "DEPT_HEAD");

  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const member = useApi(
    (signal) => api<{ data: Member }>(`/members/${id}`, { signal }),
    [id],
  );
  const families = useApi(
    (signal) => api<Paginated<Family>>("/families", { query: { pageSize: 100 }, signal }),
    [],
  );

  const archive = async () => {
    setArchiving(true);
    try {
      await api(`/members/${id}`, { method: "DELETE" });
      navigate("/members");
    } finally {
      setArchiving(false);
    }
  };

  if (member.loading) return <Spinner label="Loading member" />;
  if (member.error) return <ErrorBox message={member.error} onRetry={member.reload} />;
  if (!member.data) return null;

  const m = member.data.data;

  return (
    <>
      <PageHeader
        title={fullName(m)}
        subtitle={[m.occupation, m.city].filter(Boolean).join(" · ") || "Member profile"}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/members")}>
              Back to list
            </Button>
            {mayEdit && <Button onClick={() => setEditing(true)}>Edit</Button>}
            {user?.role === "ADMIN" && m.isActive && (
              <Button variant="danger" onClick={archive} disabled={archiving}>
                {archiving ? "Archiving…" : "Archive"}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <div className="mb-5 flex items-center gap-4">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                {initials(m.firstName, m.lastName)}
              </span>
              <div>
                <p className="text-lg font-semibold text-slate-900">{fullName(m)}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {m.isActive ? <Badge tone="green">Active</Badge> : <Badge>Archived</Badge>}
                  {m.isFamilyHead && <Badge tone="blue">Head of household</Badge>}
                  {m.user && <Badge tone="amber">Has a login ({m.user.role})</Badge>}
                </div>
              </div>
            </div>

            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Phone" value={m.phone} />
              <Detail label="Email" value={m.email} />
              <Detail label="Date of birth" value={fmtDate(m.dateOfBirth)} />
              <Detail label="Gender" value={titleCase(m.gender)} />
              <Detail label="Marital status" value={titleCase(m.maritalStatus)} />
              <Detail label="Baptised" value={fmtDate(m.baptismDate)} />
              <Detail label="Joined" value={fmtDate(m.joinedDate)} />
              <Detail label="Occupation" value={m.occupation} />
              <Detail
                label="Family"
                value={
                  m.family ? (
                    <Link to="/families" className="text-brand-700 hover:underline">
                      {m.family.familyName}
                    </Link>
                  ) : null
                }
              />
              <Detail label="Address" value={[m.address, m.city].filter(Boolean).join(", ")} />
            </dl>

            {(m.skills.length > 0 || m.interests.length > 0) && (
              <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.skills.length ? (
                      m.skills.map((s) => <Badge key={s} tone="blue">{s}</Badge>)
                    ) : (
                      <span className="text-sm text-slate-400">None recorded</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">Interests</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.interests.length ? (
                      m.interests.map((s) => <Badge key={s}>{s}</Badge>)
                    ) : (
                      <span className="text-sm text-slate-400">None recorded</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {m.notes && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Notes</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{m.notes}</p>
              </div>
            )}
          </Card>

          <Card title="Recent attendance">
            {m.attendances?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {m.attendances.map((a) => (
                    <tr key={a.id}>
                      <Td>{a.event.name}</Td>
                      <Td className="text-slate-600">{fmtDate(a.event.startsAt)}</Td>
                      <Td>
                        <Badge
                          tone={
                            a.status === "PRESENT"
                              ? "green"
                              : a.status === "LATE"
                                ? "amber"
                                : a.status === "ABSENT"
                                  ? "red"
                                  : "slate"
                          }
                        >
                          {titleCase(a.status)}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="No attendance recorded for this member yet" />
            )}
          </Card>

          <Card title="Volunteer history">
            {m.volunteerAssignments?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>Role</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {m.volunteerAssignments.map((a) => (
                    <tr key={a.id}>
                      <Td>{a.event.name}</Td>
                      <Td className="text-slate-600">{a.role.name}</Td>
                      <Td className="text-slate-600">{fmtDate(a.event.startsAt)}</Td>
                      <Td>
                        <Badge tone={a.status === "CONFIRMED" || a.status === "COMPLETED" ? "green" : a.status === "PENDING" ? "amber" : "slate"}>
                          {titleCase(a.status)}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="This member has not been scheduled to serve yet" />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="At a glance">
            <dl className="space-y-4">
              <Detail label="Services attended" value={m.stats?.attendanceCount ?? 0} />
              {m.stats?.totalGiven !== undefined && (
                <>
                  <Detail label="Total given" value={fmtMoney(m.stats.totalGiven)} />
                  <Detail label="Contributions" value={m.stats.contributionCount ?? 0} />
                </>
              )}
            </dl>
            {m.stats?.totalGiven === undefined && (
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
                Giving figures are visible to the finance and admin roles only.
              </p>
            )}
          </Card>

          <Card title="Departments">
            {m.departmentMemberships?.length ? (
              <ul className="space-y-2">
                {m.departmentMemberships.map((d) => (
                  <li key={d.department.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{d.department.name}</span>
                    {d.roleTitle && <Badge>{d.roleTitle}</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Not part of any department.</p>
            )}
          </Card>

          {m.family?.members && m.family.members.length > 1 && (
            <Card title="Household">
              <ul className="space-y-2">
                {m.family.members
                  .filter((rel) => rel.id !== m.id)
                  .map((rel) => (
                    <li key={rel.id}>
                      <Link
                        to={`/members/${rel.id}`}
                        className="text-sm text-brand-700 hover:underline"
                      >
                        {fullName(rel)}
                      </Link>
                      {rel.isFamilyHead && <span className="ml-2 text-xs text-slate-400">head</span>}
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal open={editing} title={`Edit ${fullName(m)}`} onClose={() => setEditing(false)} wide>
        <MemberForm
          member={m}
          families={families.data?.data ?? []}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            member.reload();
          }}
        />
      </Modal>
    </>
  );
};
