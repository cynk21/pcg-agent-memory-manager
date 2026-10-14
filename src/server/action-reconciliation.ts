// Aktionspunkt-Abgleich: Google-Tasks-Zustaende, Aehnlichkeit, Protokoll- und Abschnitts-Tasks.
// Reine Funktionen ohne I/O. Von server.ts re-exportiert, in tests/ geprueft.

export function normalizeTaskComparisonText(value: string): string {
  const stopWords = new Set([
    'aber', 'als', 'am', 'an', 'auf', 'aus', 'bei', 'bis', 'das', 'den', 'der', 'die', 'ein', 'eine',
    'fuer', 'für', 'im', 'in', 'ist', 'mit', 'nach', 'oder', 'und', 'von', 'vor', 'zu', 'zum', 'zur'
  ]);
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word))
    .join(' ');
}

export function areTaskTextsSimilar(first: string, second: string): boolean {
  const a = normalizeTaskComparisonText(first);
  const b = normalizeTaskComparisonText(second);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 12 && (a.includes(b) || b.includes(a))) return true;

  // Meeting notes often paraphrase an existing task (for example
  // "Arpit: Buddy festlegen" vs. "Personio: Onboarding-To-dos Arpit prüfen").
  const workflowWords = ['personio', 'onboarding', 'einarbeitung', 'buddy', 'diensthandy', 'hardware'];
  const aWorkflow = workflowWords.some(word => a.includes(word));
  const bWorkflow = workflowWords.some(word => b.includes(word));
  const bAnchorWords = new Set(b.split(' '));
  const anchors = [...new Set(a.split(' ').filter(word => word.length >= 4 && bAnchorWords.has(word)))];
  if (aWorkflow && bWorkflow && anchors.length > 0) return true;

  const aWords = new Set(a.split(' '));
  const bWords = new Set(b.split(' '));
  const common = [...aWords].filter(word => bWords.has(word)).length;
  const smallerSize = Math.min(aWords.size, bWords.size);
  if (smallerSize === 0) return false;
  const overlap = common / smallerSize;
  return (common >= 3 && overlap >= 0.5) || (common >= 2 && overlap >= 0.8);
}

export function extractGoogleTaskStates(tasksContext?: string): { open: string[]; completed: string[] } {
  const result = { open: [] as string[], completed: [] as string[] };
  if (!tasksContext) return result;

  for (const line of tasksContext.split('\n')) {
    const match = line.match(/^- \[(OFFEN|ERLEDIGT)\] (.*?)(?= \|)/);
    if (!match) continue;
    (match[1] === 'OFFEN' ? result.open : result.completed).push(match[2].trim());
  }
  return result;
}

