--- description: Create a spec file and feature branch for the next OptiFlow feature argument-hint: "Step number and feature name e.g. 3 checklist-auto-generate" allowed-tools: Read, Write, Glob, Bash(git:*) ---

You are a senior developer spinning up a new feature for OptiFlow Ops —
an Express.js + Google Sheets + React SaaS for Indian SMEs.
Always follow the rules in CLAUDE.md.

User input: $ARGUMENTS

## Step 1 — Check working directory is clean

Run `git status` and check for uncommitted, unstaged, or untracked files.
If any exist, stop immediately and tell the user:
"Please commit or stash all changes before creating a new feature branch."
DO NOT CONTINUE until the working directory is clean.

## Step 2 — Parse the arguments

From $ARGUMENTS extract:

1. `step_number` — zero-padded to 2 digits: 3 → 03, 12 → 12
2. `feature_title` — human-readable title in Title Case
   - Example: "Checklist Auto Generate" or "Help Ticket Attachments"
3. `feature_slug` — git and file-safe slug
   - Lowercase, kebab-case, only a-z / 0-9 / hyphens, max 40 chars
   - Example: checklist-auto-generate, help-ticket-attachments
4. `branch_name` — format: `feature/`
   - Example: `feature/checklist-auto-generate`
5. `affected_apps` — which apps this feature touches:
   - `backend` — ops_backend only
   - `doer` — ops_doer_frontend only
   - `admin` — ops_admin_frontend only
   - `both-frontends` — both React apps
   - `full-stack` — all three apps
   Infer from the feature name. If genuinely ambiguous, ask before proceeding.

If step_number or feature_slug cannot be inferred, ask the user to clarify.

## Step 3 — Check branch name is not taken

Run `git branch` to list existing branches.
If `branch_name` already exists, append an incremented suffix:
`feature/checklist-auto-generate-01`, `-02`, etc.

## Step 4 — Switch to main and pull latest

```bash
git checkout main
git pull origin main
```

## Step 5 — Create and switch to the feature branch

```bash
git checkout -b 
```

## Step 6 — Research the codebase

Read these files before writing the spec:

- `CLAUDE.md` — architecture, conventions, sheet IDs, known bugs
- `ops_backend/server.js` — registered routes and middleware order
- `ops_backend/routes/` — all existing route files
- `ops_backend/googleSheetsClient.js` — getSheets() pattern
- `ops_backend/middleware/auth.js` — JWT verification pattern
- `ops_doer_frontend/src/` — existing screens and components (if doer affected)
- `ops_admin_frontend/src/` — existing screens and components (if admin affected)
- All files in `.claude/specs/` — avoid duplicating existing specs

Check CLAUDE.md to confirm this step is not already marked complete.
If it is, warn the user and stop.

Also flag if the feature touches the known `/api/delegations` double-registration
bug (server.js lines 35 + 39) — note it in the spec as a pre-existing risk.

## Step 7 — Write the spec

Generate a spec document with this exact structure:

---
# Spec: 

## Overview
One paragraph: what this feature does, which user (employee / admin / system)
it serves, and why it exists at this stage of the OptiFlow roadmap.

## Depends on
Which previous steps / features must be complete before this can be built.
State specific step numbers and feature names.

## Affected apps
- [ ] ops_backend
- [ ] ops_doer_frontend
- [ ] ops_admin_frontend

## API routes (backend)
Every new Express route needed:
- `METHOD /api/` — description — auth: public | employee JWT | admin JWT

If no new routes: state "No new routes."

Note any route that must respect the known delegations double-registration —
do not add a third registration for /api/delegations.

## Google Sheets changes
For each affected sheet (reference CLAUDE.md env vars):
- Sheet: `GOOGLE_SHEET_ID_*`
- Tab / range: e.g. `Master!A:K`
- Columns added / modified / read
- New rows appended or existing rows updated

Always verify against CLAUDE.md sheet definitions before writing this.
If no Sheets changes: state "No Sheets changes."

## Frontend changes

### ops_doer_frontend (employee app)
- **New screens:** list with route path
- **Modified screens:** list with what changes
- **New components:** list with file path

### ops_admin_frontend (admin app)
- **New screens:** list with route path
- **Modified screens:** list with what changes
- **New components:** list with file path

If a frontend is not affected: state "Not affected."

## Files to change
Every file that will be modified, across all three apps.

## Files to create
Every new file that will be created, with its path.

## Environment variables
Any new env vars needed in `ops_backend/.env` or frontend `.env`.
If none: state "No new env vars."

## Rules for implementation
Always include these. Add feature-specific rules below them.

- All API routes must be prefixed `/api/`
- Route handlers go in `ops_backend/routes/.js` — no logic in server.js
- Every handler calls `await getSheets()` at the top — no shared instance
- JWT auth via `middleware/auth.js` on every protected route
- Admin routes must check `req.user.role === 'admin'`
- All new record IDs generated with `nanoid()` — never Math.random()
- All dates formatted IST (UTC+5:30) as `dd/mm/yyyy hh:mm:ss` via local helper
- Cloudinary uploads go to the `help_tickets` folder — never derive folder from user input
- File uploads must validate MIME type (image/jpeg, image/png, image/webp only)
- Frequency codes validated as `['D','W','M']` — never written raw from request body
- Deadlines computed server-side via `getNextDeadline(freq)` — never from client
- No inline `style={{}}` in React — Tailwind classes only
- Brand colors: `#1A3A8F` (blue), `#00B4C8` (teal), `#7DD43F` (green), `#F4FBFF` (bg)
- Both frontends must mirror any changes to `src/api/axios.js` or `src/context/AuthContext.js`
- Error responses return `{ error: 'message' }` with correct HTTP status — no stack traces
- No new npm packages unless absolutely unavoidable — use existing dependencies

## Definition of done
A specific, testable checklist. Every item must be verifiable by running the app.
Include at least one item per affected app.

- [ ] `POST /api/` returns 201 with correct shape for valid input
- [ ] `POST /api/` returns 401 when no JWT is provided
- [ ] `POST /api/` returns 400 when required fields are missing
- [ ] Employee cannot access another employee's records (403/404)
- [ ] Admin route returns 403 for employee JWT
- [ ] Sheets row appended/updated with correct columns after successful call
- [ ] ops_doer_frontend: [specific UI behaviour visible to employee]
- [ ] ops_admin_frontend: [specific UI behaviour visible to admin]
- [ ] No `console.log` statements in committed code
- [ ] Jest tests written and passing for the new route
---

## Step 8 — Save the spec

Save to: `.claude/specs/-.md`

## Step 9 — Report to the user

Print a short summary in this exact format:

```
Branch:        
Spec file:     .claude/specs/-.md
Title:         
Affected apps: 
```

Then tell the user:
"Review the spec at `.claude/specs/-.md`
then enter Plan Mode with Shift+Tab twice to begin implementation."

Do not print the full spec in chat unless explicitly asked.