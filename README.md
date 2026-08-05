# Church Management System with CRM

A web-based church management system for congregations, built as a final-year
project. Members and families, attendance, a contributions ledger, volunteer
scheduling, a dashboard, and an AI assistant that answers questions from the
church's own data.

## Scope

Implemented:

- **Auth and roles** — JWT sign-in with four roles (admin, finance, department
  head, viewer) enforced on every endpoint.
- **Member / family CRM** — profiles, contact details, households, departments,
  skills and interests, involvement history, CSV export.
- **Attendance tracking** — per-event rosters with bulk check-in and correction.
- **Contributions** — a receipted ledger across multiple funds. Recording only;
  there is no payment gateway.
- **Volunteer scheduling** — rotas per event, with suggestions ranked by declared
  skills and time since a member last served.
- **Dashboard** — attendance trend, membership growth, giving by month and fund,
  volunteer coverage, and a pastoral follow-up list.
- **AI assistant** — natural-language questions answered from live church data,
  scoped to the asker's role.

Deliberately excluded (per the project proposal): native mobile apps, payment
processing, third-party integrations (MailChimp, Twilio), hardware check-in
kiosks, multi-language support, and full double-entry accounting.

## Tech stack

| Layer     | Choice                                              |
| --------- | --------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS 4, Recharts |
| Backend   | Node.js, Express 4, TypeScript                       |
| Database  | PostgreSQL via Prisma ORM                            |
| Auth      | JWT + bcrypt                                         |
| AI        | Anthropic Claude API (tool use over your own data)   |

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
- `ANTHROPIC_API_KEY` — optional. Leave blank and everything except the
  assistant still works.

### 3. Create the schema and demo data

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run seed
```

The seed builds roughly six months of realistic history: 45 families, ~120
members, weekly services with attendance, a contributions ledger, and volunteer
rotas.

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

The seed creates one account per role (password `ChangeMe123!`, or whatever you
set as `SEED_ADMIN_PASSWORD`):

| Email                   | Role            | Sees                                       |
| ----------------------- | --------------- | ------------------------------------------ |
| `admin@church.local`    | Administrator   | Everything, plus user management           |
| `finance@church.local`  | Finance         | Everything a dept head sees, plus giving   |
| `depthead@church.local` | Department head | Members, events, attendance, volunteers    |
| `viewer@church.local`   | Viewer          | Read-only; no giving data                  |

## Project layout

```
backend/
  prisma/
    schema.prisma          data model
    seed.ts                demo data generator
  src/
    config/env.ts          validated environment config
    lib/                   prisma client, errors, CSV, audit log
    middleware/            auth, RBAC, validation, error handling
    modules/
      auth/                sign-in, password change, user admin
      members/  families/  departments/
      events/   attendance/
      funds/    contributions/
      volunteers/
      dashboard/           chart aggregations
      assistant/           Claude tool-use integration
    app.ts  index.ts

frontend/
  src/
    components/            shared UI, layout, charts
    context/AuthContext    session state
    hooks/useApi           fetching with abort + debounce
    lib/                   API client, types, formatters
    pages/                 one file per screen
```

## Notes on the implementation

**Money is `Decimal(12,2)`, never a float.** Floating-point arithmetic silently
loses cents, which is unacceptable in a ledger a church has to account for.

**Deletes are soft where history matters.** Archiving a member keeps their
attendance and contribution records, so financial reporting for past years stays
correct. Funds with contributions cannot be deleted at all.

**The AI assistant only reads.** It has six read-only query tools and re-checks
the caller's role inside each one, so a department head cannot reach giving data
by asking the assistant instead of using the UI.

**Every mutation writes an audit log** (who, what, when, from which IP), which
the proposal's data-protection section calls for.

## Available scripts

| Location   | Command              | Does                                     |
| ---------- | -------------------- | ---------------------------------------- |
| `backend`  | `npm run dev`        | Start the API with hot reload            |
| `backend`  | `npm run seed`       | Reset and reseed demo data               |
| `backend`  | `npm run studio`     | Open Prisma Studio to browse the database |
| `backend`  | `npm run typecheck`  | Type-check without emitting              |
| `backend`  | `npm run build`      | Compile to `dist/`                       |
| `frontend` | `npm run dev`        | Start Vite dev server                    |
| `frontend` | `npm run build`      | Production build                         |

## Licence

MIT