export function removeCompletedTaskRecommendations(text: string, completedTitles: string[], openTitles: string[] = []): string {
  if (completedTitles.length === 0) return text;
  const sectionStart = text.search(/^## (?:4|5|6)\.\s/m);
  if (sectionStart < 0) return text;

  const actionStart = text.indexOf('<ACTION_PROPOSALS>', sectionStart);
  const sectionEnd = actionStart >= 0 ? actionStart : text.length;
  const before = text.slice(0, sectionStart);
  const section = text.slice(sectionStart, sectionEnd).replace(
    /^- \*\*([^*\n]+)\*\*[\s\S]*?(?=^- \*\*|$)/gm,
    (block, title) => completedTitles.some(completed => areTaskTextsSimilar(title, completed)) &&
       !openTitles.some(open => areTaskTextsSimilar(title, open)) ? '' : block
  );
  return before + section + text.slice(sectionEnd);
}

/**
 * Doppelungsverbot: Punkte in Abschnitt 5 und 6, die in Abschnitt 1 oder 2 bereits mit ähnlichem
 * Titel stehen, werden dort entfernt. Verglichen werden nur Titel der Form `- **Titel**`.
 */
export function removeDuplicateSectionItems(text: string): string {
  const headingRe = /^## (\d)\./gm;
  const starts: { num: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    starts.push({ num: Number(m[1]), index: m.index });
  }
  if (starts.length === 0) return text;

  const rangeOf = (num: number): { start: number; end: number } | undefined => {
    const idx = starts.findIndex(s => s.num === num);
    if (idx < 0) return undefined;
    const end = idx + 1 < starts.length ? starts[idx + 1].index : text.length;
    return { start: starts[idx].index, end };
  };

  const earlierTitles: string[] = [];
  for (const num of [1, 2]) {
    const range = rangeOf(num);
    if (!range) continue;
    for (const match of text.slice(range.start, range.end).matchAll(/^- \*\*([^*\n]+)\*\*/gm)) {
      earlierTitles.push(match[1]);
    }
  }
  if (earlierTitles.length === 0) return text;

  let result = text;
  for (const num of [5, 6]) {
    const current = recomputeRange(result, num);
    if (!current) continue;
    const section = result.slice(current.start, current.end);
    const cleaned = section.replace(
      /^- \*\*([^*\n]+)\*\*[^\n]*(?:\n(?!- \*\*|---|## |<ACTION_PROPOSALS>)[^\n]*)*\n?/gm,
      (block, title: string) => earlierTitles.some(e => areTaskTextsSimilar(title, e)) ? '' : block
    );
    result = result.slice(0, current.start) + cleaned + result.slice(current.end);
  }
  return result;
}

/** Bereich eines Abschnitts (`## N.`) im aktuellen Text, neu berechnet nach jeder Änderung. */
function recomputeRange(text: string, num: number): { start: number; end: number } | undefined {
  const headingRe = /^## (\d)\./gm;
  const starts: { num: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    starts.push({ num: Number(m[1]), index: m.index });
  }
  const idx = starts.findIndex(s => s.num === num);
  if (idx < 0) return undefined;
  const end = idx + 1 < starts.length ? starts[idx + 1].index : text.length;
  return { start: starts[idx].index, end };
}

export function removeStaleNextStepsFromProjectStatus(text: string, completedTitles: string[]): string {
  if (completedTitles.length === 0) return text;
  const sec2Start = text.search(/^## 2\.\s/m);
  if (sec2Start < 0) return text;
  const sec2End = text.search(/^## 3\.\s/m);
  const section = text.slice(sec2Start, sec2End >= 0 ? sec2End : text.length);

  const cleaned = section.replace(
    /(\*\*Nächste Schritte:\*\*\s*)([^\n•]+)/gi,
    (_match, prefix: string, body: string) => {
      const sentences = body.split(/(?<=\.)\s+/).filter((s: string) => s.trim());
      const kept = sentences.filter((s: string) => !completedTitles.some(c => areTaskTextsSimilar(s, c)));
      return kept.length > 0 ? prefix + kept.join(' ') : '';
    }
  );

  return text.slice(0, sec2Start) + cleaned + (sec2End >= 0 ? text.slice(sec2End) : '');
}

// Kundenspezifische Pflicht-Tasks werden nicht mehr fest verdrahtet.
// Konkrete Aktionen entstehen dynamisch aus expliziten Nutzer-Bitten und Abschnitten 5/6.
export function ensureCriticalProjectTasks(summary: string, _sourceContext: string, _tasksContext: string, _dueDate: string): string {
  return summary;
}

/** Sucht die nächstliegende Direktlink-URL vor einer Fundstelle im Quellkontext. */
export function findNearestSourceUrl(sourceContext: string, index: number): string {
  const before = sourceContext.slice(0, index);
  const docHeaders = [...before.matchAll(/Direktlink:\s*(https?:\/\/[^\s|\]\)]+)/g)];
  if (docHeaders.length > 0) return docHeaders[docHeaders.length - 1][1];
  const anyUrls = [...before.matchAll(/https?:\/\/[^\s|\]\)]+/g)];
  return anyUrls.length > 0 ? anyUrls[anyUrls.length - 1][0] : '';
}

/** Kurze, lesbare Aufgaben-Notiz mit Link zum Quelldokument (kein Transkript-Volltext). */
export function buildShortTaskNotes(rawNotes: string, sourceUrl: string): string {
  const cleaned = rawNotes
    .replace(/\[Gekürzt bei [^\]]*\][\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const short = cleaned.length > 400 ? `${cleaned.slice(0, 397).trim()}…` : cleaned;
  return sourceUrl ? `${short}\n\nQuelle: ${sourceUrl}` : short;
}

export function ensureMeetingProtocolTasks(summary: string, sourceContext: string, tasksContext: string, dueDate: string): string {
  const taskStates = extractGoogleTaskStates(tasksContext);
  const actions: { title: string; notes: string }[] = [];
  const actionPattern = /(?:^|\n)\s*(?:[*•-]\s*)?\[Hardy(?:\s+Engwer)?\]\s*([^:\n]+):\s*([^\n]*(?:\n(?!\s*(?:[*•-]\s*)?\[(?:Hardy|David|Die Gruppe)\])[^\n]*)*)/gi;
  // FREETEXT_PROTOCOL_PATTERN: Satz wie "Hardy übernimmt bis zur Ratssitzung ..." in Protokollquellen.
  const freetextPattern = /(?:^|[.\n])\s*(Hardy(?:\s+Engwer)?\s+(?:übernimmt|übernehme|wird|soll)\s+[^.\n]+)/gi;
  for (const match of sourceContext.matchAll(freetextPattern)) {
    const sentence = match[1].trim().replace(/\s+/g, ' ');
    const before = sourceContext.slice(0, match.index ?? 0);
    const sourceHeader = before.split('\n').reverse().find(line => /DOKUMENT|TRANSKRIPT|PROTOKOLL/i.test(line)) || '';
    if (!/protokoll|transkript|transcript|notes by gemini|besprechung|meeting/i.test(sourceHeader)) continue;
    if (/coaching|mentoring\s*j|schwingdings/i.test(sentence)) continue;
    const label = sentence.replace(/[.,;:]+$/, '').slice(0, 120);
    const sourceUrl = findNearestSourceUrl(sourceContext, match.index ?? 0);
    const notes = buildShortTaskNotes(sentence, sourceUrl);
    if (!actions.some(action => areTaskTextsSimilar(action.title, label))) actions.push({ title: label, notes });
  }
  for (const match of sourceContext.matchAll(actionPattern)) {
    const label = match[1].trim().replace(/\s+/g, ' ');
    const sourceUrl = findNearestSourceUrl(sourceContext, match.index ?? 0);
    const notes = buildShortTaskNotes(match[2], sourceUrl);
    if (!label || !notes || /^(?:status|aktueller stand|zusammenfassung)$/i.test(label)) continue;
    if (/coaching|mentoring\s*j|schwingdings/i.test(label) || /coaching|mentoring\s*j|schwingdings/i.test(notes)) continue;
    const title = label;
    if (!actions.some(action => areTaskTextsSimilar(action.title, title))) actions.push({ title, notes });
  }
  if (actions.length === 0) return summary;

  const existingTitles = [...taskStates.open, ...taskStates.completed];
  const actionMatch = summary.match(/<ACTION_PROPOSALS>([\s\S]*?)<\/ACTION_PROPOSALS>/i);
  let proposals: any[] = [];
  if (actionMatch) {
    try {
      proposals = JSON.parse(actionMatch[1].trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
    } catch {
      proposals = [];
    }
  }
  const additions = actions
    .filter(action => !existingTitles.some(task => areTaskTextsSimilar(action.title, task)) && !proposals.some(proposal => proposal?.type === 'task' && areTaskTextsSimilar(action.title, proposal.details?.title || proposal.title || '')))
    .map((action, index) => ({
      id: `meeting-protocol-${index + 1}`,
      type: 'task',
      title: action.title,
      details: { title: action.title, notes: action.notes, dueDate },
    }));
  if (additions.length === 0) return summary;
  const merged = [...proposals, ...additions];
  const serialized = `<ACTION_PROPOSALS>\n${JSON.stringify(merged, null, 2)}\n</ACTION_PROPOSALS>`;
  return actionMatch ? summary.replace(actionMatch[0], serialized) : `${summary.trim()}\n\n${serialized}`;
}

export function ensureActionSectionTasks(summary: string, tasksContext: string, fallbackDueDate: string): string {
  const taskStates = extractGoogleTaskStates(tasksContext);
  const actionMatch = summary.match(/<ACTION_PROPOSALS>([\s\S]*?)<\/ACTION_PROPOSALS>/i);
  let proposals: any[] = [];
  if (actionMatch) {
    try {
      proposals = JSON.parse(actionMatch[1].trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
    } catch {
      proposals = [];
    }
  }

  const additions: any[] = [];
  for (const sectionTitle of ['## 5. 🚨 Dringende Klärungen & Projekt-To-dos', '## 6. 💡 Weitere nächste Schritte']) {
    const sectionStart = summary.indexOf(sectionTitle);
    if (sectionStart < 0) continue;
    const nextSection = summary.indexOf('\n## ', sectionStart + sectionTitle.length);
    const actionBlock = summary.indexOf('\n<ACTION_PROPOSALS>', sectionStart);
    const sectionEnd = [nextSection, actionBlock].filter(index => index >= 0).sort((a, b) => a - b)[0] || summary.length;
    const section = summary.slice(sectionStart, sectionEnd);
    const itemPattern = /^- \*\*(.+?)\*\*(?:\s+—\s+Fälligkeit:\s+(\d{4}-\d{2}-\d{2}))?[\s\S]*?(?=\n- \*\*|$)/gm;
    for (const match of section.matchAll(itemPattern)) {
      const title = match[1].trim();
      if (!title || /^(Weitere nächste Schritte|Dringende Klärungen)/i.test(title)) continue;
      const dueDate = match[2] || fallbackDueDate;
      const details = match[0].replace(/^- \*\*.+?\*\*/, '').replace(/—\s+Fälligkeit:\s+\d{4}-\d{2}-\d{2}/, '').replace(/\s+/g, ' ').trim();
      const proposalText = `${title} ${details}`;
      const alreadyRepresented = [...taskStates.open, ...taskStates.completed].some(task => areTaskTextsSimilar(title, task)) ||
        proposals.some(proposal => proposal?.type === 'task' && areTaskTextsSimilar(title, proposal.details?.title || proposal.title || '')) ||
        additions.some(proposal => areTaskTextsSimilar(title, proposal.details?.title || proposal.title || ''));
      if (alreadyRepresented) continue;
      additions.push({
        id: `section-task-${additions.length + 1}`,
        type: 'task',
        title,
        details: { title, notes: details || `Konkrete Aktion aus dem Daily-Abschnitt: ${title}`, dueDate },
      });
    }
  }

  if (additions.length === 0) return summary;
  const merged = [...proposals, ...additions];
  const serialized = `<ACTION_PROPOSALS>\n${JSON.stringify(merged, null, 2)}\n</ACTION_PROPOSALS>`;
  return actionMatch ? summary.replace(actionMatch[0], serialized) : `${summary.trim()}\n\n${serialized}`;
}
