-- Enable Row Level Security on every application table, with zero policies
-- defined. This is a deliberate default-deny: Supabase exposes a REST API
-- (PostgREST) over this database using the `anon` and `authenticated` roles,
-- separate from and in addition to this app's own Express backend. Without
-- RLS, anyone holding the project's `anon` key could read or write every row
-- in every table directly, bypassing this app's authentication entirely.
--
-- This does NOT affect the application itself. Prisma connects using the
-- Supabase project's `postgres` role, which is a superuser — and Postgres
-- never applies RLS to superusers or to a table's owner, regardless of how
-- many (or how few) policies exist. `anon` / `authenticated` are ordinary
-- roles, so "RLS enabled + no policies" means those roles see nothing,
-- while this app keeps working exactly as before.
--
-- If a table ever needs to be readable through Supabase's own client SDK or
-- REST API directly (bypassing this backend), add an explicit policy for it
-- with `CREATE POLICY ... ON "TableName" ...` — do not disable RLS wholesale
-- to get there.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Family" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DepartmentMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;