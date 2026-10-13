import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureMeetingProtocolTasks } from '../src/server/action-reconciliation.ts';

const sourceWithFreetext = '--- DOKUMENT / TRANSKRIPT: "Protokoll Ratssitzung 11.10." | Direktlink: https://example.test/protokoll ---\\n' +
  'Beschluss: Strukturreform Variante 3 einstimmig. Hardy übernimmt bis zur nächsten Ratssitzung das Vorlagen-Template und das Datenschutzkonzept für Matrix.';

test('erfasst Freitext-Aufgabe aus einem Protokoll mit Quelllink', () => {
  const result = ensureMeetingProtocolTasks('# Daily', sourceWithFreetext, 'OFFEN:\nERLEDIGT:\n', '2026-10-14');
  assert.match(result, /Hardy übernimmt bis zur nächsten Ratssitzung/);
  assert.match(result, /example\.test\/protokoll/);
});

test('erfasst keine Freitext-Aufgabe ausserhalb einer Protokollquelle', () => {
  const chat = '--- DOKUMENT / CHAT: "Team Chat" ---\\nHardy übernimmt das morgen.';
  const result = ensureMeetingProtocolTasks('# Daily', chat, 'OFFEN:\nERLEDIGT:\n', '2026-10-14');
  assert.doesNotMatch(result, /Hardy übernimmt/);
});

test('dedupliziert gegen bestehende offene Aufgabe', () => {
  const tasks = 'OFFEN:\n- [OFFEN] Hardy übernimmt bis zur nächsten Ratssitzung das Vorlagen-Template | Liste: ToDo\nERLEDIGT:\n';
  const result = ensureMeetingProtocolTasks('# Daily', sourceWithFreetext, tasks, '2026-10-14');
  assert.doesNotMatch(result, /"meeting-protocol-1"/);
});
