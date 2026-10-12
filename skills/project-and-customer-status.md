# Skill: Project and Customer Status

## Purpose

Maintain a clean distinction between delivery work and account-level context.

## Classification

- `projects/`: SOWs, PoCs, migrations, workstreams, budgets, deliverables and concrete project execution.
- `customers/`: Account-wide relationships, customer strategy and context not tied to one engagement.
- `squad/`: Team capacity, roles, onboarding, staffing and internal delivery processes.
- `general/`: Cross-cutting rules, governance and technical infrastructure.

## Procedure

1. Identify the concrete object being discussed.
2. Classify project execution before customer account context.
3. Record status, current facts, waiting parties and next decision.
4. Link the concept to source documents and related OKF concepts.
5. Keep project completion independent from customer relationship status.

## Odoo Budget Alert Workflow

Treat every recent Gmail message whose subject starts with `Heads up:` and reports allocated hours as a project-control signal.

1. Extract the exact project identifier, project name, allocated hours, booked/effective hours, remaining hours and alert level from the email.
2. Reconcile the alert against live Odoo `project.project`, `project.task` and `account.analytic.line` records on every Daily run. The Odoo record is authoritative when the email and Odoo differ; preserve both values and flag the discrepancy.
3. For an alert at or above 80%, include the project in the Daily under project and budget control, state the remaining hours and identify the responsible Project Manager or missing owner.
4. For an alert at or above 100%, identify from Odoo the most recent person who booked time on the project, including the latest booking date, task and hours where available.
5. For an alert at or above 100%, identify the Deal / Account Executive / Sales owner from the alert email, related email thread, Odoo account or project source. Do not infer a sales owner when the source does not name one; state the missing owner explicitly.
6. Create a concrete Chat follow-up addressed to the latest booker, responsible Project Manager and Sales owner, asking whether the project can be closed or what the approved continuation, follow-on budget or scope decision is. Include exact project name/ID, alert level, latest booking and source links.
7. Prefer a direct Google Chat draft or message proposal for this question; do not close, archive, change budget, or create Odoo records automatically. Sending requires an explicit user instruction under Chat Command Safety.
8. Do not suppress a repeated alert when it contains a changed percentage, booked-hours value, owner, project state or new booking. Repeated identical alerts should update the existing project status rather than create duplicate concepts or tasks.

## Daily Output For Budget Alerts

- `80% alert`: project, exact Odoo project name/ID, allocated/booked/remaining hours, responsible PM, Sales owner if known, decision date and source email.
- `100% alert`: all 80% fields plus latest time-booker, latest booking date/task, Sales owner and a ready-to-send Chat question about closure or continuation.
- Always link the exact `Heads up:` email and the Odoo source. If Odoo or the owner lookup is unavailable, say so explicitly and use the latest verified cache only as a marked fallback.

## Guardrails

- A customer name alone does not make a concept customer-level.
- Do not infer health, budget or staffing status without evidence.
- Preserve separate concepts when one customer has multiple projects.
- A `Heads up:` budget alert is a control signal, not proof that a project should be closed.
- Never invent a Sales owner, latest booker, remaining budget or continuation decision.
