import "dotenv/config";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import type { AssignmentStatus, AttendanceStatus, PaymentMethod } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Deterministic pseudo-random so re-seeding produces the same demo data.
let seed = 20260805;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;

const FIRST_M = ["Mwamba", "Chanda", "Bwalya", "Mulenga", "Kabwe", "Musonda", "Lubasi", "Sakala", "Phiri", "Zulu", "Tembo", "Daka", "Mwanza", "Banda", "Ngoma"];
const FIRST_F = ["Chipo", "Lweendo", "Namwene", "Mutinta", "Bupe", "Thandiwe", "Nsofwa", "Chimwemwe", "Lushomo", "Mapalo", "Taonga", "Kondwani", "Natasha", "Grace", "Ruth"];
const SURNAMES = ["Mumba", "Chilufya", "Nkandu", "Simukonda", "Kalunga", "Hamoonga", "Siame", "Mwape", "Chibesa", "Lungu", "Mubita", "Nyirenda", "Kaunda", "Sinkala", "Chola"];
const SKILLS = ["Singing", "Keyboard", "Drums", "Guitar", "Sound engineering", "Teaching", "Ushering", "Accounting", "Cooking", "Driving", "First aid", "Photography", "Youth ministry", "Counselling", "Translation"];
const INTERESTS = ["Worship", "Outreach", "Children's ministry", "Bible study", "Community service", "Media", "Prayer", "Discipleship"];
const OCCUPATIONS = ["Teacher", "Nurse", "Accountant", "Trader", "Farmer", "Engineer", "Student", "Driver", "Tailor", "Civil servant", "Shopkeeper", "Electrician"];
const CITIES = ["Lusaka", "Ndola", "Kitwe", "Livingstone", "Kabwe", "Chipata"];
const PROVINCE_OF: Record<string, string> = {
  Lusaka: "Lusaka",
  Ndola: "Copperbelt",
  Kitwe: "Copperbelt",
  Livingstone: "Southern",
  Kabwe: "Central",
  Chipata: "Eastern",
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Everything below is computed in plain JS first (ids pre-generated with
 * randomUUID()) and only written to the database as a handful of batched
 * createMany() calls at the end. The previous version awaited one create()
 * per row — thousands of round trips to a pooled Supabase connection, which
 * turned out to be one dropped connection away from leaving the database
 * half-seeded. Batching is both far faster and far more resilient.
 */
async function main() {
  console.log("Seeding church management system...\n");

  // Wipe in FK-safe order so re-running is idempotent.
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.volunteerAssignment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.contribution.deleteMany();
  await prisma.departmentMember.deleteMany();
  await prisma.event.deleteMany();
  await prisma.volunteerRole.deleteMany();
  await prisma.fund.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.member.deleteMany();
  await prisma.family.deleteMany();

  // --- Families and members (computed in memory) ----------------------------
  const familyRows: Prisma.FamilyCreateManyInput[] = [];
  const memberRows: Prisma.MemberCreateManyInput[] = [];
  const members: {
    id: string;
    gender: "MALE" | "FEMALE";
    joinedDate: Date;
    isActive: boolean;
    dateOfBirth: Date | null;
    safeguardingCleared: boolean;
  }[] = [];

  const familyCount = 45;
  for (let f = 0; f < familyCount; f++) {
    const surname = SURNAMES[f % SURNAMES.length]!;
    const city = pick(CITIES);
    const familyId = randomUUID();

    familyRows.push({
      id: familyId,
      familyName: `${surname} family`,
      address: `Plot ${100 + f}, ${pick(["Kabulonga", "Chelston", "Woodlands", "Matero", "Chilenje", "Emmasdale"])}`,
      city,
      phone: `+2609${String(50_000_000 + f * 7919).slice(0, 8)}`,
    });

    const householdSize = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < householdSize; i++) {
      const gender = i === 0 ? "MALE" : i === 1 ? "FEMALE" : chance(0.5) ? "MALE" : "FEMALE";
      const firstName = gender === "MALE" ? pick(FIRST_M) : pick(FIRST_F);
      const isAdult = i < 2 || chance(0.3);
      const joinedDate = dateOnly(daysAgo(Math.floor(rand() * 2200) + 30));
      const isActive = chance(0.94);

      const skills: string[] = [];
      const skillCount = isAdult ? Math.floor(rand() * 3) : 0;
      for (let s = 0; s < skillCount; s++) {
        const skill = pick(SKILLS);
        if (!skills.includes(skill)) skills.push(skill);
      }

      const memberId = randomUUID();
      const dateOfBirth = dateOnly(daysAgo(isAdult ? 7500 + Math.floor(rand() * 12000) : 1500 + Math.floor(rand() * 5000)));
      // Background check / child-protection training — realistically only
      // done for adults who've actually gone through it.
      const safeguardingCleared = isAdult && chance(0.65);

      memberRows.push({
        id: memberId,
        firstName,
        lastName: surname,
        email: isAdult && chance(0.6) ? `${firstName.toLowerCase()}.${surname.toLowerCase()}${f}${i}@example.com` : null,
        phone: isAdult ? `+2609${String(60_000_000 + f * 137 + i * 11).slice(0, 8)}` : null,
        dateOfBirth,
        gender,
        maritalStatus: !isAdult ? "SINGLE" : i < 2 && householdSize > 2 ? "MARRIED" : chance(0.5) ? "MARRIED" : "SINGLE",
        baptismDate: chance(0.7) ? dateOnly(daysAgo(Math.floor(rand() * 3000) + 100)) : null,
        joinedDate,
        address: `Plot ${100 + f}, ${city}`,
        city,
        province: PROVINCE_OF[city],
        occupation: isAdult ? pick(OCCUPATIONS) : null,
        isActive,
        safeguardingCleared,
        skills,
        interests: chance(0.5) ? [pick(INTERESTS)] : [],
        familyId,
        isFamilyHead: i === 0,
      });

      members.push({ id: memberId, gender, joinedDate, isActive, dateOfBirth, safeguardingCleared });
    }
  }

  await prisma.family.createMany({ data: familyRows });
  await prisma.member.createMany({ data: memberRows });
  console.log(`  ${familyRows.length} families, ${memberRows.length} members`);

  // --- Users (only 4 — fine to keep as individual creates) -------------------
  const password = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!", 10);
  const adminId = randomUUID();
  const financeId = randomUUID();
  const deptHeadId = randomUUID();
  await prisma.user.createMany({
    data: [
      { id: adminId, email: (process.env.SEED_ADMIN_EMAIL ?? "admin@church.local").toLowerCase(), name: "Church Administrator", passwordHash: password, role: "ADMIN" },
      { id: financeId, email: "finance@church.local", name: "Grace Mwale", passwordHash: password, role: "FINANCE" },
      { id: deptHeadId, email: "depthead@church.local", name: "Joseph Banda", passwordHash: password, role: "DEPT_HEAD" },
      { id: randomUUID(), email: "viewer@church.local", name: "Mary Phiri", passwordHash: password, role: "VIEWER" },
    ],
  });
  console.log(`  4 users (password: ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"})`);

  // --- Departments + memberships ---------------------------------------------
  const deptNames = [
    ["Worship & Music", "Choir, instrumentalists and sound"],
    ["Children's Ministry", "Sunday school and creche"],
    ["Ushering & Hospitality", "Welcome, seating and refreshments"],
    ["Youth", "Teens and young adults"],
    ["Outreach & Evangelism", "Community outreach and missions"],
    ["Media & Communications", "Livestream, photography and social media"],
  ] as const;

  const departments = deptNames.map(([name, description]) => ({
    id: randomUUID(),
    name,
    description,
    leaderId: name === "Youth" ? deptHeadId : null,
  }));
  await prisma.department.createMany({ data: departments });

  const departmentMemberRows: Prisma.DepartmentMemberCreateManyInput[] = [];
  for (const member of members) {
    if (!chance(0.45)) continue;
    departmentMemberRows.push({ memberId: member.id, departmentId: pick(departments).id });
  }
  await prisma.departmentMember.createMany({ data: departmentMemberRows, skipDuplicates: true });
  console.log(`  ${departments.length} departments with memberships`);

  // --- Funds -------------------------------------------------------------
  const funds = ([
    ["Tithes", "Regular tithes"],
    ["General Offering", "Sunday and midweek offerings"],
    ["Building Fund", "Church building and maintenance"],
    ["Missions", "Outreach and missionary support"],
    ["Benevolence", "Support for members in need"],
  ] as const).map(([name, description]) => ({ id: randomUUID(), name, description }));
  await prisma.fund.createMany({ data: funds });

  // --- Volunteer roles -----------------------------------------------------
  // Children's teacher is the one role here that works closely with
  // children, so it's the one that carries both safeguarding gates — an
  // age floor and a verified clearance, independently of each other.
  const volunteerRoles = ([
    ["Usher", "Welcome and seat the congregation", null, false],
    ["Worship leader", "Lead the worship set", null, false],
    ["Instrumentalist", "Keyboard, guitar, drums or bass", null, false],
    ["Sound engineer", "Run the sound desk", null, false],
    ["Children's teacher", "Teach the Sunday school class", 18, true],
    ["Media", "Livestream, slides and photography", null, false],
  ] as const).map(([name, description, minimumAge, requiresSafeguardingClearance]) => ({
    id: randomUUID(),
    name,
    description,
    minimumAge,
    requiresSafeguardingClearance,
  }));
  await prisma.volunteerRole.createMany({ data: volunteerRoles });
  console.log(`  ${funds.length} funds, ${volunteerRoles.length} volunteer roles`);

  // --- Events, attendance, contributions, rota (computed in memory) ---------
  const activeMembers = members.filter((m) => m.isActive);

  const ageAt = (dob: Date | null, when: Date) => {
    if (!dob) return null;
    const beforeBirthday =
      when.getUTCMonth() < dob.getUTCMonth() ||
      (when.getUTCMonth() === dob.getUTCMonth() && when.getUTCDate() < dob.getUTCDate());
    return when.getUTCFullYear() - dob.getUTCFullYear() - (beforeBirthday ? 1 : 0);
  };

  /** Demo data should actually honour the safeguarding gates it's showing off. */
  const eligibleForRole = <T extends { dateOfBirth: Date | null; safeguardingCleared: boolean }>(
    candidates: T[],
    role: { minimumAge: number | null; requiresSafeguardingClearance: boolean },
    at: Date,
  ) =>
    candidates.filter((m) => {
      if (role.requiresSafeguardingClearance && !m.safeguardingCleared) return false;
      if (role.minimumAge != null) {
        const age = ageAt(m.dateOfBirth, at);
        if (age === null || age < role.minimumAge) return false;
      }
      return true;
    });

  const eventRows: Prisma.EventCreateManyInput[] = [];
  const attendanceRows: Prisma.AttendanceCreateManyInput[] = [];
  const contributionRows: Prisma.ContributionCreateManyInput[] = [];
  const assignmentRows: Prisma.VolunteerAssignmentCreateManyInput[] = [];
  let receiptSeq = 0;

  const addService = (sunday: Date, week: number) => {
    const serviceId = randomUUID();
    const isPast = sunday < new Date();
    eventRows.push({
      id: serviceId,
      name: `Sunday Service — ${sunday.toISOString().slice(0, 10)}`,
      type: "SUNDAY_SERVICE",
      startsAt: sunday,
      endsAt: new Date(sunday.getTime() + 2 * 3600_000),
      location: "Main sanctuary",
      createdById: adminId,
    });

    const eligible = activeMembers.filter((m) => !m.joinedDate || m.joinedDate <= sunday);

    if (isPast) {
      // Attendance drifts upward over time with weekly noise.
      const baseRate = 0.55 + (26 - week) * 0.004 + (rand() - 0.5) * 0.12;

      for (const member of eligible) {
        const roll = rand();
        const status: AttendanceStatus =
          roll < baseRate ? "PRESENT" : roll < baseRate + 0.06 ? "LATE" : roll < baseRate + 0.1 ? "EXCUSED" : "ABSENT";
        attendanceRows.push({ memberId: member.id, eventId: serviceId, status, recordedById: deptHeadId });
      }

      for (const giver of eligible.filter(() => chance(0.32))) {
        const fund = rand() < 0.5 ? funds[0]! : rand() < 0.7 ? funds[1]! : pick(funds);
        const amount = fund.name === "Tithes" ? 150 + Math.floor(rand() * 1800) : 20 + Math.floor(rand() * 400);
        receiptSeq++;
        const method: PaymentMethod = rand() < 0.55 ? "CASH" : rand() < 0.8 ? "MOBILE_MONEY" : "BANK_TRANSFER";
        contributionRows.push({
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency: "ZMW",
          receivedOn: dateOnly(sunday),
          paymentMethod: method,
          receiptNumber: `RCT-${sunday.getUTCFullYear()}-${String(receiptSeq).padStart(6, "0")}`,
          fundId: fund.id,
          memberId: chance(0.85) ? giver.id : null,
          recordedById: financeId,
        });
      }
    }

    // Volunteer rota — one member per role, no double-booking.
    const taken = new Set<string>();
    for (const role of volunteerRoles) {
      const roleEligible = eligibleForRole(eligible, role, sunday);
      const candidate = roleEligible.find((m) => !taken.has(m.id) && chance(0.35));
      if (!candidate) continue;
      taken.add(candidate.id);
      const status: AssignmentStatus = isPast ? "COMPLETED" : chance(0.65) ? "CONFIRMED" : "PENDING";
      assignmentRows.push({
        memberId: candidate.id,
        eventId: serviceId,
        roleId: role.id,
        status,
        serviceHours: isPast ? new Prisma.Decimal("2.50") : null,
        createdById: deptHeadId,
      });
    }
  };

  // 26 weeks back through 3 weeks forward.
  for (let week = 26; week >= -3; week--) {
    const sunday = daysAgo(week * 7);
    sunday.setUTCHours(9, 0, 0, 0);
    addService(sunday, week);

    // A midweek service every other week.
    if (week % 2 === 0) {
      const wednesday = daysAgo(week * 7 - 3);
      wednesday.setUTCHours(17, 30, 0, 0);
      const midweekId = randomUUID();
      eventRows.push({
        id: midweekId,
        name: `Midweek Service — ${wednesday.toISOString().slice(0, 10)}`,
        type: "MIDWEEK_SERVICE",
        startsAt: wednesday,
        location: "Fellowship hall",
        createdById: adminId,
      });

      if (wednesday < new Date()) {
        const eligible = activeMembers.filter((m) => !m.joinedDate || m.joinedDate <= wednesday);
        for (const member of eligible.filter(() => chance(0.35))) {
          attendanceRows.push({
            memberId: member.id,
            eventId: midweekId,
            status: chance(0.9) ? "PRESENT" : "LATE",
            recordedById: deptHeadId,
          });
        }
      }
    }
  }

  // A couple of capacity-limited special events — not a recurring service,
  // where "how many seats are left" is actually a useful question to ask.
  const pastConference = daysAgo(40);
  pastConference.setUTCHours(9, 0, 0, 0);
  const conferenceId = randomUUID();
  eventRows.push({
    id: conferenceId,
    name: "Annual Women's Conference",
    type: "CONFERENCE",
    startsAt: pastConference,
    endsAt: new Date(pastConference.getTime() + 6 * 3600_000),
    location: "Main sanctuary",
    // Deliberately lower than the attendance recorded below, so the
    // "near/over capacity" state actually shows up in the demo.
    capacity: 80,
    createdById: adminId,
  });
  for (const member of activeMembers.filter(() => chance(0.9))) {
    attendanceRows.push({ memberId: member.id, eventId: conferenceId, status: "PRESENT", recordedById: deptHeadId });
  }

  const upcomingYouthCamp = daysAgo(-18);
  upcomingYouthCamp.setUTCHours(8, 0, 0, 0);
  eventRows.push({
    id: randomUUID(),
    name: "Youth Camp",
    type: "SPECIAL_EVENT",
    startsAt: upcomingYouthCamp,
    location: "Chaminuka Lodge",
    capacity: 60,
    description: "Off-site — transport and registration limited by venue capacity.",
    createdById: adminId,
  });

  await prisma.event.createMany({ data: eventRows });
  await prisma.attendance.createMany({ data: attendanceRows });
  await prisma.contribution.createMany({ data: contributionRows });
  await prisma.volunteerAssignment.createMany({ data: assignmentRows });

  console.log(`  ${eventRows.length} events, ${attendanceRows.length} attendance records`);
  console.log(`  ${contributionRows.length} contributions, ${assignmentRows.length} volunteer assignments`);

  console.log("\nSeed complete. Sign in with:");
  console.log(`  admin@church.local     / ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"}  (ADMIN)`);
  console.log(`  finance@church.local   / ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"}  (FINANCE)`);
  console.log(`  depthead@church.local  / ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"}  (DEPT_HEAD)`);
  console.log(`  viewer@church.local    / ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"}  (VIEWER)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
