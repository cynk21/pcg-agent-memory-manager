"""Freitext-Erkennung fuer Protokoll-Aufgaben: 'Hardy übernimmt ...' in ensureMeetingProtocolTasks.

Aenderung (rein additiv):
  - src/server/action-reconciliation.ts: zusaetzliche Erkennung von Saetzen
      'Hardy übernimmt|Hardy wird|Hardy soll ...' nur in Protokoll-Quellen
      (Dateiname/Quelle mit Protokoll, Transkript, Notes by Gemini, Besprechung, Meeting).
  - tests/meeting-protocol-freetext.test.ts: sichert den realen Satz vom 11.10. ab.

Ablauf:
  1. Prueft, dass die Zieldatei noch unveraendert ist (Marker fehlt).
  2. Schreibt die Aenderung und den Test.
  3. Fuehrt `npm run check` aus. Ist es rot, wird alles exakt zurueckgesetzt.

Aufruf (im Repo-Ordner):
  python scripts/add-freetext-protocol-tasks.py
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "src" / "server" / "action-reconciliation.ts"
TEST = ROOT / "tests" / "meeting-protocol-freetext.test.ts"
BACKUP = ROOT / "action-reconciliation.ts.before-freetext.bak"
MARKER = "FREETEXT_PROTOCOL_PATTERN"

# Anker: die bestehende Zeile mit dem [Hardy]-Muster, wird unveraendert gelassen.
ANCHOR = "  const actionPattern = /(?:^|\\n)\\s*(?:[*•-]\\s*)?\\[Hardy(?:\\s+Engwer)?\\]"

NEW_BLOCK = """  // FREETEXT_PROTOCOL_PATTERN: Satz wie "Hardy übernimmt bis zur Ratssitzung ..." in Protokollquellen.
  const freetextPattern = /(?:^|[.\\n])\\s*(Hardy(?:\\s+Engwer)?\\s+(?:übernimmt|übernehme|wird|soll)\\s+[^.\\n]+)/gi;
  for (const match of sourceContext.matchAll(freetextPattern)) {
    const sentence = match[1].trim().replace(/\\s+/g, ' ');
    const before = sourceContext.slice(0, match.index ?? 0);
    const sourceHeader = before.split('\\n').reverse().find(line => /DOKUMENT|TRANSKRIPT|PROTOKOLL/i.test(line)) || '';
    if (!/protokoll|transkript|transcript|notes by gemini|besprechung|meeting/i.test(sourceHeader)) continue;
    if (/coaching|mentoring\\s*j|schwingdings/i.test(sentence)) continue;
    const label = sentence.replace(/[.,;:]+$/, '').slice(0, 120);
    const sourceUrl = findNearestSourceUrl(sourceContext, match.index ?? 0);
    const notes = buildShortTaskNotes(sentence, sourceUrl);
    if (!actions.some(action => areTaskTextsSimilar(action.title, label))) actions.push({ title: label, notes });
  }
"""

TEST_CONTENT = """import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureMeetingProtocolTasks } from '../src/server/action-reconciliation.ts';

const sourceWithFreetext = '--- DOKUMENT / TRANSKRIPT: "Protokoll Ratssitzung 11.10." | Direktlink: https://example.test/protokoll ---\\\\n' +
  'Beschluss: Strukturreform Variante 3 einstimmig. Hardy übernimmt bis zur nächsten Ratssitzung das Vorlagen-Template und das Datenschutzkonzept für Matrix.';

test('erfasst Freitext-Aufgabe aus einem Protokoll mit Quelllink', () => {
  const result = ensureMeetingProtocolTasks('# Daily', sourceWithFreetext, 'OFFEN:\\nERLEDIGT:\\n', '2026-10-14');
  assert.match(result, /Hardy übernimmt bis zur nächsten Ratssitzung/);
  assert.match(result, /example\\.test\\/protokoll/);
});

test('erfasst keine Freitext-Aufgabe ausserhalb einer Protokollquelle', () => {
  const chat = '--- DOKUMENT / CHAT: "Team Chat" ---\\\\nHardy übernimmt das morgen.';
  const result = ensureMeetingProtocolTasks('# Daily', chat, 'OFFEN:\\nERLEDIGT:\\n', '2026-10-14');
  assert.doesNotMatch(result, /Hardy übernimmt/);
});

test('dedupliziert gegen bestehende offene Aufgabe', () => {
  const tasks = 'OFFEN:\\n- [OFFEN] Hardy übernimmt bis zur nächsten Ratssitzung das Vorlagen-Template | Liste: ToDo\\nERLEDIGT:\\n';
  const result = ensureMeetingProtocolTasks('# Daily', sourceWithFreetext, tasks, '2026-10-14');
  assert.doesNotMatch(result, /"meeting-protocol-1"/);
});
"""


def main() -> int:
    src = TARGET.read_text(encoding="utf-8")
    if MARKER in src or TEST.exists():
        print("Abbruch: Aenderung ist bereits vorhanden.")
        return 1
    if src.count(ANCHOR) != 1:
        print("Abbruch: Anker im Code nicht eindeutig gefunden. Nichts veraendert.")
        return 1

    # Neuer Block direkt nach der Zeile 'const actions: ...' bzw. vor 'for (const match of sourceContext.matchAll(actionPattern))'
    loop_anchor = "  for (const match of sourceContext.matchAll(actionPattern)) {"
    if src.count(loop_anchor) != 1:
        print("Abbruch: Schleifen-Anker nicht eindeutig. Nichts veraendert.")
        return 1
    new_src = src.replace(loop_anchor, NEW_BLOCK + loop_anchor)

    shutil.copyfile(TARGET, BACKUP)
    TARGET.write_text(new_src, encoding="utf-8")
    TEST.write_text(TEST_CONTENT, encoding="utf-8")
    print("Freitext-Muster und Test geschrieben.")

    res = subprocess.run("npm run check", cwd=ROOT, shell=sys.platform == "win32",
                         capture_output=True, text=True)
    print((res.stdout + res.stderr)[-2500:])
    if res.returncode != 0:
        TARGET.write_text(src, encoding="utf-8")
        TEST.unlink(missing_ok=True)
        print("FEHLER: npm run check rot. Alles zurueckgesetzt.")
        return 1

    BACKUP.unlink(missing_ok=True)
    print("OK: npm run check gruen. Naechster Schritt: git diff pruefen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
