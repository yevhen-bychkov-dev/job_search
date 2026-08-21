# Job Search OS — Initial Plan

> Historical planning record. The project owner's 2026-08-15 objective and [master specification](docs/MASTER_SPEC.md) supersede this narrower initial plan where they conflict.

## Goal

Build a web MVP for managing a personal job search. The application should become a daily tool, help strengthen Next.js, Node.js, and Codex skills, and leave room to evolve into a SaaS product if real demand appears.

## First-version stack

- Next.js + TypeScript + App Router
- Tailwind CSS + shadcn/ui
- Supabase: PostgreSQL and authentication
- Vercel: web application deployment
- GitHub: source code and change history
- Playwright: end-to-end testing of the main user flow

## Architecture decision

- One repository and a modular monolith.
- Next.js contains both the user interface and server-side logic.
- Supabase stores application data and user accounts.
- No separate backend repository or server is needed for the MVP.
- A GitHub push triggers deployment to Vercel.

## Level 0 — MVP boundaries

- The first user is the project author.
- Success means the application replaces a spreadsheet and scattered notes for the author's own job search.
- The first version includes: job applications, high-level statuses, interviews/actions, notes, and a next step.
- The first version excludes: AI resume generation, mass job parsing, a browser extension, email, calendar integration, mobile, Apple Watch, payments, and team features.
- Excluded features belong in the backlog, not in the first build.

## Level 1 — Codex setup

1. Create the repository.
2. Add `AGENTS.md`:
   - development, build, and test commands;
   - code-structure conventions;
   - a requirement to verify every feature before completion;
   - no hidden database-schema changes.
3. Use a consistent workflow:
   - short plan;
   - implementation;
   - automated and manual checks;
   - human review of the result.
4. Do not build an agent swarm in advance.
   - Evaluate Superpowers separately if it becomes useful.
   - For independent work, use focused roles: researcher, builder, reviewer.

## Level 2 — accounts, hosting, and local setup

1. Local prerequisites:
   - Node.js LTS;
   - Git;
   - VS Code or a preferred editor;
   - GitHub account;
   - Codex desktop app.
2. Hosting and data accounts:
   - Vercel: connect GitHub and use Hobby while the app is personal and non-commercial;
   - Supabase: create a free project for PostgreSQL and authentication;
   - store keys only in `.env.local`;
   - never commit secrets to GitHub.
3. Deployment loop:
   - local change → commit → GitHub push → Vercel preview;
   - verify every feature in the preview deployment.

## Level 3 — application skeleton and first public result

1. Create a Next.js project.
2. Add Tailwind and base UI components.
3. Build a static board with mock data.
4. Add a job-application card and an add-application form.
5. Push to GitHub and deploy to Vercel.

First visible result: a public link and a working interface, even without a database.

## Level 4 — domain model and real data

1. Create only the minimum entities:
   - user;
   - job application;
   - high-level status;
   - interview or action;
   - note;
   - next-action date.
2. Keep the workflow flexible:
   - broad board columns: Saved, Applied, Active process, Offer, Closed;
   - individual interview rounds live inside a job card: recruiter screen, technical interview, system design, and so on;
   - this prevents a separate board column for every company's hiring process.
3. Connect Supabase:
   - create the Postgres schema;
   - configure row-level security so each user sees only their own data;
   - add email login;
   - replace mock data with real CRUD operations.

Second usable result: register, create an application, change its status, add interviews and notes, refresh the page, and see the data preserved.

## Level 5 — core MVP loop

1. Job-application management:
   - add manually: company, role, URL, optional salary and location;
   - edit and delete;
   - update the high-level status;
   - keep notes.
2. Process management:
   - add an interview or action;
   - mark an interview completed;
   - set a next action and date;
   - show overdue and upcoming actions.
3. Daily-use surface:
   - a Today section with follow-ups due, upcoming interviews, and applications without a next step;
   - this is the first-version differentiator: clarity on what to do next, not just storage.
4. Quality baseline:
   - empty, loading, and error states;
   - responsive layout;
   - keyboard and accessibility pass for critical forms;
   - one Playwright test: sign in → add application → add interview → update status.

## Level 6 — portfolio and real self-testing

1. Use the product for a real job search.
2. Maintain a friction log:
   - what was slow;
   - what was forgotten;
   - what was missing;
   - what was never used.
3. Create a portfolio case study in the README:
   - problem;
   - user;
   - stack;
   - architecture;
   - screenshots;
   - demo link;
   - roadmap.
4. Describe the project honestly:
   - “I designed and shipped a full-stack Next.js application that I use in my own job search.”

## Level 7 — evidence-based development

Only add a feature when repeated real use proves the need.

Possible next features:

- import a job application from a URL;
- browser extension;
- calendar integration;
- focused AI guidance based only on confirmed resume facts;
- mobile companion app;
- Apple Watch reminders and quick check-ins.

## Level 8 — optional SaaS path

1. Validate before monetizing:
   - identify a narrow audience: developers, immigrants, career switchers, senior candidates, or a specific local market;
   - talk to several users;
   - identify where their current spreadsheet workflow breaks.
2. Build one defensible wedge:
   - do not compete on “kanban board + AI resume builder”;
   - compete on one repeated and painful workflow;
   - measure whether people return and use it.
3. Add commercial infrastructure only when justified:
   - upgrade Vercel from Hobby when the project becomes commercial;
   - upgrade Supabase when the free tier is no longer sufficient;
   - add payments only after clear user demand.

## Hosting and cost boundaries

- Vercel Hobby is free for a personal, non-commercial project; exceeding its free limits pauses the project rather than generating an unexpected bill.
- Supabase Free provides Postgres and Auth for a small project; the database pauses after one week of inactivity.
- If the project becomes commercial, upgrading should be a conscious decision after user demand appears—not a cost before the product has users.

## Next concrete action

Create an empty GitHub repository and a static Next.js skeleton with a mock job-application board.
