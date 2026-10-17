-- Adds a "province" column alongside the existing "city" (district/town)
-- field, so a member's address can carry both halves of a Zambian location
-- (province -> district), picked from a fixed list on the frontend.
ALTER TABLE "Member" ADD COLUMN "province" TEXT;
