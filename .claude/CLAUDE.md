# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Identity & Constraints

**OptiFlow - Ops** is a lightweight Employee Operations Portal for SMEs. Google Sheets is the intentional, permanent data store — it is the core USP enabling zero database server cost for clients. Never suggest replacing it with PostgreSQL, MongoDB, or any database server.

All improvements must stay within: Node.js/React ecosystem, Google sheet, Cloudinary free tier, FOSS tooling with no mandatory recurring SaaS cost.

---

## Monorepo Structure

```
ops_backend/          Express.js API (Node.js)
ops_doer_frontend/    React app — employee-facing
ops_admin_frontend/   React app — admin-facing (adds PDF export via jsPDF)
.claude/CLAUDE.md     This file
```

Both frontends are structurally identical (same component patterns, same auth flow). Any change to shared logic (`src/api/axios.js`, `src/context/AuthContext.js`, `src/components/`) must be mirrored in both apps manually — there is no shared package.

---

## Commands

### Backend
```bash
cd ops_backend
node server.js          # No npm start script — run directly
```
Default port: `3000`. Overridden by `PORT` env var. On hosted environments (e.g. Render), also set `BASE_URL` to the server's public URL — the cron job uses it for internal self-calls.

### Frontends
```bash
cd ops_doer_frontend    # or ops_admin_frontend
npm start               # Dev server (port 3000 by default)
npm run build           # Production build
```

No test runner is configured in any package.

---

## Environment Variables

### Backend (`ops_backend/.env`)
```
PORT=5000
BASE_URL=http://localhost:5000         # Used by cron self-call; set to public URL in prod

GOOGLE_SHEET_ID=                       # Employee accounts sheet
GOOGLE_SHEET_ID_CHECKLIST=             # Recurring checklist sheet
GOOGLE_SHEET_ID_DELEGATION=            # Task delegation sheet
GOOGLE_SHEET_ID_HELPTICKET=            # Help tickets sheet
GOOGLE_SHEET_ID_SUPPORTTICKET=         # Support tickets sheet

GOOGLE_SERVICE_ACCOUNT_EMAIL=          # Service account email
GOOGLE_PRIVATE_KEY=                    # RSA key with literal \n (handled in googleSheetsClient.js)

JWT_SECRET=                            # Must be a long random string in production
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

META_WA_PHONE_ID=
META_WA_BUSINESS_ID=
META_APP_SECRET=
META_WA_TOKEN=
META_WEBHOOK_VERIFY_TOKEN=
```

### Frontends (`.env` in each frontend root)
```
REACT_APP_BASE_URL=http://localhost:5000    # Backend URL — no trailing slash
PORT=3000                                   # Dev server port (optional)
```
Admin frontend additionally has `REACT_APP_META_WA_*` vars for client-side WhatsApp calls (current limitation — these tokens are exposed to the browser).

---

## Architecture

### Google Sheets Data Model

> **This schema is a living snapshot, not a contract.** Columns shift, new columns are appended, and new sheets are added as the system evolves. Always verify column indices against the actual route file before reading or writing a specific column. When you add or change columns, update the relevant route file comment AND the table below.

Five spreadsheets, each env-var referenced:

| Sheet | Tab | Columns | Key Env Var |
|---|---|---|---|
| Employee | `Employee` | A:L (12 cols) | `GOOGLE_SHEET_ID` |
| Checklist | `Master` | A:K (11 cols) | `GOOGLE_SHEET_ID_CHECKLIST` |
| Delegation | `DelegationMaster` | A:R (18 cols) | `GOOGLE_SHEET_ID_DELEGATION` |
| Help Tickets | — | — | `GOOGLE_SHEET_ID_HELPTICKET` |
| Support Tickets | — | — | `GOOGLE_SHEET_ID_SUPPORTTICKET` |

New sheets added to the system must get their own `GOOGLE_SHEET_ID_*` env var and be registered in `server.js` as a new route.

**Employee sheet column map — as of last update (verify in `routes/auth.js`):**
```
A: EmployeeID (nanoid 6)   B: Name           C: Mobile
D: Password (bcrypt)       E: Department     F: Created (ISO)
G: Company Name            H: DOB (DD/MM/YYYY) I: Joining Date
J: Profile Picture (URL)   K: Designation    L: Doer Name
```

**Delegation sheet column map — as of last update (verify in `routes/delegations.js`):**
```
A: TaskID (nanoid 6)   B: Assignee Name    C: TaskName
D: CreatedDate (IST)   E: Deadline         F: Revision1
G: Revision2           H: FinalDate        I: Revision count
J: Priority            K: Status           L: AssignBy/Followup
M: Week Monday date    N: Taskcompletedapproval
```

