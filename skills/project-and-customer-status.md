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

## New Project Assignment Workflow

When Hardy receives a new project assignment through Gmail, Google Chat, a meeting note or another authoritative source, execute this workflow before treating the project as ready for delivery:

1. **Create the project identity.** Extract customer, exact project/deal name, contract or SOW reference, order number, expected start, duration, scope, budget and requested outcome. Use the exact Odoo `project.project` name and ID when available.
2. **Determine project lineage.** Search the latest Gmail, HubSpot/deal context, SOW, Odoo order/project, Drive notes, Calendar and Chat sources to decide whether this is:
   - a new customer project,
   - a follow-on/renewal/extension of an existing project,
   - a change request or workstream inside an existing project, or
   - not yet sufficiently identified.
   Do not create a duplicate project concept when the evidence supports a continuation.
3. **Reconcile commercial sources.** Compare HubSpot/deal information, the latest SOW or proposal, Odoo `sale.order`/order reference and Odoo `project.project`. Record discrepancies in scope, budget, dates, customer, seller or project name and identify which source is most recent.
4. **Identify commercial ownership.** Determine the Seller / Account Executive / Deal Owner from HubSpot, the SOW, the assignment email, CRM-linked documents or Odoo order context. Record the exact name and source. If no reliable Seller is found, create a clarification task instead of inferring one.
5. **Extract delivery requirements.** List the required skills, seniority, role, estimated effort, customer-facing language, location/time zone, security or compliance constraints and dependencies. Identify the expected platform as `GCP`, `AWS`, `Microsoft Azure` or `multi-cloud`; do not infer the platform from the customer name alone.
6. **Check Squad fit and availability.** Compare the required skills and platform with every suitable Squad member. For each proposed person, show current assignments, known leave, earliest reliable availability, expected capacity window and any conflict. Use Odoo bookings, Resource Planner/Calendar, current projects and approved absence sources. Never state that someone is available based only on an old profile.
7. **Prepare the staffing recommendation.** Propose primary and backup candidates, explain the match to required skills/platform, identify the decision owner and list any missing information needed before committing the staffing.
8. **Create the next actions.** Create or reconcile concrete Google Tasks for missing scope, commercial clarification, staffing decision and customer preparation. Do not duplicate existing open tasks or reactivate completed ones.
9. **Create a Kickoff task conditionally.** If the evidence indicates a new project and no valid kickoff task or confirmed kickoff meeting exists, create a task such as `Kickoff für <exakter Odoo-Projektname> vorbereiten` with customer, participants, scope, platform, proposed Squad, Seller and source links. If it is a follow-on project with an existing kickoff or established delivery cadence, do not create a duplicate kickoff task; add the new scope to the existing project agenda instead.
10. **Update project memory and Daily.** Create or update the project concept with lineage, commercial mapping, platform, skill requirements, staffing recommendation, availability window, current decision and next action. Include the project in the Daily as a material change with exact source links.

## Required Assignment Output

For every new assignment, the project section should contain:

- `Projektstatus`: exact Odoo project name/ID, customer, lineage and current state.
- `Commercial`: Seller/Deal Owner, HubSpot/deal, SOW and Odoo order references.
- `Scope`: outcome, deliverables, start, duration, budget and open assumptions.
- `Technology`: GCP, AWS, Microsoft Azure or multi-cloud, plus required skills.
- `Staffing`: primary and backup Squad candidates with earliest availability and evidence.
- `Decisions`: open questions, decision owner and due date only when source-backed.
- `Actions`: reconciled Tasks and the conditional Kickoff task.

If HubSpot, SOW, Odoo order or staffing data is unavailable, include a clearly labeled `Nicht verifiziert` item and a retrieval task. Do not silently replace missing commercial or capacity evidence with Memory assumptions.

## Guardrails

- A customer name alone does not make a concept customer-level.
- Do not infer health, budget or staffing status without evidence.
- Preserve separate concepts when one customer has multiple projects.
- A `Heads up:` budget alert is a control signal, not proof that a project should be closed.
- Never invent a Sales owner, latest booker, remaining budget or continuation decision.
- A new assignment is not automatically a new project; verify lineage before creating Memory, Tasks or a Kickoff.
- Do not promise a Squad member to a project until the availability window and required skills are source-backed.
