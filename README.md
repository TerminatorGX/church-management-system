# Church Management System with CRM

A web-based church management system for congregations, built as a final-year
project. Members and families, attendance, a contributions ledger, volunteer
scheduling, a dashboard with PDF reporting, self-service password reset, and
an AI assistant that answers questions from the church's own data.

## Scope

Implemented:

- **Auth and roles** — JWT sign-in with four roles (admin, finance, department
  head, viewer) enforced on every endpoint, plus self-service "forgot
  password" email reset.
- **Member / family CRM** — profiles, contact details, households, departments,
  skills and interests, involvement history, CSV export.
- **Attendance tracking** — per-event rosters with bulk check-in and correction.
- **Contributions** — a receipted ledger across multiple funds. Recording only;
  there is no payment gateway.
- **Volunteer scheduling** — rotas per event, with suggestions ranked by declared
  skills and time since a member last served.
- **Dashboard** — attendance trend, membership growth, giving by month and fund,
  volunteer coverage, a pastoral follow-up list, and a one-click PDF report
  combining all of it.
- **AI assistant** — natural-language questions answered from live church data,
  scoped to the asker's role. Available as a full page and as a floating,
  page-aware chat bubble with suggested questions on every screen.

Deliberately excluded (per the project proposal): native mobile apps, payment
processing, third-party integrations (MailChimp, Twilio), hardware check-in
kiosks, multi-language support, and full double-entry accounting.

## Tech stack

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS 4, Recharts           |
| Backend   | Node.js, Express 4, TypeScript                                 |
| Database  | PostgreSQL via Prisma ORM, with row-level security enabled     |
| Auth      | JWT + bcrypt, email-based password reset (Nodemailer, any SMTP)|
| PDF       | pdfkit (dashboard report export)                                |
| AI        | Groq API — `openai/gpt-oss-20b` (tool use over your own data), free tier. Configurable via `GROQ_MODEL`; Groq periodically retires models, so check `GET https://api.groq.com/openai/v1/models` if the assistant starts erroring with `model_not_found`. |
| Testing   | Vitest + Supertest (backend), Vitest + React Testing Library (frontend) |

## Getting started

### 1. Prerequisites

- Node.js 18 or newer
- A PostgreSQL database (Supabase, Neon, Railway, or a local install)

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

- `DATABASE_URL` — your Postgres connection string. On **Supabase**, use the
  **Session pooler** string from Settings → Database. The older
  `db.<project-ref>.supabase.co` direct host no longer resolves.
