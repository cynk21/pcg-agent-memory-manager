import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRecentEmails } from '../src/server/gmail-reader.ts';

test('marks sent emails and preserves follow-up context', async () => {
  const evidence: any[] = [];
  const gmail = {
    users: {
      messages: {
        list: async ({ q }: { q: string }) => q.includes('transcript') ? { data: { messages: [] } } : { data: { messages: [{ id: 'mail-1' }] } },
        get: async () => ({ data: {
          id: 'mail-1',
          labelIds: ['SENT'],
          internalDate: String(Date.now()),
          snippet: 'Bitte um Rückmeldung zur Beispiel-Schätzung.',
          payload: {
            headers: [
              { name: 'From', value: 'hardy@pcg.io' },
              { name: 'To', value: 'empfaenger@beispiel.example' },
              { name: 'Subject', value: 'Beispiel Schätzung' },
              { name: 'Date', value: new Date().toUTCString() },
            ],
            mimeType: 'text/plain',
            body: { data: Buffer.from('Bitte um Rückmeldung zur Schätzung.').toString('base64') },
          },
        } }),
      },
    },
  };

  const context = await fetchRecentEmails({}, input => evidence.push(...input), () => gmail as any);

  assert.match(context, /Status: GESENDET/);
  assert.match(context, /Empfänger: empfaenger@beispiel\.example/);
  assert.match(context, /AUSGANG: Keine Antwort im Thread – Follow-up prüfen/);
  assert.equal(evidence[0].metadata.status, 'GESENDET');
});

test('marks a sent email as already answered when the same thread has a newer reply', async () => {
  const evidence: any[] = [];
  const now = Date.now();
  const headers = (from: string, to: string, subject: string) => [
    { name: 'From', value: from },
    { name: 'To', value: to },
    { name: 'Subject', value: subject },
    { name: 'Date', value: new Date(now).toUTCString() },
  ];
  const gmail = {
    users: {
      messages: {
        list: async ({ q }: { q: string }) => q.includes('transcript') ? { data: { messages: [] } } : { data: { messages: [{ id: 'sent-1' }, { id: 'reply-1' }] } },
        get: async ({ id }: { id: string }) => ({ data: id === 'sent-1'
          ? { id, threadId: 'thread-A', labelIds: ['SENT'], internalDate: String(now - 60000), snippet: 'Frage', payload: { headers: headers('hardy@pcg.io', 'partner@beispiel.example', 'Schätzung'), mimeType: 'text/plain', body: { data: Buffer.from('Frage').toString('base64') } } }
          : { id, threadId: 'thread-A', labelIds: ['INBOX'], internalDate: String(now), snippet: 'Antwort', payload: { headers: headers('partner@beispiel.example', 'hardy@pcg.io', 'Re: Schätzung'), mimeType: 'text/plain', body: { data: Buffer.from('Antwort').toString('base64') } } } }),
      },
    },
  };

  const context = await fetchRecentEmails({}, input => evidence.push(...input), () => gmail as any);

  assert.match(context, /BEREITS BEANTWORTET – KEIN NACHHAK-TASK/);
  assert.doesNotMatch(context, /Keine Antwort im Thread/);
});

test('excludes generated Daily report emails from context and evidence', async () => {
  const evidence: any[] = [];
  const gmail = {
    users: {
      messages: {
        list: async () => ({ data: { messages: [{ id: 'daily-mail' }] } }),
        get: async () => ({ data: {
          id: 'daily-mail',
          labelIds: ['SENT', 'INBOX'],
          internalDate: String(Date.now()),
          snippet: 'Generated Daily report',
          payload: { headers: [{ name: 'Subject', value: 'PCG Agent Daily Briefing - 2026-10-08' }], mimeType: 'text/plain', body: { data: Buffer.from('Generated Daily report').toString('base64') } },
        } }),
      },
    },
  };

  const context = await fetchRecentEmails({}, input => evidence.push(...input), () => gmail as any);
  assert.doesNotMatch(context, /Generated Daily report/);
  assert.equal(evidence.length, 0);
});
