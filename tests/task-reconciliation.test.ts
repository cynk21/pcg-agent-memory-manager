import assert from 'node:assert/strict';
import test from 'node:test';
import { detectStructuredMemoryChanges, ensureActionSectionTasks, ensureMeetingProtocolTasks, extractDavidOneOnOneAgenda, extractProjectCapacityEvidence, loadSkillContext, normalizeStructuredMemoryCategories, removeDuplicateSectionItems, sanitizeActionProposals, sanitizeCurrentSquadCapacityClaims, validateDailyBriefingStructure } from '../server.ts';

const tasksContext = `Google Tasks - AUTORITATIVE AUFGABENZUSTAENDE:
OFFEN:
- [OFFEN] Onboarding Max vorbereiten | Liste: My Tasks
ERLEDIGT:
- [ERLEDIGT] Erledigter Beispiel-Punkt Technik | Liste: My Tasks`;

test('always exposes Besprechung David as the dedicated 1:1 agenda source', () => {
  const context = '- [OFFEN] Besprechung David | Liste: My Tasks | Notiz: Thema A, Planung und Tool-Abstimmung klären';
  const result = extractDavidOneOnOneAgenda(context);

  assert.match(result, /Besprechung David/);
  assert.match(result, /Thema A, Planung und Tool-Abstimmung klären/);
  assert.match(result, /bei jeder Vorbereitung eines David-Termins berücksichtigt/);
});

test('separates concrete customer engagements into projects', () => {
  const [concept] = normalizeStructuredMemoryCategories([{
    category: 'customers',
    slug: 'beispiel-kunde',
    type: 'Customer',
    title: 'Beispiel Kunde',
    description: 'Kundenprojekt',
    body: 'Das SOW und die Projektbudgetklärung laufen weiter.',
  }]);

  assert.equal(concept.category, 'projects');
  assert.equal(concept.type, 'Project');
});

test('detects new and materially changed project and squad concepts', () => {
  const previous = {
    'projects/demo': {
      category: 'projects' as const,
      slug: 'demo',
      title: 'Demo',
      description: 'Altes Projekt',
      status: 'stable',
      body: 'Alter Stand',
    },
  };
  const changes = detectStructuredMemoryChanges(previous, [
    {
      category: 'projects', slug: 'demo', type: 'Project', title: 'Demo',
      description: 'Neuer Projektstatus', status: 'stable', body: 'Neuer Stand',
    },
    {
      category: 'squad', slug: 'staffing', type: 'Squad Topic', title: 'Staffing',
      description: 'Neue Planung', status: 'draft', body: 'David übernimmt.',
    },
    {
      category: 'general', slug: 'rule', type: 'Reference', title: 'Regel',
      description: 'Keine Änderung', status: 'stable', body: 'Regel',
    },
  ]);

  assert.deepEqual(changes.map(change => `${change.kind}:${change.category}/${change.slug}`), [
    'updated:projects/demo',
    'added:squad/staffing',
  ]);
});

test('loads only allowlisted workflow skills', () => {
  const result = loadSkillContext(['task-state-reconciliation', '../server.ts', 'chat-command-safety']);

  assert.match(result, /SKILL: task-state-reconciliation/);
  assert.match(result, /SKILL: chat-command-safety/);
  assert.doesNotMatch(result, /server\.ts/);
});

test('keeps current team capacity proposals for source-backed review', () => {
  const text = `<ACTION_PROPOSALS>
[
  {"type":"task","title":"Teammitglied: neue Projekte prüfen","details":{"notes":"Im aktuellen Weekly nach neuen Projekten gefragt."}}
]
</ACTION_PROPOSALS>`;

  const result = sanitizeActionProposals(text, '', '');

  assert.match(result, /Teammitglied: neue Projekte prüfen/);
});

test('replaces stale full-capacity claims with the latest source signal', () => {
  const result = sanitizeCurrentSquadCapacityClaims(
    '- **Squad Beispiel**: Teammitglied Alpha ist voll ausgelastet.',
    '--- DOKUMENT / TRANSKRIPT: "Team Weekly - 2026/08/25" | Direktlink: https://example.test/weekly ---\nTeammitglied Alpha meldet keine klare Pipeline und kein festes Budget; weitere Ideen für neue Projekte stehen im Raum.',
  );

  assert.match(result, /keine klare Pipeline/);
  assert.doesNotMatch(result, /Teammitglied Alpha ist voll ausgelastet/);
  assert.match(result, /example\.test\/weekly/);
});

