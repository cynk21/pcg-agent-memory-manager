import * as fs from 'fs';
import * as path from 'path';

type RecordEvidence = (inputs: any[]) => void;

const AUTH_DIR = path.join(process.cwd(), '.wwebjs_auth');
const SESSION_DIR = path.join(process.cwd(), 'session');

// Limits für WhatsApp-Nachrichten
const MAX_CHATS = 50;
const MAX_MESSAGES_PER_CHAT = 100;
const MAX_MESSAGES_PER_LOW_PRIORITY_CHAT = 25;
const MAX_TOTAL_MESSAGES = 600;

export function isWhatsAppConfigured(): boolean {
  if (fs.existsSync(AUTH_DIR) && fs.existsSync(path.join(AUTH_DIR, 'session-pcg-agent'))) {
    return true;
  }
  if (fs.existsSync(SESSION_DIR) && fs.existsSync(path.join(SESSION_DIR, 'Default'))) {
    return true;
  }
  return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0;
}

/** Chats, die komplett ignoriert werden (Komma-getrennt in .env, Teilstring-Match, case-insensitive). */
function getExcludedChatPatterns(): string[] {
  return (process.env.WHATSAPP_EXCLUDE_CHATS || '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Priorisierte Chats zuerst und mit vollem Nachrichtenlimit (Default: BRG, Rat, Gilde, Ortsbeirat, Glietz). */
function getPriorityChatPatterns(): string[] {
  const raw = process.env.WHATSAPP_PRIORITY_CHATS || 'BRG,Rat,Gilde,Komtur,Feldscher,Ortsbeirat,Glietz';
  return raw.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
}

function isExcludedChat(title: string, excludePatterns: string[]): boolean {
  const t = title.toLowerCase();
  return excludePatterns.some((p: string) => t.includes(p));
}

function isPriorityChat(title: string, priorityPatterns: string[]): boolean {
  const t = title.toLowerCase();
  return priorityPatterns.some((p: string) => t.includes(p));
}

function getChromeExecutablePath(): string | undefined {
  const candidatePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Liest alle AKTIVEN WhatsApp-Chats des verknüpften Accounts rein lesend aus.
 * Es werden nur Nachrichten der letzten `daysBack` Tage übernommen.
 */
export async function fetchWhatsAppMessages(
  recordEvidence?: RecordEvidence,
  daysBack: number = 7
): Promise<string> {
  if (!isWhatsAppConfigured()) {
    return '(WhatsApp nicht angemeldet: Bitte führe "npm run agent -- whatsapp-auth" aus)\n';
  }

  let wwebjs: any;
  try {
    wwebjs = await import('whatsapp-web.js');
  } catch {
    return '(WhatsApp-Modul whatsapp-web.js nicht geladen: Bitte "npm run agent -- whatsapp-auth" ausführen)\n';
  }

  const { Client, LocalAuth } = wwebjs.default || wwebjs;
  const chromePath = getChromeExecutablePath();

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: process.cwd() }),
    puppeteer: {
      headless: true,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
      ],
    },
  });

  return new Promise<string>((resolve) => {
    const timeout = setTimeout(async () => {
      try { await client.destroy(); } catch {}
      resolve('(WhatsApp: Zeitüberschreitung beim Laden der Nachrichten - Session prüfen)\n');
    }, 90000);

    client.on('auth_failure', async () => {
      clearTimeout(timeout);
      try { await client.destroy(); } catch {}
      resolve('(WhatsApp Authentifizierung fehlgeschlagen oder abgelaufen: Bitte "npm run agent -- whatsapp-auth" ausführen)\n');
    });

    client.on('qr', () => {
      clearTimeout(timeout);
      try { client.destroy(); } catch {}
      console.log('[WhatsApp Reader] QR-Event empfangen -> Nicht authentifiziert.');
      resolve('(WhatsApp nicht angemeldet: Bitte führe "npm run agent -- whatsapp-auth" aus)\n');
    });

    client.on('loading_screen', (percent: number, message: string) => {
      console.log(`[WhatsApp Reader] Lädt: ${percent}% - ${message}`);
    });

    client.on('authenticated', () => {
      console.log('[WhatsApp Reader] Authentifizierung erfolgreich!');
    });

    client.on('ready', async () => {
      try {
        console.log('[WhatsApp Reader] WhatsApp Web Client ist READY. Lade Chats...');
        // Warte kurz 3 Sekunden, damit der interne Store vollständig befüllt ist
        await new Promise(r => setTimeout(r, 3000));
        const chats = await client.getChats().catch(() => []);
        console.log(`[WhatsApp Reader] Gefundene Chats: ${chats.length}`);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);
        const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

        const excludePatterns = getExcludedChatPatterns();
        const priorityPatterns = getPriorityChatPatterns();

        // Sortiere Chats nach letzter Nachricht (aktuellste zuerst)
        const sortedChats = chats
          .filter((c: any) => !c.isArchived)
          .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

        let context = 'Aktuelle WhatsApp-Nachrichten (letzte 7 Tage, rein lesend):\n';
        let totalMessages = 0;
        let processedChats = 0;

        for (const chat of sortedChats) {
          if (processedChats >= MAX_CHATS) break;
          const chatName = chat.name || 'Unbekannter Chat';
          if (isExcludedChat(chatName, excludePatterns)) continue;

          const isPrio = isPriorityChat(chatName, priorityPatterns);
          const limit = isPrio ? MAX_MESSAGES_PER_CHAT : MAX_MESSAGES_PER_LOW_PRIORITY_CHAT;

          let rawMessages: any[] = [];
          try {
            rawMessages = await client.pupPage.evaluate(async (chatId: string, msgLimit: number) => {
              const chat = (window as any).Store?.Chat?.get(chatId);
              if (chat?.msgs?.models) {
                return chat.msgs.models.slice(-msgLimit).map((m: any) => ({
                  id: m.id?._serialized || m.id?.id,
                  timestamp: m.t || 0,
                  body: m.body || '',
                  from: m.id?.participant?._serialized || m.from?._serialized || m.from || 'Teilnehmer',
                  notifyName: m.notifyName || m._data?.notifyName || '',
                }));
              }
              const msgModels = (window as any).Store?.Msg?.models || [];
              return msgModels
                .filter((m: any) => (m.id?.remote?._serialized || m.id?.remote) === chatId)
                .slice(-msgLimit)
                .map((m: any) => ({
                  id: m.id?._serialized || m.id?.id,
                  timestamp: m.t || 0,
                  body: m.body || '',
                  from: m.id?.participant?._serialized || m.from?._serialized || m.from || 'Teilnehmer',
                  notifyName: m.notifyName || m._data?.notifyName || '',
                }));
            }, chat.id?._serialized || chat.id, limit);
          } catch {
            continue;
          }

          const recentMessages = (rawMessages || [])
            .filter((m: any) => (m.timestamp || 0) >= cutoffTimestamp)
            .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

          if (recentMessages.length === 0) continue;

          processedChats++;
          context += `\n## Chat: "${chatName}"${chat.isGroup ? ' (Gruppe)' : ''}\n`;

          for (const msg of recentMessages) {
            if (totalMessages >= MAX_TOTAL_MESSAGES) break;

            const sender = msg.notifyName || msg.from || 'Teilnehmer';
            const body = msg.body ? msg.body.trim().replace(/\r?\n+/g, ' ') : '(Kein Text / Medien)';
            const dateStr = msg.timestamp
              ? new Date(msg.timestamp * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
              : '';

            if (recordEvidence) {
              recordEvidence([{
                sourceType: 'whatsapp',
                sourceId: `whatsapp:${chat.id}:${msg.id}`,
                content: `${chatName} - ${sender} [${dateStr}]: ${body}`,
                sourceTimestamp: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
                author: sender,
                sourceUrl: `https://web.whatsapp.com`,
                parentId: String(chat.id),
                metadata: { platform: 'whatsapp', groupTitle: chatName, isGroup: Boolean(chat.isGroup) },
              }]);
            }

            context += `- [${dateStr}] ${sender}: ${body}\n`;
            totalMessages++;
          }
        }

        clearTimeout(timeout);
        try { await client.destroy(); } catch {}
        if (totalMessages === 0) {
          return resolve('(WhatsApp: Keine neuen Nachrichten im 7-Tage-Fenster gefunden)\n');
        }
        resolve(context);
      } catch (err: any) {
        clearTimeout(timeout);
        try { await client.destroy(); } catch {}
        resolve(`(WhatsApp-Nachrichten konnten nicht vollständig gelesen werden: ${err?.message || err?.stack || err})\n`);
      }
    });

    client.initialize().catch((err: any) => {
      clearTimeout(timeout);
      resolve(`(WhatsApp Initialisierungsfehler: ${err?.message || err})\n`);
    });
  });
}
