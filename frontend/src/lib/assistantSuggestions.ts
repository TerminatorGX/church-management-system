/**
 * Starter questions shown when a chat is empty, picked by which page the
 * user is on. Kept to phrasings that map cleanly onto one of the six tools
 * the assistant actually has — a suggestion the model can't answer well is
 * worse than no suggestion at all.
 */

const GENERAL = [
  "How has attendance changed over the last three months?",
  "Who hasn't been to church recently and needs a follow-up call?",
  "Which volunteer slots are still unfilled for the next service?",
  "How many active members do we have?",
];

const MEMBER_QUESTIONS = [
  "Who in the congregation can play keyboard or sing?",
  "Who hasn't been to church recently and needs a follow-up call?",
  "How many active members do we have?",
];

const ATTENDANCE_QUESTIONS = [
  "How has attendance changed over the last three months?",
  "What was attendance like at the last service?",
  "Who hasn't been to church recently and needs a follow-up call?",
];

const VOLUNTEER_QUESTIONS = [
  "Which volunteer slots are still unfilled for the next service?",
  "Who in the congregation can play keyboard or sing?",
  "What's coming up on the schedule?",
];

/** Only ever shown to ADMIN/FINANCE — filtered out for everyone else. */
const FINANCE_QUESTIONS = [
  "How much has been given this month compared to last month?",
  "What's the breakdown of giving by fund?",
  "How many contributions came in this month?",
];

const ROUTES: { test: (path: string) => boolean; questions: string[] }[] = [
  { test: (p) => p.startsWith("/members"), questions: MEMBER_QUESTIONS },
  { test: (p) => p.startsWith("/events") || p.startsWith("/attendance"), questions: ATTENDANCE_QUESTIONS },
  { test: (p) => p.startsWith("/volunteers"), questions: VOLUNTEER_QUESTIONS },
  { test: (p) => p.startsWith("/contributions") || p.startsWith("/funds"), questions: FINANCE_QUESTIONS },
];

/** Human-readable labels for the data tools the assistant reports having used. */
export const TOOL_LABELS: Record<string, string> = {
  search_members: "member directory",
  get_attendance_summary: "attendance records",
  get_giving_summary: "giving ledger",
  get_upcoming_schedule: "volunteer schedule",
  find_members_needing_follow_up: "follow-up list",
  get_church_overview: "church overview",
  get_fund_details: "fund details",
  get_member_profile: "member profile",
  search_families: "family directory",
  get_department_roster: "department roster",
  get_past_events: "past events",
  list_volunteer_roles: "volunteer roles",
  get_recent_activity: "activity log",
};

export const getSuggestions = (pathname: string, canSeeFinance: boolean): string[] => {
  const matched = ROUTES.find((r) => r.test(pathname));
  const list = matched?.questions ?? GENERAL;

  const filtered = canSeeFinance ? list : list.filter((q) => !FINANCE_QUESTIONS.includes(q));
  return (filtered.length > 0 ? filtered : GENERAL).slice(0, 4);
};
