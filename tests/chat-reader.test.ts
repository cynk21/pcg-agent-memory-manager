import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRecentChats } from '../src/server/chat-reader.ts';

test('reads chat spaces and records message evidence', async () => {
  const evidence: any[] = [];
  const chat = {
    spaces: {
      list: async () => ({ data: { spaces: [{ name: 'spaces/beispiel', displayName: 'Beispiel Raum' }] } }),
      messages: {
        list: async () => ({ data: { messages: [{
          name: 'spaces/beispiel/messages/1',
          createTime: '2026-09-18T08:00:00Z',
          text: 'Bitte Zugangsschlüssel an Kollegen senden',
          sender: { displayName: 'Hardy' },
        }] } }),
      },
    },
  };

  const context = await fetchRecentChats({}, input => evidence.push(...input), () => chat as any);

  assert.match(context, /Raum: "Beispiel Raum"/);
  assert.match(context, /Hardy/);
  assert.match(context, /Bitte Zugangsschlüssel an Kollegen senden/);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].sourceType, 'chat');
});

test('filters out memory agent bot chat space from daily briefing chat ingestion', async () => {
  const previousEnv = process.env.CHAT_SPACE_ID;
  try {
    process.env.CHAT_SPACE_ID = 'spaces/bot-space-123';
    const evidence: any[] = [];
    const chat = {
      spaces: {
        list: async () => ({
          data: {
            spaces: [
              { name: 'spaces/bot-space-123', displayName: 'PCG Agent' },
              { name: 'spaces/regular', displayName: 'Projekt Chat' },
            ],
          },
        }),
        messages: {
          list: async () => ({
            data: {
              messages: [{
                name: 'spaces/regular/messages/1',
                createTime: '2026-10-08T08:00:00Z',
                text: 'Reguläre Nachricht',
                sender: { displayName: 'Teammitglied' },
              }],
            },
          }),
        },
      },
    };

    const context = await fetchRecentChats({}, input => evidence.push(...input), () => chat as any);
    assert.doesNotMatch(context, /PCG Agent/);
    assert.match(context, /Projekt Chat/);
    assert.equal(evidence.length, 1);
  } finally {
    process.env.CHAT_SPACE_ID = previousEnv;
  }
});
