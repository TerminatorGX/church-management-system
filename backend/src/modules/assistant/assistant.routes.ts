import { Router } from "express";
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

/** Each call costs money — cap it per user rather than per IP. */
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "You are sending questions too quickly. Wait a minute and try again." },
});

assistantRouter.get("/status", (_req, res) => {
  res.json({
    data: {
      enabled: assistantEnabled,
      message: assistantEnabled
        ? null
        : "Set ANTHROPIC_API_KEY in backend/.env to turn on the assistant.",
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
