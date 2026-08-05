import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
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

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

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

  // --- Families and members ------------------------------------------------
  const familyCount = 45;
  const members: { id: string; gender: "MALE" | "FEMALE"; joinedDate: Date }[] = [];

  for (let f = 0; f < familyCount; f++) {
    const surname = SURNAMES[f % SURNAMES.length]!;
    const city = pick(CITIES);

    const family = await prisma.family.create({
      data: {
        familyName: `${surname} family`,
        address: `Plot ${100 + f}, ${pick(["Kabulonga", "Chelston", "Woodlands", "Matero", "Chilenje", "Emmasdale"])}`,
        city,
        phone: `+2609${String(50_000_000 + f * 7919).slice(0, 8)}`,
      },
    });

    const householdSize = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < householdSize; i++) {
      const gender = i === 0 ? "MALE" : i === 1 ? "FEMALE" : chance(0.5) ? "MALE" : "FEMALE";
      const firstName = gender === "MALE" ? pick(FIRST_M) : pick(FIRST_F);
      const isAdult = i < 2 || chance(0.3);
      const joinedDate = dateOnly(daysAgo(Math.floor(rand() * 2200) + 30));

      const skills: string[] = [];
      const skillCount = isAdult ? Math.floor(rand() * 3) : 0;
      for (let s = 0; s < skillCount; s++) {
        const skill = pick(SKILLS);
        if (!skills.includes(skill)) skills.push(skill);
      }

      const member = await prisma.member.create({
        data: {
          firstName,
          lastName: surname,
          email: isAdult && chance(0.6) ? `${firstName.toLowerCase()}.${surname.toLowerCase()}${f}${i}@example.com` : null,
          phone: isAdult ? `+2609${String(60_000_000 + f * 137 + i * 11).slice(0, 8)}` : null,
          dateOfBirth: dateOnly(daysAgo(isAdult ? 7500 + Math.floor(rand() * 12000) : 1500 + Math.floor(rand() * 5000))),
          gender,
          maritalStatus: !isAdult ? "SINGLE" : i < 2 && householdSize > 2 ? "MARRIED" : chance(0.5) ? "MARRIED" : "SINGLE",
          baptismDate: chance(0.7) ? dateOnly(daysAgo(Math.floor(rand() * 3000) + 100)) : null,
          joinedDate,
          address: `Plot ${100 + f}, ${city}`,
          city,
          occupation: isAdult ? pick(OCCUPATIONS) : null,
          isActive: chance(0.94),
          skills,
          interests: chance(0.5) ? [pick(INTERESTS)] : [],
          familyId: family.id,
          isFamilyHead: i === 0,
        },
      });

      members.push({ id: member.id, gender, joinedDate });
    }
  }
  console.log(`  ${familyCount} families, ${members.length} members`);

  // --- Users ---------------------------------------------------------------
  const password = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!", 10);
  const [admin, finance, deptHead] = await Promise.all([
    prisma.user.create({
      data: {
        email: (process.env.SEED_ADMIN_EMAIL ?? "admin@church.local").toLowerCase(),
        name: "Church Administrator",
        passwordHash: password,
        role: "ADMIN",
      },
    }),
    prisma.user.create({
      data: { email: "finance@church.local", name: "Grace Mwale", passwordHash: password, role: "FINANCE" },
    }),
    prisma.user.create({
      data: { email: "depthead@church.local", name: "Joseph Banda", passwordHash: password, role: "DEPT_HEAD" },
    }),
  ]);
  await prisma.user.create({
    data: { email: "viewer@church.local", name: "Mary Phiri", passwordHash: password, role: "VIEWER" },
  });
  console.log(`  4 users (password: ${process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!"})`);

  // --- Departments ---------------------------------------------------------
  const deptNames = [
    ["Worship & Music", "Choir, instrumentalists and sound"],
    ["Children's Ministry", "Sunday school and creche"],
    ["Ushering & Hospitality", "Welcome, seating and refreshments"],
    ["Youth", "Teens and young adults"],
    ["Outreach & Evangelism", "Community outreach and missions"],
    ["Media & Communications", "Livestream, photography and social media"],
  ] as const;

  const departments = [];
  for (const [name, description] of deptNames) {
    departments.push(
      await prisma.department.create({
        data: { name, description, leaderId: name === "Youth" ? deptHead.id : null },
      }),
    );
  }

  for (const member of members) {
    if (!chance(0.45)) continue;
    const dept = pick(departments);
    await prisma.departmentMember.upsert({
      where: { memberId_departmentId: { memberId: member.id, departmentId: dept.id } },
      create: { memberId: member.id, departmentId: dept.id },
      update: {},
    });
  }
  console.log(`  ${departments.length} departments with memberships`);

  // --- Funds ---------------------------------------------------------------
  const funds = [];
  for (const [name, description] of [
    ["Tithes", "Regular tithes"],
    ["General Offering", "Sunday and midweek offerings"],
    ["Building Fund", "Church building and maintenance"],
    ["Missions", "Outreach and missionary support"],
    ["Benevolence", "Support for members in need"],
  ] as const) {
    funds.push(await prisma.fund.create({ data: { name, description } }));
  }

  // --- Volunteer roles -----------------------------------------------------
  const volunteerRoles = [];
  for (const [name, description] of [
    ["Usher", "Welcome and seat the congregation"],
    ["Worship leader", "Lead the worship set"],
    ["Instrumentalist", "Keyboard, guitar, drums or bass"],
    ["Sound engineer", "Run the sound desk"],
    ["Children's teacher", "Teach the Sunday school class"],
    ["Media", "Livestream, slides and photography"],
  ] as const) {
    volunteerRoles.push(await prisma.volunteerRole.create({ data: { name, description } }));
  }
  console.log(`  ${funds.length} funds, ${volunteerRoles.length} volunteer roles`);

  // --- Events, attendance, contributions, rota -----------------------------
  const activeMembers = await prisma.member.findMany({
    where: { isActive: true },
    select: { id: true, joinedDate: true },
  });

  let eventCount = 0;
  let attendanceCount = 0;
  let contributionCount = 0;
  let assignmentCount = 0;
  let receiptSeq = 0;

  // 26 weeks back through 3 weeks forward.
  for (let week = 26; week >= -3; week--) {
    const sunday = daysAgo(week * 7);
    sunday.setUTCHours(9, 0, 0, 0);
    const isPast = sunday < new Date();

    const service = await prisma.event.create({
      data: {
        name: `Sunday Service — ${sunday.toISOString().slice(0, 10)}`,
        type: "SUNDAY_SERVICE",
        startsAt: sunday,
        endsAt: new Date(sunday.getTime() + 2 * 3600_000),
        location: "Main sanctuary",
        createdById: admin.id,
      },
    });
    eventCount++;

    const eligible = activeMembers.filter((m) => !m.joinedDate || m.joinedDate <= sunday);

    if (isPast) {
      // Attendance drifts upward over time with weekly noise.
      const baseRate = 0.55 + (26 - week) * 0.004 + (rand() - 0.5) * 0.12;

      for (const member of eligible) {
        const roll = rand();
        const status = roll < baseRate ? "PRESENT" : roll < baseRate + 0.06 ? "LATE" : roll < baseRate + 0.1 ? "EXCUSED" : "ABSENT";
        await prisma.attendance.create({
          data: { memberId: member.id, eventId: service.id, status, recordedById: deptHead.id },
        });
        attendanceCount++;
      }

      // Contributions on the same day.
      const givers = eligible.filter(() => chance(0.32));
      for (const giver of givers) {
        const fund = rand() < 0.5 ? funds[0]! : rand() < 0.7 ? funds[1]! : pick(funds);
        const amount = fund.name === "Tithes"
          ? 150 + Math.floor(rand() * 1800)
          : 20 + Math.floor(rand() * 400);

        receiptSeq++;
        await prisma.contribution.create({
          data: {
            amount: new Prisma.Decimal(amount.toFixed(2)),
            currency: "ZMW",
            receivedOn: dateOnly(sunday),
            paymentMethod: rand() < 0.55 ? "CASH" : rand() < 0.8 ? "MOBILE_MONEY" : "BANK_TRANSFER",
            receiptNumber: `RCT-${sunday.getUTCFullYear()}-${String(receiptSeq).padStart(6, "0")}`,
            fundId: fund.id,
            memberId: chance(0.85) ? giver.id : null,
            recordedById: finance.id,
          },
        });
        contributionCount++;
      }
    }

    // Volunteer rota — one member per role, no double-booking.
    const taken = new Set<string>();
    for (const role of volunteerRoles) {
      const candidate = eligible.find((m) => !taken.has(m.id) && chance(0.35));
      if (!candidate) continue;
      taken.add(candidate.id);

      await prisma.volunteerAssignment.create({
        data: {
          memberId: candidate.id,
          eventId: service.id,
          roleId: role.id,
          status: isPast ? "COMPLETED" : chance(0.65) ? "CONFIRMED" : "PENDING",
          serviceHours: isPast ? new Prisma.Decimal("2.50") : null,
          createdById: deptHead.id,
        },
      });
      assignmentCount++;
    }

    // A midweek service every other week.
    if (week % 2 === 0) {
      const wednesday = daysAgo(week * 7 - 3);
      wednesday.setUTCHours(17, 30, 0, 0);
      const midweek = await prisma.event.create({
        data: {
          name: `Midweek Service — ${wednesday.toISOString().slice(0, 10)}`,
          type: "MIDWEEK_SERVICE",
          startsAt: wednesday,
          location: "Fellowship hall",
          createdById: admin.id,
        },
      });
      eventCount++;

      if (wednesday < new Date()) {
        for (const member of eligible.filter(() => chance(0.35))) {
          await prisma.attendance.create({
            data: { memberId: member.id, eventId: midweek.id, status: chance(0.9) ? "PRESENT" : "LATE", recordedById: deptHead.id },
          });
          attendanceCount++;
        }
      }
    }
  }

  console.log(`  ${eventCount} events, ${attendanceCount} attendance records`);
  console.log(`  ${contributionCount} contributions, ${assignmentCount} volunteer assignments`);

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
