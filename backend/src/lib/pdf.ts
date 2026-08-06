import PDFDocument from "pdfkit";

/**
 * PDFKit's built-in fonts (Helvetica etc.) only support WinAnsi encoding, not
 * full Unicode — em dashes, smart quotes, and bullets from event names or
 * other free-text fields render as a garbled "�" glyph otherwise. Every
 * string that reaches the document goes through this first.
 */
const safe = (value: string) =>
  value
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ");

/** Matches the frontend's fmtMoney so figures read the same in both places. */
const fmtMoney = (value: string | number | null | undefined, currency = "ZMW") => {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  return `${currency} ${n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (value: string | Date | null | undefined) => {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
};

const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";
const BRAND = "#3366ff";

const sectionTitle = (doc: PDFKit.PDFDocument, title: string, subtitle?: string) => {
  ensureRoom(doc, 40);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(title);
  if (subtitle) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(subtitle);
  doc.moveDown(0.4);
  const y = doc.y;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(RULE).stroke();
  doc.moveDown(0.5);
};

const ensureRoom = (doc: PDFKit.PDFDocument, height: number) => {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) doc.addPage();
};

interface TableOptions {
  headers: string[];
  rows: (string | number)[][];
  widths: number[]; // fractions of the usable width, sum ~1
  emptyLabel?: string;
}

/** A minimal fixed-row-height table — no wrapping, cells truncate with an ellipsis. */
const drawTable = (doc: PDFKit.PDFDocument, { headers, rows, widths, emptyLabel }: TableOptions) => {
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidths = widths.map((w) => w * usableWidth);
  const rowHeight = 18;

  const drawRow = (cells: (string | number)[], opts: { bold?: boolean; fill?: string; color?: string }) => {
    ensureRoom(doc, rowHeight + 4);
    const y = doc.y;
    if (opts.fill) {
      doc.rect(doc.page.margins.left, y - 2, usableWidth, rowHeight).fill(opts.fill);
    }
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(opts.color ?? INK);
    let x = doc.page.margins.left;
    cells.forEach((cell, i) => {
      doc.text(safe(String(cell)), x + 4, y, { width: colWidths[i]! - 8, ellipsis: true, lineBreak: false });
      x += colWidths[i]!;
    });
    doc.y = y + rowHeight;
  };

  drawRow(headers, { bold: true, fill: "#f1f5f9" });

  if (rows.length === 0) {
    ensureRoom(doc, rowHeight);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(emptyLabel ?? "No data for this period.", doc.page.margins.left + 4, doc.y + 4);
    doc.moveDown(1.2);
    return;
  }

  rows.forEach((row, i) => drawRow(row, { fill: i % 2 === 1 ? "#f8fafc" : undefined }));
  doc.moveDown(1);
};

// --- Report input shape ------------------------------------------------------

interface ReportInput {
  generatedFor: string;
  months: number;
  summary: {
    activeMembers: number;
    totalFamilies: number;
    newThisMonth: number;
    upcomingEvents: number;
    pendingAssignments: number;
    lastService: { name: string; startsAt: string | Date; attendance: number } | null;
    finance: { thisMonth: string; contributionCount: number } | null;
  };
  attendance: { label: string; name: string; attendance: number }[];
  growth: { month: string; newMembers: number; totalMembers: number }[];
  coverage: { name: string; startsAt: string | Date; confirmed: number; pending: number; declined: number }[];
  followUp: { data: { firstName: string; lastName: string; phone: string | null; lastSeen: string | Date | null }[] };
  giving: { data: Record<string, number | string>[]; funds: string[] } | null;
  byFund: { data: { fund: string; amount: number; count: number }[] } | null;
}

export const buildDashboardReport = (input: ReportInput): PDFKit.PDFDocument => {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });

  // --- Header ---
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND).text("Church Management System");
  doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text("Congregation Report");
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      safe(
        `Generated for ${input.generatedFor} on ${new Date().toISOString().slice(0, 10)} - Last ${input.months} months`,
      ),
    );
  doc.moveDown(0.8);

  // --- Summary tiles (rendered as a simple two-column key/value block) ---
  sectionTitle(doc, "At a glance");
  const s = input.summary;
  const tiles: [string, string][] = [
    ["Active members", String(s.activeMembers)],
    ["Families", String(s.totalFamilies)],
    ["New members this month", String(s.newThisMonth)],
    ["Upcoming events", String(s.upcomingEvents)],
    ["Pending volunteer slots", String(s.pendingAssignments)],
    [
      "Last service attendance",
      s.lastService ? `${s.lastService.attendance} (${s.lastService.name}, ${fmtDate(s.lastService.startsAt)})` : "-",
    ],
  ];
  if (s.finance) {
    tiles.push(["Giving this month", `${fmtMoney(s.finance.thisMonth)} across ${s.finance.contributionCount} contributions`]);
  }
  for (const [label, value] of tiles) {
    ensureRoom(doc, 16);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(safe(label), doc.page.margins.left, doc.y, { continued: true, width: 200 });
    doc.font("Helvetica-Bold").fillColor(INK).text(`  ${safe(value)}`);
  }

  // --- Attendance trend ---
  sectionTitle(doc, "Attendance per service", `Sunday and midweek services, last ${input.months} months`);
  drawTable(doc, {
    headers: ["Date", "Service", "Attendance"],
    widths: [0.25, 0.55, 0.2],
    rows: input.attendance.map((a) => [a.label, a.name, a.attendance]),
    emptyLabel: "No attendance recorded yet.",
  });

  // --- Membership growth ---
  sectionTitle(doc, "Membership growth", "Cumulative members over time");
  drawTable(doc, {
    headers: ["Month", "New members", "Total members"],
    widths: [0.34, 0.33, 0.33],
    rows: input.growth.map((g) => [g.month, g.newMembers, g.totalMembers]),
  });

  // --- Giving (finance only) ---
  if (input.giving && input.byFund) {
    const fundCount = Math.max(input.giving.funds.length, 1);
    const fundColWidth = 0.65 / fundCount;

    sectionTitle(doc, "Giving by month", "Contributions across all funds");
    drawTable(doc, {
      headers: ["Month", ...input.giving.funds, "Total"],
      widths: [0.2, ...input.giving.funds.map(() => fundColWidth), 0.15],
      rows: input.giving.data.map((row) => {
        const total = input.giving!.funds.reduce((sum, f) => sum + Number(row[f] ?? 0), 0);
        return [String(row.month), ...input.giving!.funds.map((f) => fmtMoney(Number(row[f] ?? 0))), fmtMoney(total)];
      }),
      emptyLabel: "No contributions recorded.",
    });

    sectionTitle(doc, "Share of giving by fund", `Totals over the last ${input.months} months`);
    drawTable(doc, {
      headers: ["Fund", "Amount", "Contributions"],
      widths: [0.5, 0.3, 0.2],
      rows: input.byFund.data.map((f) => [f.fund, fmtMoney(f.amount), f.count]),
      emptyLabel: "No contributions in this period.",
    });
  }

  // --- Volunteer coverage ---
  sectionTitle(doc, "Volunteer coverage", "Upcoming events and how their rotas look");
  drawTable(doc, {
    headers: ["Event", "Date", "Confirmed", "Pending", "Declined"],
    widths: [0.4, 0.25, 0.12, 0.12, 0.11],
    rows: input.coverage.map((c) => [c.name, fmtDate(c.startsAt), c.confirmed, c.pending, c.declined]),
    emptyLabel: "No upcoming events.",
  });

  // --- Needs follow-up ---
  sectionTitle(doc, "Needs follow-up", "Active members with no attendance in the last 2 months");
  drawTable(doc, {
    headers: ["Member", "Phone", "Last seen"],
    widths: [0.45, 0.3, 0.25],
    rows: input.followUp.data.map((m) => [`${m.firstName} ${m.lastName}`, m.phone ?? "—", fmtDate(m.lastSeen)]),
    emptyLabel: "Everyone has been seen recently.",
  });

  // --- Footer page numbers ---
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Page ${i + 1} of ${pageCount}`, doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 12, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "center",
      });
  }

  return doc;
};
