<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Bootstrap exception: before Next.js is installed, if `node_modules/next/dist/docs/` is absent, use current official Next.js documentation only for scaffold decisions. Immediately after installation, switch to the bundled version-matched documentation.

# Job Search OS — Agent Guide

## Scope and sources of truth

- This file defines durable repository constraints, verification requirements, and review rules for the whole repository.
- `PROJECT_PLAN.md` is the product roadmap and domain context. This file governs execution when the roadmap is less specific.
- Roadmap items and “next actions” describe intent but do not authorize external state changes such as creating cloud projects, pushing, deploying, or mutating a remote database.
- Explicit user instructions override repository guidance. If an instruction would materially change the MVP, data model, auth model, or deployment architecture, surface the conflict and ask before proceeding.
- Treat unrequested ideas as backlog suggestions, not approved work. Mention them in the final report; update the `PROJECT_PLAN.md` “Possible next features” section only when explicitly asked.

## Specification governance

- Every specification must declare `Status` (`Draft`, `Accepted`, or `Superseded`), `Approved by`, `Approved on`, `Revision`, and `Open questions`, and must include short `Rationale` and `Consequences` sections.
- A specification is executable only when its status is `Accepted`, every open question is resolved, and the project owner has approved the current revision. Execution remains limited by the specification's stated scope and does not authorize external state changes unless those actions are explicitly approved.
- Every specification must include a short `Constraints and references` section linking only to the rules in this file that are relevant to its scope. Relevant rules may include verified claims, authentication redirects, RLS `USING` and `WITH CHECK`, server-side validation, and WCAG requirements.
- Do not copy durable rules from this file verbatim into each specification. Link to them and make the implementation and review acceptance criteria explicitly confirm compliance.

## Product and MVP boundaries

Build a personal job-search operating system whose first user is the project author. The MVP should replace a spreadsheet and scattered notes for daily application tracking.

Build only:

- Supabase email authentication;
- job applications with manual CRUD and high-level statuses;
- interview rounds, notes, a next action, and completion state;
- a Today view for due and overdue actions, upcoming interviews, and applications without a next action.

Do not build yet:

- AI resume generation, job advice, or inferred candidate facts;
- job-board scraping, mass URL import, or a browser extension;
- email or calendar integrations;
- mobile, Apple Watch, payments, billing, teams, or multi-tenant SaaS features.

Do not expand the MVP without explicit approval.

## Domain invariants

- Application statuses are `saved`, `applied`, `active`, `offer`, and `closed`. Display labels may change, but do not add workflow statuses without approval.
- Interview stages belong inside an application and are not board statuses.
- Supabase Auth `auth.users` is the only user source in the MVP. Do not create a separate users or profiles table.
- `applications.user_id` is the direct ownership root. Interviews, notes, and next actions are owned transitively through `application_id`. Ownership is enforced in PostgreSQL and every child authorization check and RLS policy must verify it through the parent application, not infer it only from UI state.
- Evaluate Today in the authenticated user's IANA time zone. Until a user setting exists, use `Europe/Warsaw`; never use the Vercel server's local date as the product date.
- Store a date-only next action as PostgreSQL `date`. Store an interview or other exact moment as PostgreSQL `timestamptz` and convert it at display boundaries.
- Every query powering Today must exclude applications with status `closed` before grouping or sorting records. This exclusion applies to overdue and due-today next actions, upcoming interviews, and applications without an incomplete next action.
- Among non-closed applications, an incomplete next action is due when `action_date` equals the user's local date and overdue when it is earlier. An incomplete interview is upcoming when `scheduled_at` is later than now; order upcoming interviews by `scheduled_at ASC`. Applications without an incomplete next action also appear in Today.
- Test date logic around local midnight and daylight-saving transitions.

## Runtime, dependencies, and commands