- `JWT_SECRET` — generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `GROQ_API_KEY` — optional. Get a free key at
  [console.groq.com/keys](https://console.groq.com/keys) (no credit card).
  Leave blank and everything except the AI assistant still works.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` — optional. Any SMTP
  provider works (a Gmail app password is the free, no-signup option).
  **Leave blank and "forgot password" still works in development** — the
  reset link is logged to the backend console instead of emailed, so the
  whole flow is testable without a mail account.
- `FRONTEND_URL` — used to build the link inside the reset email. Defaults to
  `http://localhost:5173`; change it if you deploy the frontend elsewhere.

### 3. Create the schema and demo data

```bash
cd backend
npm install
npx prisma migrate deploy
npm run seed
```

`migrate deploy` applies the migrations already checked into
`prisma/migrations/` (schema tables, the password-reset token table, and the
row-level-security hardening migration) rather than generating new ones —
use `npx prisma migrate dev` instead only if you've changed `schema.prisma`
yourself.

The seed builds roughly six months of realistic history: 45 families, ~105
active members, weekly services with attendance, a contributions ledger, and
volunteer rotas.

### 4. Configure and start the frontend

```bash
cd frontend
cp .env.example .env
npm install
```

Then run both servers, each in its own terminal:

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

Open <http://localhost:5173>.

### 5. Sign in

The seed creates one account per role, all sharing the password you set as
`SEED_ADMIN_PASSWORD` in `backend/.env` (defaults to `CyberGod565617`):

| Email                   | Role            | Sees                                       |
| ----------------------- | --------------- | ------------------------------------------ |
| `admin@church.local`    | Administrator   | Everything, plus user management           |
| `finance@church.local`  | Finance         | Everything a dept head sees, plus giving   |
| `depthead@church.local` | Department head | Members, events, attendance, volunteers    |
| `viewer@church.local`   | Viewer          | Read-only; no giving data                  |

Forgotten a password? Use the "Forgot password?" link on the sign-in page. If
`SMTP_HOST` isn't configured, the reset link is printed to the backend's
terminal output instead of emailed.

## Project layout

```
backend/
  prisma/
    schema.prisma          data model
    migrations/            checked-in, ordered schema history
    seed.ts                demo data generator
  src/
    config/env.ts          validated environment config
    lib/                   prisma client, errors, CSV, PDF, mailer, audit log
    middleware/            auth, RBAC, validation, error handling
    modules/
      auth/                sign-in, password reset, user admin (+ tests)
      members/  families/  departments/
      events/   attendance/
      funds/    contributions/               (+ tests)
      volunteers/
      dashboard/           chart aggregations, PDF report
      assistant/           Groq tool-use integration
    test/helpers.ts        shared supertest app + memoized login
    app.ts  index.ts

frontend/
  src/
    components/            shared UI, layout, charts, floating assistant
    context/AuthContext    session state
    hooks/                 data fetching (abort + debounce), assistant chat
    lib/                   API client, types, formatters              (+ tests)
    pages/                 one file per screen                        (+ tests)
    test/setup.ts           jest-dom matchers for Vitest
```

## Notes on the implementation

**Money is `Decimal(12,2)`, never a float.** Floating-point arithmetic silently
loses cents, which is unacceptable in a ledger a church has to account for.

**Deletes are soft where history matters.** Archiving a member keeps their
attendance and contribution records, so financial reporting for past years stays
correct. Funds with contributions cannot be deleted at all.

**The AI assistant only reads.** It has eleven read-only query tools and re-checks
the caller's role inside each one, so a department head cannot reach giving data
by asking the assistant instead of using the UI. It runs on Groq's free tier —
rate limiting is deliberately conservative (an app-wide cap, not per-user,
since the free tier is one shared budget) to avoid exhausting it.

**Every mutation writes an audit log** (who, what, when, from which IP), which
the proposal's data-protection section calls for.

**Password reset tokens are single-use and never stored raw.** Only a SHA-256
hash of the token lives in the database; the email response is identical
whether or not the address matches an account, to avoid leaking who has a
login. Requesting a new reset link invalidates any earlier one.

**Row-level security is enabled on every table.** Supabase (and similar
managed-Postgres platforms) expose a REST API over the database by default,
separate from and in addition to this app's own Express backend — without
RLS, anyone holding the project's public `anon` key could read or write every
row directly, bypassing this app's auth entirely. RLS is on with zero
policies (default-deny for that API); this app's own database connection is
unaffected because it authenticates as the Postgres role that owns the
tables, which Postgres never subjects to RLS.

## Testing

```bash
cd backend && npm test     # Vitest + Supertest, against your configured DATABASE_URL
cd frontend && npm test    # Vitest + React Testing Library
```

Vitest is used in both packages instead of the Jest/RTL/Supertest combination
named in the original proposal — Jest needs extra transform configuration to
work with Vite's ESM-first toolchain, whereas Vitest is Vite-native and
Jest-API-compatible, so the substitution doesn't cost anything in coverage or
approach.

The backend suite runs real HTTP requests against the actual app (via
Supertest) and a **real database** — there's no separate test database
provisioned, so it runs against whatever `DATABASE_URL` is configured, using
the seeded demo accounts to authenticate. Any records a test creates (a
member, a contribution) are deleted again in that file's `afterAll`. Run
`npm run seed` at least once before `npm test` if you haven't already, and
expect it to take under a minute — most of that is real network latency to
Postgres, not slow tests.

## Available scripts

| Location   | Command              | Does                                       |
| ---------- | -------------------- | ------------------------------------------- |
| `backend`  | `npm run dev`        | Start the API with hot reload               |
| `backend`  | `npm run seed`       | Reset and reseed demo data                  |
| `backend`  | `npm run studio`     | Open Prisma Studio to browse the database   |
| `backend`  | `npm run typecheck`  | Type-check without emitting                 |
| `backend`  | `npm test`           | Run the API test suite                      |
| `backend`  | `npm run build`      | Compile to `dist/`                          |
| `frontend` | `npm run dev`        | Start Vite dev server                       |
| `frontend` | `npm run typecheck`  | Type-check without emitting                 |
| `frontend` | `npm test`           | Run the component/unit test suite           |
| `frontend` | `npm run build`      | Production build                            |

