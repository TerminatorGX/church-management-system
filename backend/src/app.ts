import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth/auth.routes";
import { membersRouter } from "./modules/members/members.routes";
import { familiesRouter } from "./modules/families/families.routes";
import { departmentsRouter } from "./modules/departments/departments.routes";
import { eventsRouter } from "./modules/events/events.routes";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { fundsRouter } from "./modules/funds/funds.routes";
import { contributionsRouter } from "./modules/contributions/contributions.routes";
import { volunteersRouter } from "./modules/volunteers/volunteers.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { assistantRouter } from "./modules/assistant/assistant.routes";
import { auditRouter } from "./modules/audit/audit.routes";

export const createApp = () => {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  if (env.NODE_ENV !== "test") app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/members", membersRouter);
  app.use("/api/families", familiesRouter);
  app.use("/api/departments", departmentsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/funds", fundsRouter);
  app.use("/api/contributions", contributionsRouter);
  app.use("/api/volunteers", volunteersRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/assistant", assistantRouter);
  app.use("/api/audit-logs", auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
