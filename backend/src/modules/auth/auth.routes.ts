import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { badRequest, unauthorized } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, signToken } from "../../middleware/auth";

export const authRouter = Router();

/** Brute-force protection on the only unauthenticated write endpoint. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

authRouter.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Compare against a dummy hash when the user is missing so that a wrong
    // email and a wrong password take the same amount of time to reject.
    const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) throw unauthorized("Incorrect email or password");
    if (!user.isActive) throw unauthorized("This account has been deactivated");

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      memberId: user.memberId,
    };
    audit(req, { action: "LOGIN", entity: "User", entityId: user.id, summary: `${user.email} signed in` });

    res.json({
      token: signToken(user.id),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        memberId: user.memberId,
      },
    });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

authRouter.post(
  "/change-password",
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    audit(req, { action: "UPDATE", entity: "User", entityId: user.id, summary: "Changed own password" });
    res.json({ message: "Password updated" });
  }),
);

// --- User administration (ADMIN only) -------------------------------------

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "FINANCE", "DEPT_HEAD", "VIEWER"]),
  memberId: z.string().uuid().nullish(),
});

authRouter.get(
  "/users",
  requireAuth,
  requireRole(),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ data: users });
  }),
);

authRouter.post(
  "/users",
  requireAuth,
  requireRole(),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
        memberId: body.memberId ?? null,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    audit(req, { action: "CREATE", entity: "User", entityId: user.id, summary: `Created ${user.email} as ${user.role}` });
    res.status(201).json({ data: user });
  }),
);

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "FINANCE", "DEPT_HEAD", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  memberId: z.string().uuid().nullish(),
  password: z.string().min(8).optional(),
});

authRouter.patch(
  "/users/:id",
  requireAuth,
  requireRole(),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateUserSchema>;
    const targetId = req.params.id!;

    // Guard against an admin locking themselves out of their own instance.
    if (targetId === req.user!.id && (body.role !== undefined || body.isActive === false)) {
      throw badRequest("You cannot change your own role or deactivate yourself");
    }

    const { password, ...rest } = body;
    const user = await prisma.user.update({
      where: { id: targetId },
      data: {
        ...rest,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    audit(req, { action: "UPDATE", entity: "User", entityId: user.id, summary: `Updated ${user.email}` });
    res.json({ data: user });
  }),
);
