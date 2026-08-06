import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters — generate one with `node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"`"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

  // Any standard SMTP provider works here (Gmail app password, Resend,
  // SendGrid, ...). Leave blank in development — reset links are logged to
  // the console instead of emailed, so the flow is still fully testable.
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Church Management System <no-reply@church.local>"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // Fail loudly at boot rather than at the first request.
  console.error(`\nInvalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.\n`);
  process.exit(1);
}

export const env = parsed.data;

/** The assistant module degrades gracefully when no key is configured. */
export const assistantEnabled = env.GROQ_API_KEY.length > 0;

/** Without SMTP creds, password-reset links are logged instead of emailed. */
export const emailEnabled = env.SMTP_HOST.length > 0 && env.SMTP_USER.length > 0;
