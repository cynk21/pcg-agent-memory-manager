import * as fs from 'fs';
import * as path from 'path';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

type RecordEvidence = (inputs: any[]) => void;

const SESSION_FILE = path.join(process.cwd(), '.telegram_session.json');

export function loadTelegramSessionString(): string {
  if (process.env.TELEGRAM_SESSION) return process.env.TELEGRAM_SESSION.trim();
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      return data.session || '';
    } catch {
      return '';
    }
  }
  return '';
}

export function saveTelegramSessionString(sessionStr: string): void {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ session: sessionStr, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
}

export async function fetchTelegramGroupMessages(
  recordEvidence?: RecordEvidence,
  targetGroupPattern: RegExp = /BRG\s*Info/i,
  daysBack: number = 7
): Promise<string> {
  const apiIdStr = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionStr = loadTelegramSessionString();

  if (!apiIdStr || !apiHash) {
    return '(Telegram nicht konfiguriert: TELEGRAM_API_ID oder TELEGRAM_API_HASH fehlt in .env)\n';
  }

  const apiId = Number(apiIdStr);
  if (!apiId || Number.isNaN(apiId)) {
    return '(Telegram nicht konfiguriert: Ungültige TELEGRAM_API_ID)\n';
  }

  if (!sessionStr) {
    return '(Telegram nicht angemeldet: Bitte führe "npm run agent -- telegram-auth" aus)\n';
  }

  const stringSession = new StringSession(sessionStr);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 3,
  });

  try {
    await client.connect();
    if (!await client.isUserAuthorized()) {
      return '(Telegram Authentifizierung abgelaufen oder ungültig: Bitte "npm run agent -- telegram-auth" ausführen)\n';
    }

    const dialogs: any[] = await client.getDialogs({ limit: 100 });
    const targetDialogs = dialogs.filter((d: any) => targetGroupPattern.test(d.title || d.name || ''));

    if (targetDialogs.length === 0) {
      await client.disconnect();
      return '(Telegram: Keine Gruppe gefunden, die auf "BRG Info" passt)\n';
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    let context = 'Telegram Nachrichten (Gruppe: BRG Info):\n';
    const evidenceList: any[] = [];

    for (const dialog of targetDialogs) {
      const groupTitle = dialog.title || dialog.name || 'BRG Info';
      const entity = dialog.entity;
      const messages: any[] = await client.getMessages(entity, { limit: 100 });

      for (const msg of messages) {
        if (!msg.text) continue;
        const msgDate = new Date(msg.date * 1000);
        if (msgDate < cutoffDate) continue;

        const senderObj = msg.sender as any;
        const sender = senderObj?.firstName
          ? `${senderObj.firstName}${senderObj.lastName ? ' ' + senderObj.lastName : ''}`
          : senderObj?.username || senderObj?.title || 'Gildenmitglied';

        const timeStr = msgDate.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        const cleanText = msg.text.replace(/\r?\n+/g, ' ').trim();

        context += `- [Telegram: ${groupTitle}] ${sender} [${timeStr}]: "${cleanText}"\n`;

        if (recordEvidence) {
          evidenceList.push({
            sourceType: 'chat',
            sourceId: `telegram:${dialog.id}:${msg.id}`,
            content: `[${groupTitle}] ${sender} (${msgDate.toISOString()}): ${msg.text}`,
            sourceTimestamp: msgDate.toISOString(),
            author: sender,
            sourceUrl: `https://t.me/c/${String(dialog.id).replace(/^-100/, '')}/${msg.id}`,
            parentId: String(dialog.id),
            metadata: { platform: 'telegram', groupTitle, messageId: msg.id },
          });
        }
      }
    }

    if (recordEvidence && evidenceList.length > 0) {
      recordEvidence(evidenceList);
    }

    await client.disconnect();
    return context;
  } catch (err: any) {
    console.warn('Telegram fetch error:', err?.message || err);
    try { await client.disconnect(); } catch {}
    return `(Telegram Nachrichten konnten nicht geladen werden: ${err?.message || err})\n`;
  }
}
