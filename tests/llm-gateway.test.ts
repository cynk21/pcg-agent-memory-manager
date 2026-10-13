import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToOpenAIMessages } from '../src/server/llm-gateway.ts';

test('maps system instruction, parts and model role to OpenAI messages', () => {
  const messages = convertToOpenAIMessages(
    [
      { role: 'user', parts: [{ text: 'Frage' }] },
      { role: 'model', parts: [{ text: 'Antwort' }] },
    ],
    { parts: [{ text: 'Du bist ein Assistent.' }] },
  );
  assert.deepEqual(messages, [
    { role: 'system', content: 'Du bist ein Assistent.' },
    { role: 'user', content: 'Frage' },
    { role: 'assistant', content: 'Antwort' },
  ]);
});

test('falls back to a placeholder message when no content is given', () => {
  assert.deepEqual(convertToOpenAIMessages([]), [{ role: 'user', content: 'Hallo' }]);
});
