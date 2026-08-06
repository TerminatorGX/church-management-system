import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { buildDashboardReport } from "../../lib/pdf";
import { validate } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import {
  getAttendanceTrend,
  getGivingByFund,
  getGivingTrend,
  getMembershipGrowth,
  getNeedsFollowUp,
  getSummary,
  getVolunteerCoverage,
} from "./dashboard.service";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const rangeQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

const canSeeFinance = (role: string) => role === "ADMIN" || role === "FINANCE";

/** Headline tiles. Finance figures are omitted for roles that may not see them. */
dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    res.json({ data: await getSummary(canSeeFinance(req.user!.role)) });
  }),
);

/** Attendance per service over time — the primary trend chart. */
dashboardRouter.get(
  "/attendance-trend",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    res.json({ data: await getAttendanceTrend(months) });
  }),
);

/** Contributions grouped by month and fund — stacked bar chart. */
dashboardRouter.get(
  "/giving-trend",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    res.json(await getGivingTrend(months, canSeeFinance(req.user!.role)));
  }),
);

/** Share of giving by fund for the period — pie chart. */
dashboardRouter.get(
  "/giving-by-fund",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    res.json(await getGivingByFund(months, canSeeFinance(req.user!.role)));
  }),
);

/** Membership growth: cumulative active members by month. */
dashboardRouter.get(
  "/membership-growth",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    res.json({ data: await getMembershipGrowth(months) });
  }),
);

/** Volunteer coverage for upcoming events — how many slots are still pending. */
dashboardRouter.get(
  "/volunteer-coverage",
  asyncHandler(async (_req, res) => {
    res.json({ data: await getVolunteerCoverage() });
  }),
);

/**
 * Members who have not attended anything recently. The proposal calls this
 * "identification of inactive members for follow-up".
 */
dashboardRouter.get(
  "/needs-follow-up",
  asyncHandler(async (_req, res) => {
    res.json(await getNeedsFollowUp());
  }),
);

/**
 * A single PDF pulling together every dashboard dataset for the period,
 * respecting the same finance visibility rule as the JSON endpoints.
 */
dashboardRouter.get(
  "/report.pdf",
  validate(rangeQuery, "query"),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof rangeQuery>;
    const seesFinance = canSeeFinance(req.user!.role);

    const [summary, attendance, growth, coverage, followUp, giving, byFund] = await Promise.all([
      getSummary(seesFinance),
      getAttendanceTrend(months),
      getMembershipGrowth(months),
      getVolunteerCoverage(),
      getNeedsFollowUp(),
      getGivingTrend(months, seesFinance),
      getGivingByFund(months, seesFinance),
    ]);

    res.header("Content-Type", "application/pdf");
    res.attachment(`church-report-${new Date().toISOString().slice(0, 10)}.pdf`);

    const doc = buildDashboardReport({
      generatedFor: req.user!.name,
      months,
      summary,
      attendance,
      growth,
      coverage,
      followUp,
      giving: seesFinance ? giving : null,
      byFund: seesFinance ? byFund : null,
    });
    doc.pipe(res);
    doc.end();
  }),
);