- Use Node.js 24 LTS. Pin it in repository runtime metadata when scaffolding the app.
- Use the latest patched stable Next.js 16 release supported by the repository; do not use a version older than `16.2.11`. Do not use canary, preview, or experimental APIs without explicit approval.
- Use TypeScript in strict mode. Do not suppress type, lint, or build failures with broad ignores, `any`, `@ts-ignore`, disabled rules, or framework ignore flags unless a narrow exception is documented and justified.
- Standardize on `npm`, commit only `package-lock.json`, and pin the package manager with the `packageManager` field. Do not create a second lockfile.
- On Windows PowerShell, if the `npm.ps1` shim is blocked by the execution policy, invoke the same commands through `npm.cmd`; do not weaken the machine's execution policy to work around it.
- Before scaffolding, make this directory the Git repository root so this `AGENTS.md` remains active for the whole codebase.
- This root already contains planning documents. Do not run `create-next-app` directly against a non-empty root or overwrite those documents. Generate a disposable child scaffold with the stable CLI and no install/Git side effects, for example on this Windows host: `npx.cmd create-next-app@latest job-search-os-scaffold --ts --tailwind --eslint --app --src-dir --use-npm --import-alias "@/*" --skip-install --disable-git`.
- Before running that command, verify the child target does not already exist. After generation, inspect its contents and transfer only the app/configuration files into the repository root using native filesystem operations. Preserve the root `AGENTS.md` and `PROJECT_PLAN.md`; do not copy generated instruction duplicates, `.git`, or `node_modules`. Set the package name to `job-search-os`, review the resulting tree, then remove the disposable scaffold only after verifying its resolved path is inside this repository and all required files were transferred.
- Prefer the existing platform and dependency set. Planned Next.js, React, Tailwind CSS, shadcn/ui, Supabase, and Playwright dependencies are allowed; ask before adding any other production dependency.
- Until `package.json` exists, do not invent commands or claim automated checks passed. The application scaffold must add working scripts for the commands below and update this section if names differ.
- Verification scripts must be deterministic, non-interactive, and exit with a nonzero status on failure; `npm test` must run once rather than enter watch mode.
- Configure `typecheck` to generate Next.js route types before `tsc --noEmit` when required; do not rely on `.next` artifacts left by a previous dev server or build.
- After scaffolding, document prerequisites, environment setup, and these commands in `README.md`. GitHub CI must invoke the same scripts rather than maintain a divergent command path.

Canonical commands after scaffolding:

- clean install: `npm ci`;
- local development: `npm run dev`;
- lint: `npm run lint`;
- type check: `npm run typecheck`;
- unit/integration tests: `npm test`;
- end-to-end tests: `npm run test:e2e`;
- production build: `npm run build`;
- local database rebuild, once Supabase is configured: `npm run db:reset`;
- database/RLS tests, once Supabase is configured: `npm run db:test`;
- generated database types, once Supabase is configured: `npm run db:types`.

Never report a command as passing unless it was run successfully. Report every skipped or failed check and the reason.

## Architecture and code organization

- Use one repository and one modular Next.js application deployed to Vercel. Do not create a separate Express/Nest backend, microservice, or second repository without approval.
- Use the App Router, Tailwind CSS, and shadcn/ui. Prefer platform conventions over custom framework abstractions.
- Use Server Components by default. Add `'use client'` only at the smallest leaf boundary that needs browser state, effects, event handlers, or browser APIs.
- Keep secrets, privileged data access, and authorization helpers in server-only modules. Mark server-only boundaries with `server-only` where appropriate.
- Today is composed by the `today` feature through its own server-side use-case/query layer. Features must not import another feature's private internals; cross-feature access is allowed only through explicitly exported public APIs or contracts.
- `applications` owns the application domain and ownership root. `interviews`, `notes`, and `next-actions` belong to an application and must not bypass the application ownership path.
- Client Components must never import server-only code, database clients, data-access-layer modules, or Supabase service-level access. Browser-side authentication may use an explicitly exported client-safe auth adapter, but the low-level Supabase browser client remains encapsulated inside that adapter.
- Read user data in Server Components through a small server-side data access layer; do not call the application's own Route Handlers from Server Components.
- Use Server Actions for first-party UI mutations. Use Route Handlers only when a real HTTP endpoint is required.
- For every operation that reads or mutates protected application data, authenticate and authorize inside the Server Action, Route Handler, or data-access function. Page, layout, Proxy, and client-side checks are not authorization boundaries. Public sign-up, sign-in, and auth callback endpoints are the narrow exception and follow the public-auth rules below.
- Do not place personalized applications, interviews, notes, or actions in a shared Next.js cache. Any future user-scoped caching requires an explicit identity-bearing key, safe invalidation, and security review. Do not use experimental private caching in production.

Target structure after scaffolding:

