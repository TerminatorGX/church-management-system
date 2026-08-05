import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/async-handler";
import { forbidden, notFound } from "../../lib/http-error";
import { validate } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import { assistantEnabled } from "../../config/env";
import { askAssistant, titleFrom } from "./assistant.service";

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

/**
 * Groq's free tier is ONE shared budget for the whole app, not per end-user —
 * so this limiter keys on a constant instead of the caller, deliberately
 * conservative to leave headroom under the account-wide ceiling.
 */
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: () => "global",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "The assistant is busy right now. Wait a minute and try again." },
});

/**
 * A second, coarser guard on top of the per-minute limiter: caps total
 * questions per day so a quiet-but-steady trickle of use across the day
 * can't exhaust the free tier's daily request quota. Resets at UTC midnight;
 * in-memory is fine here — worst case a restart gives back a day early.
 */
const DAILY_LIMIT = 200;
let dailyCount = 0;
let dailyResetAt = new Date().setUTCHours(24, 0, 0, 0);

const dailyBudgetGuard = (_req: Request, res: Response, next: NextFunction) => {
  if (Date.now() >= dailyResetAt) {
    dailyCount = 0;
    dailyResetAt = new Date().setUTCHours(24, 0, 0, 0);
  }
  if (dailyCount >= DAILY_LIMIT) {
    return res
      .status(429)
      .json({ error: "The assistant has reached today's question limit. Try again tomorrow." });
  }
  dailyCount++;
  next();
};

assistantRouter.get("/status", (_req, res) => {
  res.json({
    data: {
      enabled: assistantEnabled,
      message: assistantEnabled
        ? null
        : "Set GROQ_API_KEY in backend/.env to turn on the assistant.",
    },
  });
});

assistantRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const data = await prisma.conversation.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
    });
    res.json({ data });
  }),
);

assistantRouter.get(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id! },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation) throw notFound("Conversation not found");
    if (conversation.userId !== req.user!.id) throw forbidden("That conversation is not yours");

    res.json({ data: conversation });
  }),
);

assistantRouter.delete(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id! } });
    if (!conversation) throw notFound("Conversation not found");
    if (conversation.userId !== req.user!.id) throw forbidden("That conversation is not yours");

    await prisma.conversation.delete({ where: { id: conversation.id } });
    res.json({ message: "Conversation deleted" });
  }),
);

const askSchema = z.object({
  question: z.string().trim().min(1, "Ask a question").max(2000, "That question is too long"),
  conversationId: z.string().uuid().nullish(),
});

assistantRouter.post(
  "/ask",
  askLimiter,
  dailyBudgetGuard,
  validate(askSchema),
  asyncHandler(async (req, res) => {
    const { question, conversationId } = req.body as z.infer<typeof askSchema>;
    const user = req.user!;

    let conversation = conversationId
      ? await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
        })
      : null;

    if (conversation && conversation.userId !== user.id) {
      throw forbidden("That conversation is not yours");
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, title: titleFrom(question) },
        include: { messages: true },
      });
    }

    const reply = await askAssistant(
      user,
      conversation.messages.map((m) => ({ role: m.role, content: m.content })),
      question,
    );

    // Persist both turns together so a crash can't leave a question with no answer.
    const [, assistantMessage] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId: conversation.id, role: "USER", content: question },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: reply.text,
          toolsUsed: [...new Set(reply.toolsUsed)],
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    res.json({
      data: {
        conversationId: conversation.id,
        message: assistantMessage,
      },
    });
  }),
);