test('applies the same freshness guard to every squad member', () => {
  const result = sanitizeCurrentSquadCapacityClaims(
    '- **Teammitglied Beta** ist voll ausgelastet.\n- **Teammitglied Gamma** ist voll ausgelastet.',
    '--- DOKUMENT / TRANSKRIPT: "Weekly" | Direktlink: https://example.test/weekly ---\nTeammitglied Beta hat Kapazität für neue Projekte.',
  );

  assert.match(result, /Teammitglied Beta meldet laut aktueller datierter Quelle Kapazitätsbedarf/);
  assert.match(result, /Teammitglied Gammas aktueller Auslastungsstatus ist .* nicht belegt/);
});

test('preserves project and capacity evidence for the source audit', () => {
  const result = extractProjectCapacityEvidence(
    '--- DOKUMENT / TRANSKRIPT: "Weekly" | Direktlink: https://example.test/weekly ---\nTeammitglied Alpha fragt nach neuen Projekten und Beta soll für Projekt Eins eingeplant werden.',
    'Betreff: Projektbudget und Staffing für September',
    'Resource Planner und Billability im Squad prüfen.',
  );

  assert.match(result, /Teammitglied Alpha fragt nach neuen Projekten/);
  assert.match(result, /Projektbudget und Staffing/);
  assert.match(result, /Resource Planner/);
});

