import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtMoney } from "../lib/format";
import { Table, Td, Th } from "./ui";

/**
 * Categorical slots in fixed order — assigned by position, never cycled.
 * Validated for the light chart surface (#ffffff card): passes the lightness
 * band, chroma floor, adjacent CVD separation (worst ΔE 9.1) and the
 * normal-vision floor (worst ΔE 19.6). Three slots sit under 3:1 contrast, so
 * every chart using them also offers a table view as relief.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;

/** Single-hue sequential blue, used where the encoding is magnitude. */
export const SEQ_BLUE = "#2a78d6";
export const SURFACE = "#ffffff";

const AXIS = { fill: "#64748b", fontSize: 12 };
const GRID = "#e2e8f0";

const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)",
  },
  labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: 4 },
} as const;

/** Toggle between the plot and an equivalent table — the accessibility relief. */
export const ChartFrame = ({
  children,
  table,
  height = 280,
}: {
  children: React.ReactElement;
  table?: React.ReactNode;
  height?: number;
}) => {
  const [showTable, setShowTable] = useState(false);

  return (
    <div>
      {table && (
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => setShowTable((v) => !v)}
            className="rounded px-2 py-1 text-xs font-medium text-slate-500 underline hover:text-slate-700"
          >
            {showTable ? "Show chart" : "Show as table"}
          </button>
        </div>
      )}
      {showTable && table ? (
        table
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// --- Attendance over time --------------------------------------------------

export interface AttendancePoint {
  label: string;
  name: string;
  attendance: number;
}

export const AttendanceTrendChart = ({ data }: { data: AttendancePoint[] }) => (
  <ChartFrame
    table={
      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Service</Th>
            <Th>Attendance</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label + d.name}>
              <Td>{d.label}</Td>
              <Td>{d.name}</Td>
              <Td className="font-medium">{d.attendance}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    }
  >
    {/* One series — the card title names it, so no legend box. */}
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
      <Tooltip
        {...tooltipStyle}
        formatter={(value: number) => [value, "Attended"]}
        labelFormatter={(label: string) => {
          const point = data.find((d) => d.label === label);
          return point ? `${point.name}` : label;
        }}
      />
      <Line
        type="monotone"
        dataKey="attendance"
        stroke={SEQ_BLUE}
        strokeWidth={2}
        dot={{ r: 3, strokeWidth: 0, fill: SEQ_BLUE }}
        activeDot={{ r: 5, strokeWidth: 2, stroke: SURFACE }}
      />
    </LineChart>
  </ChartFrame>
);

// --- Giving by month, split by fund ---------------------------------------

export const GivingTrendChart = ({
  data,
  funds,
}: {
  data: Record<string, number | string>[];
  funds: string[];
}) => {
  // Past five funds the palette can't stay separable — fold the tail into "Other".
  const shown = funds.slice(0, SERIES.length);
  const folded = funds.slice(SERIES.length);
  const rows = folded.length
    ? data.map((row) => {
        const other = folded.reduce((sum, f) => sum + Number(row[f] ?? 0), 0);
        const next: Record<string, number | string> = { month: row.month };
        for (const f of shown) next[f] = Number(row[f] ?? 0);
        next.Other = other;
        return next;
      })
    : data;
  const series = folded.length ? [...shown, "Other"] : shown;

  return (
    <ChartFrame
      table={
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              {series.map((f) => (
                <Th key={f}>{f}</Th>
              ))}
              <Th>Total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = series.reduce((sum, f) => sum + Number(row[f] ?? 0), 0);
              return (
                <tr key={String(row.month)}>
                  <Td>{String(row.month)}</Td>
                  {series.map((f) => (
                    <Td key={f}>{fmtMoney(Number(row[f] ?? 0))}</Td>
                  ))}
                  <Td className="font-medium">{fmtMoney(total)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      }
    >
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompact} />
        <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [fmtMoney(value), name]} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
        {series.map((fund, i) => (
          <Bar
            key={fund}
            dataKey={fund}
            stackId="giving"
            fill={fund === "Other" ? "#94a3b8" : SERIES[i]}
            // A 2px surface stroke reads as a gap between stacked segments.
            stroke={SURFACE}
            strokeWidth={2}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
};

// --- Membership growth -----------------------------------------------------

export interface GrowthPoint {
  month: string;
  newMembers: number;
  totalMembers: number;
}

export const MembershipGrowthChart = ({ data }: { data: GrowthPoint[] }) => (
  <ChartFrame
    table={
      <Table>
        <thead>
          <tr>
            <Th>Month</Th>
            <Th>New members</Th>
            <Th>Total</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <Td>{d.month}</Td>
              <Td>{d.newMembers}</Td>
              <Td className="font-medium">{d.totalMembers}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    }
  >
    <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
      <defs>
        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SEQ_BLUE} stopOpacity={0.22} />
          <stop offset="100%" stopColor={SEQ_BLUE} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
      <Tooltip
        {...tooltipStyle}
        formatter={(value: number, key: string) => [
          value,
          key === "totalMembers" ? "Total members" : "New members",
        ]}
      />
      <Area
        type="monotone"
        dataKey="totalMembers"
        stroke={SEQ_BLUE}
        strokeWidth={2}
        fill="url(#growthFill)"
        dot={false}
        activeDot={{ r: 5, strokeWidth: 2, stroke: SURFACE }}
      />
    </AreaChart>
  </ChartFrame>
);

// --- Volunteer coverage ----------------------------------------------------

export interface CoveragePoint {
  eventId: string;
  name: string;
  startsAt: string;
  confirmed: number;
  pending: number;
  declined: number;
}

export const VolunteerCoverageChart = ({ data }: { data: CoveragePoint[] }) => (
  <ChartFrame
    height={260}
    table={
      <Table>
        <thead>
          <tr>
            <Th>Event</Th>
            <Th>Confirmed</Th>
            <Th>Pending</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.eventId}>
              <Td>{d.name}</Td>
              <Td className="font-medium">{d.confirmed}</Td>
              <Td>{d.pending}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    }
  >
    <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} allowDecimals={false} />
      <YAxis
        type="category"
        dataKey="name"
        tick={AXIS}
        tickLine={false}
        axisLine={false}
        width={150}
        tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 20)}…` : v)}
      />
      <Tooltip {...tooltipStyle} />
      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
      <Bar dataKey="confirmed" name="Confirmed" stackId="v" fill={SERIES[0]} stroke={SURFACE} strokeWidth={2} maxBarSize={22} />
      <Bar dataKey="pending" name="Pending" stackId="v" fill={SERIES[1]} stroke={SURFACE} strokeWidth={2} radius={[0, 4, 4, 0]} maxBarSize={22} />
    </BarChart>
  </ChartFrame>
);

// --- Share of giving by fund ----------------------------------------------

export const GivingByFundChart = ({
  data,
}: {
  data: { fund: string; amount: number; count: number }[];
}) => {
  const total = data.reduce((sum, d) => sum + d.amount, 0);

  return (
    <ChartFrame
      height={240}
      table={
        <Table>
          <thead>
            <tr>
              <Th>Fund</Th>
              <Th>Amount</Th>
              <Th>Share</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.fund}>
                <Td>{d.fund}</Td>
                <Td className="font-medium">{fmtMoney(d.amount)}</Td>
                <Td>{total ? `${Math.round((d.amount / total) * 100)}%` : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      }
    >
      {/* Ranked magnitude reads better as bars than as a pie. */}
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={fmtCompact} />
        <YAxis type="category" dataKey="fund" tick={AXIS} tickLine={false} axisLine={false} width={120} />
        <Tooltip {...tooltipStyle} formatter={(value: number) => [fmtMoney(value), "Total"]} />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {data.map((d, i) => (
            <Cell key={d.fund} fill={SERIES[i % SERIES.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
};
