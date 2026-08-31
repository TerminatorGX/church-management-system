-- The application-level "already scheduled for this event" check in
-- volunteers.routes.ts (findFirst then create) is a check-then-write race:
-- two concurrent requests for the same member+event but different roles can
-- both pass the check before either commits, since the existing unique
-- constraint is scoped to (memberId, eventId, roleId), not (memberId, eventId).
--
-- This partial unique index enforces "at most one active assignment per
-- member per event" at the database level, closing the race regardless of
-- role. DECLINED/CANCELLED assignments are excluded so a member can be
-- re-booked after declining or having a prior assignment cancelled.
CREATE UNIQUE INDEX "VolunteerAssignment_member_event_active_key"
ON "VolunteerAssignment" ("memberId", "eventId")
WHERE "status" NOT IN ('DECLINED', 'CANCELLED');