test('briefing validator no longer requires or repairs a Section 7 project overview', () => {
  const result = validateDailyBriefingStructure(`# ☀️ Tägliches Management-Update\n\n## 1. [ÄNDERUNG] Projekt- und Kapazitätsänderungen\n\n## 2. Ortsbeirat & Kommunales (Glietz / Märkische Heide)\n\n## 3. 🚨 Proaktive Kunden- & Meeting-Vorbereitung\n\n## 4. 🔮 Vorausschau & Wochenausblick\n\n## 5. 🚨 Dringende Klärungen & Projekt-To-dos\n\n## 6. 💡 Weitere nächste Schritte`);

  assert.doesNotMatch(result, /Kompakte Projektstatus/);
  assert.match(result, /## 6\. 💡 Weitere nächste Schritte/);
});

test('mirrors concrete section actions into dated task proposals without reactivating completed tasks', () => {
  const summary = `# Daily\n\n## 5. 🚨 Dringende Klärungen & Projekt-To-dos\n- **Beispiel-Zugang einrichten** — Fälligkeit: 2026-09-18\n  • **Details:** Zugangsdaten anfordern\n\n## 6. 💡 Weitere nächste Schritte\n- **Alte Aufgabe nicht reaktivieren** — Fälligkeit: 2026-09-18\n\n<ACTION_PROPOSALS>\n[]\n</ACTION_PROPOSALS>`;
  const tasks = `OFFEN:\n- [OFFEN] Bereits offener Punkt | Liste: My Tasks\nERLEDIGT:\n- [ERLEDIGT] Alte Aufgabe nicht reaktivieren | Liste: My Tasks`;

  const result = ensureActionSectionTasks(summary, tasks, '2026-09-18');

  assert.match(result, /Beispiel-Zugang einrichten/);
  assert.match(result, /"dueDate": "2026-09-18"/);
  assert.doesNotMatch(result, /"title": "Alte Aufgabe nicht reaktivieren"/);
});

test('adds the Hardy action from meeting notes and skips it when completed', () => {
  const summary = '# Daily\n\n<ACTION_PROPOSALS>\n[]\n</ACTION_PROPOSALS>';
  const source = '[Hardy Engwer] Angebotsstatus klären: Ansprechpartner nach dem aktuellen Stand fragen und Unterstützung anbieten.';
  const tasks = 'OFFEN:\nERLEDIGT:\n';
  const result = ensureMeetingProtocolTasks(summary, source, tasks, '2026-09-23');

  assert.match(result, /Angebotsstatus klären/);
  assert.match(result, /"dueDate": "2026-09-23"/);
  assert.doesNotMatch(
    ensureMeetingProtocolTasks(summary, source, '- [ERLEDIGT] Angebotsstatus klären | Liste: My Tasks', '2026-09-23'),
    /"title": "Angebotsstatus klären"/,
  );
});

test('removes completed task from recommendations and proposals', () => {
  const text = `## 4. Konkrete naechste Schritte
- **Erledigter Beispiel-Punkt Technik** - Faellig: heute
  Details: Fehler analysieren
- **Neuen Punkt pruefen** - Faellig: morgen
  Details: neu

<ACTION_PROPOSALS>
[
  {"type":"task","title":"Erledigter Beispiel-Punkt Technik","details":{}},
  {"type":"task","title":"Neuen Punkt pruefen","details":{}}
]
</ACTION_PROPOSALS>`;

  const result = sanitizeActionProposals(text, tasksContext, '');

  assert.doesNotMatch(result, /Erledigter Beispiel-Punkt Technik/);
  assert.match(result, /Neuen Punkt pruefen/);
});

test('removes a paraphrased completed onboarding task from the report', () => {
  const text = `## 5. 🚨 Dringende Klärungen & Projekt-To-dos
- **Beispiel-Person: Rückmeldung zu Einarbeitung & Buddy-Zuweisung** — Fälligkeit: 2026-09-23
  • **Details:** Rückmeldung und Buddy festlegen.

<ACTION_PROPOSALS>
[
  {"type":"task","title":"Beispiel-Person: Rückmeldung zu Einarbeitung & Buddy-Zuweisung","details":{}}
]
</ACTION_PROPOSALS>`;
  const tasks = 'OFFEN:\nERLEDIGT:\n- [ERLEDIGT] Personal-Tool: Onboarding-To-dos Beispiel-Person prüfen | Liste: My Tasks';

  const result = sanitizeActionProposals(text, tasks, '');

  assert.doesNotMatch(result, /Beispiel-Person: Rückmeldung/);
});

test('keeps an open task when a matching historical task is completed', () => {
  const mixedTaskStates = `Google Tasks – AUTORITATIVE AUFGABENZUSTÄNDE:
OFFEN:
- [OFFEN] Beispiel Kunde: Jira-Hierarchie fuer Buchung Task 4257 anlegen | Liste: My Tasks
ERLEDIGT:
- [ERLEDIGT] Jira-Hierarchie für Beispiel Kunde Buchung anlegen | Liste: My Tasks`;
  const text = `## 4. Handlungsempfehlungen
- **Jira-Hierarchie für Beispiel Kunde Buchung anlegen** — Fälligkeit: heute
  • **Details:** Task 4257 in Jira verknüpfen.
  • [Quelle: Google Tasks](https://tasks.google.com/)`;

  const result = sanitizeActionProposals(text, mixedTaskStates, '');

  assert.match(result, /Jira-Hierarchie für Beispiel Kunde Buchung anlegen/);
});

test('does not create a duplicate for an open task', () => {
  const text = `<ACTION_PROPOSALS>
[
  {"type":"task","title":"Onboarding Max vorbereiten","details":{}},
  {"type":"task","title":"Anderen neuen Punkt pruefen","details":{}}
]
</ACTION_PROPOSALS>`;

  const result = sanitizeActionProposals(text, tasksContext, '');

  assert.doesNotMatch(result, /Onboarding Max vorbereiten/);
  assert.match(result, /Anderen neuen Punkt pruefen/);
});

test('matches real-world title variants despite details and spelling differences', () => {
  const realTasks = `Google Tasks - AUTORITATIVE AUFGABENZUSTAENDE:
OFFEN:
- [OFFEN] Beispiel Kunde Setup sauber aufsetzen und fragt nach best practices, da sein erstes Projekt hier | Liste: My Tasks
- [OFFEN] Projektleitung Partner anfragen: Kontaktiere Partner bezueglich der Uebernahme der Projektleitung fuer Projekt Alpha | Liste: My Tasks
ERLEDIGT:`;
  const text = `<ACTION_PROPOSALS>
[
  {"type":"task","title":"Beispiel Kunde: Best Practices bereitstellen","details":{"title":"Beispiel Kunde: Best Practices fuer Projekt-Setup bereitstellen","notes":"Jira und Confluence erklaeren"}},
  {"type":"task","title":"Projektleitung Partner anfragen fuer Projekt Alpha","details":{"title":"Projektleitung Partner anfragen fuer Projekt Alpha","notes":"Verfuegbarkeit pruefen"}}
]
</ACTION_PROPOSALS>`;

  const result = sanitizeActionProposals(text, realTasks, '');

  assert.doesNotMatch(result, /Beispiel Kunde: Best Practices/);
  assert.doesNotMatch(result, /Projektleitung Partner anfragen/);
});

test('filters completed recommendations without an action block', () => {
  const text = `## 4. Konkrete naechste Schritte
- **Erledigter Beispiel-Punkt Technik** - Faellig: heute
  Details: Fehler analysieren
- **Neuen Punkt pruefen** - Faellig: morgen
  Details: neu`;

  const result = sanitizeActionProposals(text, tasksContext, '');

  assert.doesNotMatch(result, /Erledigter Beispiel-Punkt Technik/);
  assert.match(result, /Neuen Punkt pruefen/);
});

test('keeps the project status section intact without customer-specific corrections', () => {
  const text = `## 2. Projektstatus
- **Beispielprojekt**
  • **Status:** On Track
  • **Aktueller Stand:** Projekt läuft.
  • **Nächste Schritte:** Kickoff vorbereiten.
  • [Quelle: Chat](https://example.com)`;

  const result = sanitizeActionProposals(text, '', '');

  assert.match(result, /Beispielprojekt/);
  assert.match(result, /Projekt läuft/);
});

test('removes completed task sentences from Section 2 Nächste Schritte', () => {
  const projectTasks = `Google Tasks - AUTORITATIVE AUFGABENZUSTAENDE:
OFFEN:
- [OFFEN] Onboarding Max vorbereiten | Liste: My Tasks
ERLEDIGT:
- [ERLEDIGT] Beispiel: Stunden auf Task 362 umbuchen | Liste: My Tasks`;

  const text = `## 2. Projektstatus
- **Beispielprojekt (Cure)**
  • **Status:** In Klärung
  • **Aktueller Stand:** Drive-Freigaben erteilt.
  • **Nächste Schritte:** Beispiel: Stunden von Ticket 112507 auf Task 362 verschieben. IT muss Passwort freischalten.
  • [Quelle: Chat](https://example.com)
- **Zweites Projekt**
  • **Nächste Schritte:** Workshop vorbereiten.`;

  const result = sanitizeActionProposals(text, projectTasks, '');

  assert.doesNotMatch(result, /Beispiel: Stunden von Ticket 112507/);
  assert.match(result, /IT muss Passwort freischalten/);
  assert.match(result, /Zweites Projekt[\s\S]*Workshop vorbereiten/);
});

test('removes section 5/6 items that repeat a section 1/2 item', () => {
  const text = `## 1. [ÄNDERUNG] Projekt- und Kapazitätsänderungen
- **Beispiel Kunde: Zugang für Partner klären**
  • **Änderung:** Zugang offen.

## 2. Ortsbeirat & Kommunales (Glietz / Märkische Heide)
- **Dorfbudget: Auszahlung vorbereiten**
  • **Aktueller Stand:** avisiert.

## 5. 🚨 Dringende Klärungen & Projekt-To-dos
- **Beispiel Kunde: Zugang für Partner klären** — Fälligkeit: 2026-10-20
  • **Details:** Zugangsdaten anfordern.
- **Neue eigenständige Aufgabe prüfen** — Fälligkeit: 2026-10-21
  • **Details:** eigene Aufgabe.

## 6. 💡 Weitere nächste Schritte
- **Dorfbudget: Auszahlung vorbereiten** — Fälligkeit: 2026-10-15
  • **Details:** Belege bereithalten.`;

  const result = removeDuplicateSectionItems(text);

  assert.equal((result.match(/Beispiel Kunde: Zugang für Partner klären/g) || []).length, 1);
  assert.equal((result.match(/Dorfbudget: Auszahlung vorbereiten/g) || []).length, 1);
  assert.match(result, /Neue eigenständige Aufgabe prüfen/);
});
