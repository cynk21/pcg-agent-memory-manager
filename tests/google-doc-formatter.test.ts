import test from 'node:test';
import assert from 'node:assert/strict';
import { convertTextToGoogleDocHtml } from '../src/server/google-doc-formatter.ts';

test('converts markdown agenda to valid google doc html with proper structure', () => {
  const sampleMarkdown = `
# Agenda der Ratssitzung (Online)
Datum: Sonntag, 11. Oktober 2026, 18:00
Protokoll-Referenz: Sitzung vom 28.09.2026

1. Eröffnung & Begrüßung
Begrüßung durch den Erzmarschall.

2. Haupttagesordnungspunkt: Ratsreform
- **Ziel:** Beschlussfassung
- **Details:** Strukturreform des Rates der Ritter.
  - Verbindliche Vorlagenpflicht
  - Timeboxing 15 Min

3. Sonstiges
Wichtiger Hinweis für alle Ratsmitglieder
`;

  const html = convertTextToGoogleDocHtml(sampleMarkdown, 'Test Agenda');
  assert.ok(html.includes('<h1>Agenda der Ratssitzung (Online)</h1>'), 'Should contain styled h1');
  assert.ok(html.includes('<h2>1. Eröffnung &amp; Begrüßung</h2>'), 'Should convert top-level numbered items to h2');
  assert.ok(html.includes('<strong>Ziel:</strong> Beschlussfassung'), 'Should convert bold markdown');
  assert.ok(html.includes('class="meta-line"'), 'Should format meta lines');
  assert.ok(html.includes('<ul>'), 'Should format list elements');
});
