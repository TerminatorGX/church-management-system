import { createApp } from "./app";
import { env, assistantEnabled } from "./config/env";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`\n  Church Management System API`);
  console.log(`  ---------------------------------------------`);
  console.log(`  http://localhost:${env.PORT}      (${env.NODE_ENV})`);
  console.log(`  CORS origin: ${env.CORS_ORIGIN}`);
  console.log(`  AI assistant: ${assistantEnabled ? `on (${env.GROQ_MODEL})` : "off — no GROQ_API_KEY"}`);
  console.log(`  ---------------------------------------------\n`);
});

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down.`);
  server.close(() => void 0);
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
