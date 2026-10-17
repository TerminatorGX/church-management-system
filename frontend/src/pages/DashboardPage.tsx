import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Clock, Home, Users, Wallet } from "lucide-react";
import { api, downloadFile } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fmtDate, fmtMoney } from "../lib/format";
import {
  AttendanceTrendChart,
  GivingByFundChart,
  GivingTrendChart,
  MembershipGrowthChart,
  VolunteerCoverageChart,
  type AttendancePoint,
  type CoveragePoint,
  type GrowthPoint,
} from "../components/charts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
  Td,
  Th,
} from "../components/ui";
import type { DashboardSummary } from "../lib/types";

export const DashboardPage = () => {
  const { user, can } = useAuth();
  const [months, setMonths] = useState(6);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const seesFinance = can("FINANCE");

  const downloadReport = async () => {
    setDownloadingPdf(true);
    try {
      await downloadFile("/dashboard/report.pdf", { months }, "church-report.pdf");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const summary = useApi(
    (signal) => api<{ data: DashboardSummary }>("/dashboard/summary", { signal }),
    [],
  );

  const attendance = useApi(
    (signal) =>
      api<{ data: AttendancePoint[] }>("/dashboard/attendance-trend", { query: { months }, signal }),
    [months],
  );

  const growth = useApi(
    (signal) =>
      api<{ data: GrowthPoint[] }>("/dashboard/membership-growth", { query: { months }, signal }),
    [months],
  );

  const coverage = useApi(
    (signal) => api<{ data: CoveragePoint[] }>("/dashboard/volunteer-coverage", { signal }),
    [],
  );

  const giving = useApi(
    (signal) =>
      seesFinance
        ? api<{ data: Record<string, number | string>[]; funds: string[] }>(
            "/dashboard/giving-trend",
            { query: { months }, signal },
          )
        : Promise.resolve({ data: [], funds: [] }),
    [months, seesFinance],
  );

  const byFund = useApi(
    (signal) =>
      seesFinance
        ? api<{ data: { fund: string; amount: number; count: number }[] }>(
            "/dashboard/giving-by-fund",
            { query: { months }, signal },
          )
        : Promise.resolve({ data: [] }),
    [months, seesFinance],
  );

  const followUp = useApi(
    (signal) =>
      api<{ data: { id: string; firstName: string; lastName: string; phone: string | null; lastSeen: string | null }[] }>(
        "/dashboard/needs-follow-up",
        { signal },
      ),
    [],
  );

  const s = summary.data?.data;

  return (
    <>
      <PageHeader
        title={`Good day, ${user?.name.split(" ")[0] ?? "there"}`}
        subtitle="A snapshot of the congregation right now."
        actions={
          <>
            <Select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-44">
              <option value={3}>Last 3 months</option>
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
            </Select>
            <Button variant="secondary" onClick={downloadReport} disabled={downloadingPdf}>
              {downloadingPdf ? "Preparing PDF…" : "Download PDF"}
            </Button>
          </>
        }
      />

      {summary.loading && <Spinner label="Loading dashboard" />}
      {summary.error && <ErrorBox message={summary.error} onRetry={summary.reload} />}

      {s && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Users size={18} />}
              label="Active members"
              value={s.activeMembers}
              hint={`${s.newThisMonth} joined this month`}
            />
            <StatCard icon={<Home size={18} />} label="Families" value={s.totalFamilies} hint="Households on record" />
            <StatCard
              icon={<Calendar size={18} />}
              label="Last service"
              value={s.lastService?.attendance ?? "—"}
              hint={s.lastService ? fmtDate(s.lastService.startsAt) : "No services recorded"}
            />
            {s.finance ? (
              <StatCard
                icon={<Wallet size={18} />}
                label="Giving this month"
                value={fmtMoney(s.finance.thisMonth)}
                hint={s.finance.changePercent === null ? `${s.finance.contributionCount} contributions` : undefined}
                trend={s.finance.changePercent === null ? undefined : { value: s.finance.changePercent }}
              />
            ) : (
              <StatCard
                icon={<Clock size={18} />}
                label="Pending volunteer slots"
                value={s.pendingAssignments}
                hint={`${s.upcomingEvents} events coming up`}
              />
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card
              title="Attendance per service"
              subtitle={`Sunday and midweek services, last ${months} months`}
            >
              {attendance.loading && <Spinner />}
              {attendance.error && <ErrorBox message={attendance.error} onRetry={attendance.reload} />}
              {attendance.data &&
                (attendance.data.data.length ? (
                  <AttendanceTrendChart data={attendance.data.data} />
                ) : (
                  <EmptyState
                    title="No attendance recorded yet"
                    hint="Record attendance from the Attendance page after a service."
                  />
                ))}
            </Card>

            <Card title="Membership growth" subtitle="Cumulative members over time">
              {growth.loading && <Spinner />}
              {growth.error && <ErrorBox message={growth.error} onRetry={growth.reload} />}
              {growth.data && <MembershipGrowthChart data={growth.data.data} />}
            </Card>

            {seesFinance && (
              <>
                <Card title="Giving by month" subtitle="Contributions stacked by fund">
                  {giving.loading && <Spinner />}
                  {giving.error && <ErrorBox message={giving.error} onRetry={giving.reload} />}
                  {giving.data &&
                    (giving.data.funds.length ? (
                      <GivingTrendChart data={giving.data.data} funds={giving.data.funds} />
                    ) : (
                      <EmptyState
                        title="No contributions recorded"
                        hint="Record giving from the Contributions page."
                      />
                    ))}
                </Card>

                <Card title="Share of giving by fund" subtitle={`Totals over the last ${months} months`}>
                  {byFund.loading && <Spinner />}
                  {byFund.error && <ErrorBox message={byFund.error} onRetry={byFund.reload} />}
                  {byFund.data &&
                    (byFund.data.data.length ? (
                      <GivingByFundChart data={byFund.data.data} />
                    ) : (
                      <EmptyState title="No contributions in this period" />
                    ))}
                </Card>
              </>
            )}

            <Card title="Volunteer coverage" subtitle="Upcoming events and how their rotas look">
              {coverage.loading && <Spinner />}
              {coverage.error && <ErrorBox message={coverage.error} onRetry={coverage.reload} />}
              {coverage.data &&
                (coverage.data.data.length ? (
                  <VolunteerCoverageChart data={coverage.data.data} />
                ) : (
                  <EmptyState
                    title="No upcoming events"
                    hint="Create an event to start scheduling volunteers."
                  />
                ))}
            </Card>

            <Card
              title="Needs follow-up"
              subtitle="Active members with no attendance in the last 2 months"
            >
              {followUp.loading && <Spinner />}
              {followUp.error && <ErrorBox message={followUp.error} onRetry={followUp.reload} />}
              {followUp.data &&
                (followUp.data.data.length ? (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Member</Th>
                        <Th>Phone</Th>
                        <Th>Last seen</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {followUp.data.data.slice(0, 8).map((m) => (
                        <tr key={m.id}>
                          <Td>
                            <Link
                              to={`/members/${m.id}`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              {m.firstName} {m.lastName}
                            </Link>
                          </Td>
                          <Td className="text-slate-600">{m.phone ?? "—"}</Td>
                          <Td>
                            {m.lastSeen ? (
                              fmtDate(m.lastSeen)
                            ) : (
                              <Badge tone="amber">Never recorded</Badge>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <EmptyState title="Everyone has been seen recently" />
                ))}
            </Card>
          </div>
        </>
      )}
    </>
  );
};
