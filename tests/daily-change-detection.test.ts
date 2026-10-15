import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSourceBlocks, selectChangedBlocks, fingerprint } from '../src/server/daily-change-detection.ts';

test('splits a source context into stable per-item blocks', () => {
  const context = [
    '- [Status: INBOX] Von: a@example.test | Betreff: Erste Mail',
    '- [Status: SENT] Von: b@example.test | Betreff: Zweite Mail',
  ].join('\n');
  const blocks = splitSourceBlocks('gmail', context);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0][0], /^gmail:/);
  assert.notEqual(blocks[0][0], blocks[1][0]);
});

test('selects only changed or new blocks compared with the previous run', () => {
  const blocks: [string, string][] = [['gmail:a', 'Text A'], ['gmail:b', 'Text B neu']];
  const previous = { 'gmail:a': fingerprint('Text A'), 'gmail:b': fingerprint('Text B alt') };
  const result = selectChangedBlocks(blocks, previous);
  assert.equal(result.unchangedCount, 1);
  assert.deepEqual(result.changed.map(([key]) => key), ['gmail:b']);
  assert.equal(result.next['gmail:a'], fingerprint('Text A'));
});