- `src/app` — routes, layouts, loading/error boundaries, and composition;
- `src/features/auth`, `src/features/applications`, `src/features/interviews`, `src/features/notes`, `src/features/next-actions`, and `src/features/today` — domain UI, queries, actions, and validation;
- `src/components/ui` — shadcn/ui and genuinely shared presentation components;
- `src/lib/supabase` — browser client, server client, and session-refresh helpers;
- `supabase/migrations` — version-controlled forward database migrations;
- `supabase/tests` — database and RLS tests;
- `tests/e2e` — Playwright tests.

Keep domain modules cohesive and avoid creating parallel patterns for the same responsibility.

## Authentication, authorization, and privacy

- Use `@supabase/ssr` with separate browser and server clients. On Next.js 16, use `proxy.ts` only to refresh tokens and perform optimistic redirects.
- Use `supabase.auth.getClaims()` to verify identity in trusted server code. Do not use the user object from `getSession()` for authorization.
- Use Supabase Auth `auth.users` as the only identity source. Do not create or infer a separate application profile in the MVP.
- Public sign-up, sign-in, and auth callback endpoints do not require an existing user session. They must still validate all inputs, use an allowlist of same-origin redirect targets, reject arbitrary return URLs, avoid leaking account-existence details, and fail closed on token or state errors.
- Derive `applications.user_id` from verified auth claims. Never trust a `user_id`, ownership field, role, or status transition supplied by the client. Authorize child records through their parent `application_id` in both server code and RLS policies.
- Validate all untrusted form, URL, query, and JSON input on the server before database access. Enforce important invariants again with PostgreSQL constraints.
- Enable RLS on every user-data table in an exposed schema. Policies must target the intended role and cover each required `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, including both `USING` and `WITH CHECK` where applicable. Exposed views must use `security_invoker = true` or be inaccessible to `anon` and `authenticated` roles.
- Prevent ownership reassignment through updates. Child records must have a verifiable ownership path to the authenticated user. Index ownership and foreign-key columns used by RLS policies.
- Test that an unauthenticated user and user A cannot read, create for, update, or delete user B's records.
- Use `NEXT_PUBLIC_JOB_SEARCH_SUPABASE_URL` and `JOB_SEARCH_SUPABASE_PUBLISHABLE_KEY` in public clients. A Supabase publishable key is public by design; access control still depends on Auth and RLS.
- Do not expose or normally introduce `sb_secret_*` or legacy `service_role` credentials in this MVP. They bypass RLS and must never enter client code, source control, logs, screenshots, fixtures, or error output.
- Keep local values in ignored `.env.local` files. Maintain `.env.example` with variable names and safe placeholders only, and fail clearly when required variables are missing.
- Treat job URLs, company history, interview notes, and action text as private user data. No screenshot, fixture, log, telemetry event, snapshot, seed record, error output, commit, pull request, or deployed preview may contain real personal job-search data without explicit approval scoped to the exact data and artifact. E2E artifacts always use synthetic data and must never contain real personal job-search data.
- Synthetic fixtures, explicitly marked demo records, and sanitized screenshots are allowed for development, tests, documentation, and public presentation. Portfolio and documentation screenshots must never contain the author's real job-search data without explicit approval.
- Return only fields required by the UI; do not pass whole auth or database records to Client Components.

## Database workflow and remote-operation safety

- `supabase/migrations` is the source of truth for database structure. Do not make Dashboard-only or untracked SQL changes.
- Use forward, version-controlled migrations. Do not rewrite a migration already applied to a shared or production database.
- A task that explicitly requests database-backed behavior may include the smallest required local migration after the schema change is stated in the plan. Ask before a material or ambiguous schema design change.
- Every schema change must include reviewed SQL, relevant constraints and indexes, RLS policies, database/RLS tests, regenerated TypeScript database types, and a successful local rebuild when tooling is available.
- Use explicit local/linked flags for Supabase CLI commands when ambiguity is possible. Preview remote changes with `supabase db push --dry-run`.
- Never run `supabase db reset --linked`, seed production, delete production records, or apply destructive remote SQL.
- Do not create or link Supabase/Vercel projects, mutate a remote database, change remote environment variables, push, or deploy unless the user explicitly requests that external action.
- Keep Development, Preview, and Production credentials and data isolated. Preview and E2E must never write to the production database or use Production data. E2E always uses isolated synthetic users and records. A deployed Preview may contain real personal job-search data only after explicit approval scoped to that Preview and must still use an isolated non-production environment.
- Vercel is the deployment target, but a code change does not by itself authorize deployment. Verify a preview before production promotion when deployment is requested.

## UX and accessibility baseline

- Handle loading, empty, success, validation-error, authorization-error, and unexpected-error states for user-facing operations.
- Critical flows should meet WCAG 2.2 AA: semantic elements, programmatic labels, visible focus, complete keyboard operation, meaningful error association, and sufficient contrast.
- Forms must expose pending state, prevent accidental duplicate submission, preserve recoverable input on validation failure, and move focus appropriately after errors or modal transitions.
- Verify responsive behavior at narrow mobile and desktop widths even though a native mobile app is out of scope.
- Before a public production launch, review CSP and baseline security headers. Paid WAF, monitoring, or analytics services require approval.

## Tests and verification

- Test user-visible behavior, not implementation details. In Playwright, prefer role, label, and text locators; keep tests isolated and in control of their own users and data.
- Add focused unit tests for domain rules, especially statuses, next-action completion, Today grouping, time zones, local midnight, and DST.
- Add database tests for constraints and RLS, including positive access and cross-user denial for every CRUD operation used by the application.
- The critical Playwright flow is: sign up or sign in → create an application → add an interview and note → set a next action → update status → verify Today/overdue behavior → reload and verify persistence.
- Do not make E2E depend on test order, production state, third-party job sites, or real accounts.

Minimum verification matrix:

- documentation-only change: inspect rendered Markdown and check links/commands against the repository;
- TypeScript or React behavior change: `npm run lint`, `npm run typecheck`, focused tests, and `npm run build`;
- database or RLS change: all TypeScript checks plus `npm run db:reset`, `npm run db:test`, and `npm run db:types`;
- auth or critical-user-flow change: all relevant checks plus `npm run test:e2e`;
- deployment-related change: production build and requested preview verification, without touching Production unless explicitly authorized.

## Definition of Done

A change is complete only when:

- the requested acceptance criteria and the smallest complete vertical slice work;
- server validation, authentication, authorization, ownership, and RLS implications were reviewed;
- relevant automated tests were added or updated and required checks passed;
- loading, empty, error, pending, responsive, and critical keyboard states were considered;
- migrations, generated types, `.env.example`, and documentation were updated when applicable;
- no unrelated scope, dependency, schema, auth, deployment, or user-data changes were introduced;
- the final report lists changed files, exact checks run, skipped checks with reasons, and remaining risks.

## Code review rules

Flag as blocking:

- a protected Server Action, Route Handler, or data-access path without authentication, authorization, ownership checks, or server validation, or a public auth endpoint without strict validation and redirect controls;
- a user-data table without effective RLS, an exposed view that bypasses underlying RLS, or a mutation policy that permits owner reassignment;
- a secret/elevated Supabase key or any credential in client code, source, logs, fixtures, screenshots, or error output;
- real personal job-search data in source, logs, telemetry, fixtures, snapshots, screenshots, seed data, or a deployed Preview without explicit approval scoped to the exact data and artifact;
- real personal job-search data in any E2E user, record, account, or artifact;
- a schema change outside version-controlled migrations or without RLS/database verification;
- shared caching of personalized data without an identity-safe design;
- Today/due/overdue logic based on server-local time or ambiguous timestamp semantics;
- tests that use production data or cannot run independently;
- MVP scope expansion, a second backend/repository, or an external/paid service without approval;
- suppressed lint, type, test, or build failures used to make checks appear green.

## Working process

1. Inspect relevant code, instructions, and current working-tree state; state important assumptions briefly.
2. Propose a concise plan before meaningful changes, including any schema, auth, dependency, or remote-operation impact.
3. Implement the smallest complete vertical slice and preserve unrelated user changes.
4. Run the verification matrix relevant to the change. Fix failures caused by the work; do not hide them.
5. Review the diff for security, privacy, accessibility, date/time behavior, and unintended scope.
6. Report the outcome, files changed, exact verification performed, skipped checks, and remaining risk.

Ask before destructive actions, paid services, production dependencies outside the approved stack, material scope changes, or external state changes not explicitly requested.
