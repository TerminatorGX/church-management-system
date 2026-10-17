import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, loginAs, authHeader } from "../../test/helpers";
import { prisma } from "../../lib/prisma";

describe("members", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.member.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("VIEWER can list members but cannot create one", async () => {
    const token = await loginAs("viewer@church.local");

    const list = await request(app).get("/api/members").set(authHeader(token));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const create = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "Should", lastName: "BeBlocked" });
    expect(create.status).toBe(403);
  });

  it("FINANCE can create a member and read it back", async () => {
    const token = await loginAs("finance@church.local");

    const create = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "vitest FIXTURE", lastName: `Member-${Date.now()}` });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);

    const get = await request(app).get(`/api/members/${create.body.data.id}`).set(authHeader(token));
    expect(get.status).toBe(200);
    // Names are normalised to title case on write — see backend/src/lib/validators.ts.
    expect(get.body.data.firstName).toBe("Vitest Fixture");
    expect(get.body.data.isActive).toBe(true);
  });

  it("rejects a member with no last name", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "OnlyFirstName" });
    expect(res.status).toBe(400);
  });

  it("normalises email to lowercase and phone to +260 format on write", async () => {
    const token = await loginAs("finance@church.local");
    const create = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({
        firstName: "Field",
        lastName: `Safeguards-${Date.now()}`,
        email: "  Mixed.Case@Church.LOCAL ",
        phone: "0971 234 567",
      });
    expect(create.status).toBe(201);
    createdIds.push(create.body.data.id);
    expect(create.body.data.email).toBe("mixed.case@church.local");
    expect(create.body.data.phone).toBe("+260971234567");
  });

  it("rejects an invalid email address", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "Bad", lastName: "Email", email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("rejects a phone number that isn't a valid Zambian mobile number", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "Bad", lastName: "Phone", phone: "12345" });
    expect(res.status).toBe(400);
  });

  it("rejects a date of birth in the future", async () => {
    const token = await loginAs("finance@church.local");
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const res = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "Future", lastName: "Baby", dateOfBirth: nextYear.toISOString().slice(0, 10) });
    expect(res.status).toBe(400);
  });

  it("rejects a baptism date before the date of birth", async () => {
    const token = await loginAs("finance@church.local");
    const res = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({
        firstName: "Early",
        lastName: "Baptism",
        dateOfBirth: "2000-01-01",
        baptismDate: "1999-01-01",
      });
    expect(res.status).toBe(400);
  });

  it("possible-duplicates reports a phone match as stronger evidence than a name-only match", async () => {
    const token = await loginAs("finance@church.local");
    const uniqueLastName = `DupTest-${Date.now()}`;

    const original = await request(app)
      .post("/api/members")
      .set(authHeader(token))
      .send({ firstName: "Chanda", lastName: uniqueLastName, phone: "0971111111" });
    expect(original.status).toBe(201);
    createdIds.push(original.body.data.id);

    // Same name, different phone — should surface, but only as a "name" match.
    const nameOnly = await request(app)
      .get("/api/members/possible-duplicates")
      .query({ firstName: "Chanda", lastName: uniqueLastName })
      .set(authHeader(token));
    expect(nameOnly.status).toBe(200);
    expect(nameOnly.body.data).toHaveLength(1);
    expect(nameOnly.body.data[0].matchedOn).toEqual(["name"]);

    // Same phone, totally different name — should still surface, as a phone match.
    const phoneOnly = await request(app)
      .get("/api/members/possible-duplicates")
      .query({ firstName: "Completely", lastName: "Different", phone: "0971111111" })
      .set(authHeader(token));
    expect(phoneOnly.status).toBe(200);
    expect(phoneOnly.body.data).toHaveLength(1);
    expect(phoneOnly.body.data[0].matchedOn).toEqual(["phone"]);

    // The member being edited is excluded from its own duplicate check.
    const excluded = await request(app)
      .get("/api/members/possible-duplicates")
      .query({ firstName: "Chanda", lastName: uniqueLastName, excludeId: original.body.data.id })
      .set(authHeader(token));
    expect(excluded.body.data).toHaveLength(0);
  });
});
