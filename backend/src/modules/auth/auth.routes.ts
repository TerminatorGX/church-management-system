import { randomBytes, createHash } from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { badRequest, unauthorized } from "../../lib/http-error";
import { audit } from "../../lib/audit";
import { sendPasswordResetEmail } from "../../lib/mailer";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, signToken } from "../../middleware/auth";
import { emailField, nameField } from "../../lib/validators";

export const authRouter = Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Brute-force protection on the only unauthenticated write endpoint. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

authRouter.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({
      where: { email },
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

// --- Forgot / reset password ------------------------------------------------

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many reset requests. Try again in 15 minutes." },
});

const forgotPasswordSchema = z.object({ email: emailField });

/** Generic reply either way — confirming or denying an email exists is a user-enumeration leak. */
const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

authRouter.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof forgotPasswordSchema>;

    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.isActive) {
      const rawToken = randomBytes(32).toString("hex");

      await prisma.$transaction([
        // Only one live reset link per account at a time.
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(rawToken),
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        }),
      ]);

      const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
      try {
        await sendPasswordResetEmail(user.email, user.name, resetUrl);
      } catch (err) {
        // The token is already stored — a delivery failure shouldn't change
        // the response (that would leak whether the email existed), just log it.
        console.error("[auth] failed to send password reset email:", err);
      }
    }

    res.json({ message: GENERIC_RESET_MESSAGE });
  }),
);

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

authRouter.post(
  "/reset-password",
  forgotPasswordLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body as z.infer<typeof resetPasswordSchema>;

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest("This reset link is invalid or has expired. Request a new one.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Atomically flip usedAt from null -> now. Postgres only lets one of two
    // concurrent submissions of the same token win this update, so this is
    // the actual single-use gate — the earlier check above is just for a
    // fast, friendly rejection on the already-used/expired common case.
    const claimed = await prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw badRequest("This reset link is invalid or has expired. Request a new one.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // Using one reset link invalidates any others outstanding for the account.
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    audit(req, {
      action: "UPDATE",
      entity: "User",
      entityId: record.userId,
      summary: `${record.user.email} reset their password`,
    });

    res.json({ message: "Password reset. Sign in with your new password." });
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
  email: emailField,
  name: nameField("Name"),
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
        email: body.email,
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
  name: nameField("Name").optional(),
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
