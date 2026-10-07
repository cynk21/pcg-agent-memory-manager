import * as fs from 'fs';
import * as path from 'path';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

type RecordEvidence = (inputs: any[]) => void;

const SESSION_FILE = path.join(process.cwd(), '.telegram_session.json');

// Limits, damit ein einzelner riesiger Chat den Daily nicht sprengt
const MAX_DIALOGS = 50;
const MAX_MESSAGES_PER_DIALOG = 100;
const MAX_MESSAGES_PER_LOW_PRIORITY_DIALOG = 25;
const MAX_TOTAL_MESSAGES = 600;

/** Chats, die komplett ignoriert werden (Komma-getrennt in .env, Teilstring-Match, case-insensitive). */
function getExcludedChatPatterns(): string[] {
  return (process.env.TELEGRAM_EXCLUDE_CHATS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Priorisierte Chats zuerst und mit vollem Nachrichtenlimit (Default: BRG- und Rats-Chats). */
function getPriorityChatPatterns(): string[] {
  const raw = process.env.TELEGRAM_PRIORITY_CHATS || 'BRG,Rat,Gilde,Komtur,Feldscher,Ortsbeirat,Glietz';
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isExcludedChat(title: string, excludePatterns: string[]): boolean {
  const t = title.toLowerCase();
  // Telegram-Service-Chat (Login-Codes, Service-Nachrichten) immer ausschliessen
  if (t === 'telegram' || t === 'telegram notifications') return true;
  return excludePatterns.some(p => t.includes(p));
}

function isPriorityChat(title: string, priorityPatterns: string[]): boolean {
  const t = title.toLowerCase();
  return priorityPatterns.some(p => t.includes(p));
}

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

function resolveSenderName(msg: any): string {
  const senderObj = msg.sender as any;
  if (senderObj?.firstName) {
    return `${senderObj.firstName}${senderObj.lastName ? ' ' + senderObj.lastName : ''}`;
  }
  return senderObj?.username || senderObj?.title || 'Teilnehmer';
}

/**
 * Liest alle AKTIVEN (nicht archivierten) Telegram-Chats des angemeldeten
 * User-Accounts rein lesend aus: Gruppen, Kanäle und Direktchats.
 * Es werden nur Nachrichten der letzten `daysBack` Tage übernommen.
 */
export async function fetchTelegramGroupMessages(
  recordEvidence?: RecordEvidence,
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

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffUnix = Math.floor(cutoffDate.getTime() / 1000);

    // Nur Hauptordner (folderId 0/undefined) = aktive Chats; Archiv hat folderId 1.
    const excludePatterns = getExcludedChatPatterns();
    const priorityPatterns = getPriorityChatPatterns();
    const dialogs: any[] = await client.getDialogs({ limit: 200 });
    const activeDialogs = dialogs
      .filter((d: any) => !d.archived && (d.folderId === undefined || d.folderId === null || d.folderId === 0))
      // Nur Chats mit Aktivität im Zeitfenster (letzte Nachricht neuer als Cutoff)
      .filter((d: any) => (d.date || 0) >= cutoffUnix)
      // Ausschlussliste (TELEGRAM_EXCLUDE_CHATS in .env)
      .filter((d: any) => !isExcludedChat(d.title || d.name || '', excludePatterns))
      // Prioritäts-Chats (BRG, Rat, ...) zuerst, danach nach Aktualität
      .sort((a: any, b: any) => {
        const aPrio = isPriorityChat(a.title || a.name || '', priorityPatterns) ? 1 : 0;
        const bPrio = isPriorityChat(b.title || b.name || '', priorityPatterns) ? 1 : 0;
        if (aPrio !== bPrio) return bPrio - aPrio;
        return (b.date || 0) - (a.date || 0);
      })
      .slice(0, MAX_DIALOGS);

    if (activeDialogs.length === 0) {
      await client.disconnect();
      return '(Telegram: Keine aktiven Chats mit Nachrichten im Zeitfenster gefunden)\n';
    }

    let context = `Telegram Nachrichten (aktive Chats, letzte ${daysBack} Tage):\n`;
    const evidenceList: any[] = [];
    let totalMessages = 0;

    for (const dialog of activeDialogs) {
      if (totalMessages >= MAX_TOTAL_MESSAGES) break;

      const chatTitle = dialog.title || dialog.name || 'Unbenannter Chat';
      const entity = dialog.entity;
      const prio = isPriorityChat(chatTitle, priorityPatterns);
      const perDialogLimit = prio ? MAX_MESSAGES_PER_DIALOG : MAX_MESSAGES_PER_LOW_PRIORITY_DIALOG;
      let messages: any[] = [];
      try {
        messages = await client.getMessages(entity, { limit: perDialogLimit });
      } catch (dialogErr: any) {
        console.warn(`Telegram: Chat "${chatTitle}" konnte nicht gelesen werden:`, dialogErr?.message || dialogErr);
        continue;
      }

      let dialogHeaderWritten = false;

      for (const msg of messages) {
        if (!msg.text) continue;
        const msgDate = new Date(msg.date * 1000);
        if (msgDate < cutoffDate) continue;
        if (totalMessages >= MAX_TOTAL_MESSAGES) break;

        if (!dialogHeaderWritten) {
          context += `\n## Chat: ${chatTitle}\n`;
          dialogHeaderWritten = true;
        }

        const sender = resolveSenderName(msg);
        const timeStr = msgDate.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        const cleanText = msg.text.replace(/\r?\n+/g, ' ').trim();

        context += `- [Telegram: ${chatTitle}] ${sender} [${timeStr}]: "${cleanText}"\n`;
        totalMessages++;

        if (recordEvidence) {
          evidenceList.push({
            sourceType: 'chat',
            sourceId: `telegram:${dialog.id}:${msg.id}`,
            content: `[${chatTitle}] ${sender} (${msgDate.toISOString()}): ${msg.text}`,
            sourceTimestamp: msgDate.toISOString(),
            author: sender,
            sourceUrl: `https://t.me/c/${String(dialog.id).replace(/^-100/, '')}/${msg.id}`,
            parentId: String(dialog.id),
            metadata: { platform: 'telegram', groupTitle: chatTitle, messageId: msg.id },
          });
        }
      }
    }

    if (recordEvidence && evidenceList.length > 0) {
      recordEvidence(evidenceList);
    }

    await client.disconnect();

    if (totalMessages === 0) {
      return '(Telegram: Keine Textnachrichten der letzten 7 Tage in aktiven Chats gefunden)\n';
    }

    return context;
  } catch (err: any) {
    console.warn('Telegram fetch error:', err?.message || err);
    try { await client.disconnect(); } catch {}
    return `(Telegram Nachrichten konnten nicht geladen werden: ${err?.message || err})\n`;
  }
}
