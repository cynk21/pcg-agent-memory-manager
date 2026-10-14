import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendVerbatimEvidence, hashEvidenceContent, searchVerbatimEvidence } from '../verbatim-evidence-ledger.ts';

test('appends verbatim evidence and generates content hash', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  const records = appendVerbatimEvidence([
    {
      sourceType: 'gmail',
      sourceId: 'msg-1',
      content: 'Original transcript text for Projekt',
      author: 'kontakt@beispiel.example',
      sourceUrl: 'https://mail.google.com/mail/u/0/#all/msg-1',
      metadata: { subject: 'Projekt Update' },
    },
  ], tmpDir);

  assert.equal(records.length, 1);
  assert.equal(records[0].version, 1);
  assert.equal(records[0].contentHash, hashEvidenceContent('Original transcript text for Projekt'));

  const ledgerFile = path.join(tmpDir, 'evidence.jsonl');
  assert.equal(fs.existsSync(ledgerFile), true);
  const lines = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
});

test('deduplicates exact same evidence content without creating duplicates', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  const input = {
    sourceType: 'drive' as const,
    sourceId: 'doc-123',
    content: 'Full unsummarized transcript',
    sourceUrl: 'https://docs.google.com/document/d/doc-123/edit',
  };

  const first = appendVerbatimEvidence([input], tmpDir);
  const second = appendVerbatimEvidence([input], tmpDir);

  assert.equal(first.length, 1);
  assert.equal(second.length, 0);

  const lines = fs.readFileSync(path.join(tmpDir, 'evidence.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
});

test('bumps version for changed content of the same source', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  const first = appendVerbatimEvidence([
    {
      sourceType: 'tasks',
      sourceId: 'task-99',
      content: JSON.stringify({ title: 'Task v1', status: 'needsAction' }),
    },
  ], tmpDir);

  const second = appendVerbatimEvidence([
    {
      sourceType: 'tasks',
      sourceId: 'task-99',
      content: JSON.stringify({ title: 'Task v1', status: 'completed' }),
    },
  ], tmpDir);

  assert.equal(first[0].version, 1);
  assert.equal(second[0].version, 2);

  const lines = fs.readFileSync(path.join(tmpDir, 'evidence.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
});

test('searches verbatim evidence with term matching, recency boost and filtering', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  appendVerbatimEvidence([
    {
      sourceType: 'drive',
      sourceId: 'doc-kb',
      content: 'Projekt Beta Budgetfrage intern klären. Gemini 2.5 Flash aktiv.',
      sourceTimestamp: new Date().toISOString(),
      metadata: { name: 'Projekt Beta Notizen' },
    },
    {
      sourceType: 'gmail',
      sourceId: 'msg-fntv',
      content: 'Restbudget von 35.5 Stunden bei Beispielkunde verfügbar.',
      sourceTimestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { subject: 'Beispielkunde' },
    },
  ], tmpDir);

  const results = searchVerbatimEvidence({ query: 'Projekt Beta Budgetfrage' }, tmpDir);
  assert.equal(results.length > 0, true);
  assert.equal(results[0].record.sourceId, 'doc-kb');
  assert.match(results[0].snippet, /Projekt Beta/);

  const filtered = searchVerbatimEvidence({ query: 'Beispielkunde', sourceType: 'drive' }, tmpDir);
  assert.equal(filtered.length, 0);

  const gmailResults = searchVerbatimEvidence({ query: 'Beispielkunde', sourceType: 'gmail' }, tmpDir);
  assert.equal(gmailResults.length, 1);
  assert.equal(gmailResults[0].record.sourceId, 'msg-fntv');
});
