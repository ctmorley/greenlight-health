# GreenLight by Medivis

**AI-Powered Prior Authorization for Imaging, Surgery & Procedures**

GreenLight automates the prior authorization (PA) lifecycle for healthcare providers — from submission through approval, denial management, and appeals. Built for imaging centers, surgical centers, and hospital systems.

**Production:** [greenlight-health-app.azurewebsites.net](https://greenlight-health-app.azurewebsites.net)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS 4 (dark theme) |
| Database | Azure PostgreSQL 16 Flexible Server + Prisma ORM |
| Auth | NextAuth v5 (credentials, invite-token flow) |
| AI | Anthropic Claude (clinical summarization, LMN, appeal drafting) |
| EHR | SMART on FHIR, Da Vinci CRD/DTR/PAS, 6 vendor adapters |
| Storage | Azure Blob Storage (documents) |
| Encryption | AES-256-GCM field-level PHI encryption + HMAC-SHA256 blind indexes |
| Observability | Azure Application Insights (OpenTelemetry) |
| Charts | Recharts |
| Validation | Zod |
| Testing | Vitest (API, 309 tests) + Playwright (e2e) |
| Hosting | Azure App Service (Linux, Node 20, standalone output) |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres (requires Docker)
npm run db:up

# 3. Push schema + seed demo data
npm run db:push
npm run db:seed

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in with:
- **Email:** `sarah.mitchell@metroadvan.com`
- **Password:** `password123`

---

## Project Structure

```
greenlight-health/
├── app/                        # Next.js App Router (all routes live here)
│   ├── route.ts                # GET / — serves the landing page
│   ├── layout.tsx              # Root HTML layout (fonts, metadata)
│   ├── globals.css             # Tailwind imports + global styles
│   │
│   ├── api/                    # ---- BACKEND (REST API) ----
│   │   ├── auth/[...nextauth]/ #   Login/logout/session
│   │   ├── register/           #   Create new accounts
│   │   ├── dashboard/stats/    #   Dashboard summary metrics
│   │   ├── requests/           #   CRUD for PA requests
│   │   │   └── [id]/
│   │   │       ├── status/     #     Change PA status (approve, deny)
│   │   │       ├── documents/  #     Upload/download clinical docs
│   │   │       ├── appeal/     #     File an appeal
│   │   │       ├── submit/     #     Submit a draft PA
│   │   │       └── timeline/   #     Status change history
│   │   ├── patients/           #   Patient CRUD + search
│   │   ├── payers/             #   Payer management + rules
│   │   │   └── [id]/rules/     #     Payer-specific PA rules
│   │   ├── denials/            #   Denied PA list
│   │   ├── appeals/[id]/       #   Appeal management
│   │   ├── analytics/          #   Charts and reporting data
│   │   │   ├── summary/        #     Summary table data
│   │   │   └── export/         #     CSV export
│   │   ├── settings/
│   │   │   ├── organization/   #   Org settings
│   │   │   └── users/          #   User management
│   │   └── users/physicians/   #   Physician lookup
│   │
│   └── app/                    # ---- FRONTEND (Pages) ----
│       ├── (auth)/             #   Auth pages (no sidebar)
│       │   ├── layout.tsx      #     Centered card layout
│       │   ├── login/          #     Login form
│       │   └── register/       #     Registration form
│       │
│       └── (protected)/        #   Main app (requires login)
│           ├── layout.tsx      #     App shell (sidebar + topbar)
│           ├── dashboard/      #     Dashboard with metrics & charts
│           ├── requests/       #     PA request list (search, filter)
│           │   ├── [id]/       #       Single PA detail view
│           │   │   ├── _components/  # Detail page cards
│           │   │   └── appeal/ #       File appeal page
│           │   └── new/        #       5-step PA submission wizard
│           │       ├── steps/  #         Step 1-5 components
│           │       └── hooks/  #         Draft save, audit, submit
│           ├── patients/       #     Patient directory
│           │   └── [id]/       #       Individual patient record
│           ├── denials/        #     Denial management
│           ├── analytics/      #     Charts and reporting
│           └── settings/       #     Org, users, payers config
│
├── components/                 # Reusable React components
│   ├── ui/                     #   Design system primitives
│   │   ├── button.tsx          #     Button variants
│   │   ├── card.tsx            #     Glass-morphism cards
│   │   ├── badge.tsx           #     Status badges
│   │   ├── input.tsx           #     Form inputs
│   │   ├── select.tsx          #     Dropdowns
│   │   ├── modal.tsx           #     Dialog modals
│   │   ├── toast.tsx           #     Notification toasts
│   │   ├── pagination.tsx      #     Page navigation
│   │   └── ...                 #     (empty-state, multi-select, dropdown)
│   ├── layout/
│   │   ├── sidebar.tsx         #   Left navigation bar
│   │   └── topbar.tsx          #   Top bar (org name, user menu)
│   ├── dashboard/
│   │   ├── metric-card.tsx     #   KPI metric cards
│   │   ├── status-donut-chart.tsx  # PA status distribution
│   │   ├── turnaround-trend-chart.tsx
│   │   ├── denial-reasons-chart.tsx
│   │   └── activity-feed.tsx   #   Recent PA activity
│   └── wizard/
│       ├── step-indicator.tsx  #   Wizard progress bar
│       ├── file-upload.tsx     #   Document upload
│       └── code-search-input.tsx  # CPT/ICD code search
│
├── lib/                        # Shared utilities
│   ├── prisma.ts               #   Database connection singleton
│   ├── auth.ts                 #   NextAuth config + credentials provider
│   ├── auth.config.ts          #   Auth session/callback config
│   ├── auth-types.ts           #   TypeScript types for auth
│   ├── status-transitions.ts   #   Valid PA status transitions
│   ├── cpt-codes.ts            #   Medical procedure code data
│   ├── denial-reasons.ts       #   Standardized denial reason codes
│   ├── reference-number.ts     #   PA reference number generator
│   └── document-path.ts        #   File upload path helper
│
├── prisma/
│   ├── schema.prisma           #   Database schema (all tables)
│   └── seed.ts                 #   Demo data (220 PAs, 50 patients, etc.)
│
├── e2e/                        #   Playwright end-to-end tests
│   ├── smoke.spec.ts           #     Auth + navigation
│   ├── sprint4-wizard.spec.ts  #     PA submission wizard
│   ├── sprint5-detail-status.spec.ts
│   ├── sprint6-denials-appeals.spec.ts
│   └── sprint7-analytics-settings.spec.ts
│
├── public/
│   ├── index.html              #   Marketing landing page (served at /)
│   └── landing.html            #   Older landing page copy
│
├── scripts/
│   ├── db-setup.sh             #   One-shot: Docker + push + seed
│   └── db-up.sh                #   Start Postgres via Docker
│
├── proposal.html               #   Business proposal (source for PDF)
├── generate-pdf.js             #   Puppeteer PDF generator
├── GreenLight_by_Medivis_Business_Proposal.pdf
│
├── middleware.ts                #   Route protection (redirects to login)
├── next.config.ts
├── tailwind — configured in globals.css (Tailwind v4)
├── tsconfig.json
├── docker-compose.yml          #   Local Postgres container
├── playwright.config.ts
└── .env                        #   Environment variables (not committed)
```

---

## How It All Connects

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER                                  │
│                                                                 │
│  Landing Page (/)          App (/app/*)                         │
│  ┌──────────────┐         ┌──────────────────────────────────┐ │
│  │ public/      │         │  (protected) layout               │ │
│  │ index.html   │         │  ┌────────┐ ┌──────────────────┐ │ │
│  │              │         │  │Sidebar │ │ Page Content     │ │ │
│  │ Static       │         │  │        │ │                  │ │ │
│  │ marketing    │         │  │ - Dash │ │ Fetches from     │ │ │
│  │ site         │         │  │ - PAs  │ │ /api/* routes    │ │ │
│  │              │         │  │ - Pts  │ │                  │ │ │
│  └──────────────┘         │  │ - Deny │ │ Uses components/ │ │ │
│                           │  │ - Ana  │ │ for UI           │ │ │
│                           │  │ - Set  │ │                  │ │ │
│                           │  └────────┘ └──────────────────┘ │ │
│                           └──────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP requests
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     NEXT.JS SERVER                               │
│                                                                  │
│  middleware.ts ── checks auth, redirects if not logged in        │
│                                                                  │
│  /app/api/*  ── REST endpoints                                   │
│  Each route.ts handles GET/POST/PUT/DELETE                       │
│  Uses Zod for input validation                                   │
│  Uses lib/auth.ts to check session                               │
│                                                                  │
│  lib/prisma.ts ── database queries                               │
│  lib/status-transitions.ts ── business logic                     │
└──────────────────────────────┬───────────────────────────────────┘
                               │ SQL queries via Prisma
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL                                   │
│                                                                  │
│  Tables: Organization, User, Patient, PatientInsurance,          │
│          PriorAuthRequest, AuthDocument, AuthStatusChange,       │
│          Payer, PayerRule, Denial, Appeal                         │
│                                                                  │
│  Defined in: prisma/schema.prisma                                │
│  Demo data:  prisma/seed.ts                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### Prior Authorization (PA) Status Flow

```
  ┌───────┐     ┌───────────┐     ┌─────────┐
  │ DRAFT │────▶│ SUBMITTED │────▶│ PENDING │
  └───────┘     └───────────┘     └────┬────┘
                                       │
                              ┌────────┼────────┐
                              ▼        ▼        ▼
                        ┌──────────┐ ┌──────┐ ┌─────────┐
                        │ APPROVED │ │DENIED│ │ EXPIRED │
                        └──────────┘ └──┬───┘ └─────────┘
                                        │
                                        ▼
                                   ┌──────────┐
                                   │ APPEALED │
                                   └────┬─────┘
                                        │
                                   ┌────┼────┐
                                   ▼         ▼
                             ┌──────────┐ ┌──────┐
                             │ APPROVED │ │DENIED│
                             └──────────┘ └──────┘
```

Status transitions are enforced in `lib/status-transitions.ts`.

### Route Groups (the parentheses folders)

Next.js uses folders in parentheses for **layout grouping** without affecting the URL:

- `(auth)` — Login/register pages share a centered card layout. URL: `/app/login`
- `(protected)` — App pages share the sidebar layout. URL: `/app/dashboard`

The parentheses don't appear in the URL.

### Dynamic Routes (the bracket folders)

Folders with `[brackets]` are **dynamic segments**:

- `/app/requests/[id]/page.tsx` → matches `/app/requests/abc123`
- `/api/payers/[id]/rules/[ruleId]/route.ts` → matches `/api/payers/xyz/rules/456`

The value inside the brackets becomes a parameter you can read in your code.

---

## Common Tasks

### Add a new API endpoint

1. Create a file at `app/api/your-resource/route.ts`
2. Export async functions named `GET`, `POST`, `PUT`, or `DELETE`
3. Use `prisma` from `lib/prisma.ts` for database queries
4. Use `auth()` from `lib/auth.ts` to check the user's session
5. Use `zod` to validate request body

### Add a new page

1. Create a folder under `app/app/(protected)/your-page/`
2. Add a `page.tsx` — this is the page component
3. Add a `loading.tsx` — shown while the page loads
4. Add a link in `components/layout/sidebar.tsx`

### Add a new UI component

1. Create a file in `components/ui/your-component.tsx`
2. Follow the existing pattern (export a typed React component)
3. Use Tailwind classes matching the dark theme

### Run tests

```bash
npm test                # Full Playwright suite
npm run test:smoke      # Quick smoke tests only
```

### Database changes

```bash
# Edit prisma/schema.prisma, then:
npm run db:push         # Push changes to database
npx prisma generate     # Regenerate the Prisma client
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/greenlight"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## NPM Scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run db:up` | Start Postgres via Docker |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:seed` | Seed database with demo data |
| `npm run db:setup` | One-shot: Docker + push + seed |
| `npm test` | Run Playwright e2e tests |
| `npm run test:smoke` | Run smoke tests only |
| `npm run generate-pdf` | Regenerate the business proposal PDF |
