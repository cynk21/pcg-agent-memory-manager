import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidencePacket } from '../src/server/evidence-packet.ts';

test('prioritizes fresh relevant evidence within a source budget', () => {
  const packet = buildEvidencePacket([{
    name: 'E-Mails',
    budget: 260,
    keywords: ['budget', 'sulzer'],
    context: '--- alte Mail ---\nHistorischer Kontext ohne aktuelle Aktion.\n\n--- aktuelle Mail ---\nHeute: Sulzer Budget 80% Heads up, Entscheidung offen.\n\n--- weitere Mail ---\nAlte Information.',
  }]);

  assert.match(packet, /Snapshot [a-f0-9]{12}/);
  assert.match(packet, /Sulzer Budget 80%/);
  assert.match(packet, /aktuelle Mail/);
});
