-- Safeguarding-aware volunteer assignment (age minimum + vetting clearance,
-- independent factors a role can combine) and optional event capacity.
ALTER TABLE "Member" ADD COLUMN "safeguardingCleared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "VolunteerRole" ADD COLUMN "minimumAge" INTEGER;
ALTER TABLE "VolunteerRole" ADD COLUMN "requiresSafeguardingClearance" BOOLEAN NOT NULL DEFAULT false;