### Sheets Access Pattern

Every route handler calls `await getSheets()` from `googleSheetsClient.js` — a fresh authenticated client per request. Authentication uses service account credentials from env vars (`GOOGLE_PRIVATE_KEY` has `\\n` replaced with real newlines inside `getSheets()`).

All Sheets reads use `spreadsheets.values.get`, writes use `.update` or `.append`.

### Authentication Flow

1. Employee logs in via `POST /api/auth/login` → backend queries Employee sheet → bcrypt compares → JWT signed with `{ employeeID, name, department }`, expires `2d`
2. Token stored in `localStorage` as `"token"`, user object as `"user"`
3. Frontend axios instance (`src/api/axios.js`) attaches `Authorization: Bearer <token>` on every request; on 401/403 it clears localStorage and redirects to `/login`
4. `middleware/auth.js` verifies the token and sets `req.user` — routes then filter Sheets data by `req.user.name`
5. Admin auth: separate route `/api/adminauth/*` with its own sheet (Admin tab in Employee sheet or separate)

### Write Patterns

**Update a single row** (used in delegation update, done, shift, approve):
```
read all rows → findIndex by TaskID → modify row in memory → update single range A{n}:R{n}
```

**Delete a row** (risky under concurrency):
```
read all rows → splice(idx, 1) → write entire A2:R range back
```

**Append a new record:**
```
spreadsheets.values.append with valueInputOption: "USER_ENTERED"
```

**Retry wrapper** — used on critical writes (create task, mark done, approve):
```js
const writeWithRetry = async (retry = 3) => {
  try { await sheets...update(...) }
  catch (err) { if (retry === 0) throw err; await delay(1000); return writeWithRetry(retry - 1); }
};
```

### Cron Job — Monthly Task Auto-Generation

- Runs hourly: `cron.schedule('0 * * * *', ...)`
- Also fires 5s after server start
- Calls `POST /api/checklist/auto-generate-next-month` on itself via `fetch` with header `x-cron-job: true`
- Deduplication tracked in `ops_backend/last-generate.txt` (stores `"month-year"` string)
- Manual trigger: `POST /admin/generate-now` (no auth)
- Health check (includes generation state): `GET /health`

### File Uploads

`cloudinary.js` exports `parser` (a multer middleware). Use `parser.single('fieldName')` on routes that accept images. Files go to the `help_tickets` Cloudinary folder. Only `jpg`, `png`, `jpeg` are accepted.

---

## Coding Conventions

### Date Handling
- Storage format: `dd/mm/yyyy hh:mm:ss` in IST (UTC+5:30)
- `formatDateDDMMYYYYHHMMSS()` is copy-pasted into each route file that needs it — no shared util
- Parsing IST dates from Sheets: split on `/` and ` `, reconstruct as `new Date(year, month-1, day, ...)`
- Deadline dates stored as `yyyy-mm-dd` (ISO date only, no time)

### Checklist Frequency Codes
`D` = daily, `W` = weekly, `M` = monthly. `getNextDeadline(freq)` in `routes/checklist.js` computes the next deadline.

### IDs
All record IDs generated with `nanoid(6)` — 6-character URL-safe random strings.

### Route Naming
- Employee endpoints: `/api/auth/*`, `/api/employee/*`, `/api/delegations/*`, `/api/checklist/*`, `/api/helpTickets/*`, `/api/support-tickets/*`
- Admin endpoints: `/api/adminauth/*`, `/api/allDashboard/*`, `/api/whatsapp/*`, `/api/additionalfeature/*`
- All routes require the `auth` middleware except login, register, and the cron endpoint

---

## Known Issues (Do Not Make Worse)

1. **Duplicate route**: `/api/delegations` is registered twice in `server.js` (lines 35 and 39). Do not add a third registration.
2. **Delete race condition**: The row-delete pattern reads all rows, splices, then rewrites the full range. Concurrent deletes can corrupt data. Do not add more routes using this pattern without flagging it.
3. **WhatsApp tokens in frontend env**: `REACT_APP_META_WA_*` are browser-accessible. Any new WhatsApp API calls should go through the backend.
4. **`last-generate.txt` is ephemeral on serverless/ephemeral hosts**: If deploying to platforms that reset the filesystem (e.g., Render free tier), this file is lost on restart, causing re-generation. Consider this when debugging duplicate checklist entries.
5. **Large commented-out blocks** in `routes/delegations.js` — several old filter implementations remain. Do not uncomment them without testing; the active implementation is the bottom-most `router.get("/filter", ...)`.
