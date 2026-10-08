import * as fs from 'fs';
import * as path from 'path';

type RecordEvidence = (inputs: any[]) => void;

const AUTH_DIR = path.join(process.cwd(), '.wwebjs_auth');

// Limits für WhatsApp-Nachrichten
const MAX_CHATS = 50;
const MAX_MESSAGES_PER_CHAT = 100;
const MAX_MESSAGES_PER_LOW_PRIORITY_CHAT = 25;
const MAX_TOTAL_MESSAGES = 600;

export function isWhatsAppConfigured(): boolean {
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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    },
  });

  return new Promise<string>((resolve) => {
    const timeout = setTimeout(async () => {
      try { await client.destroy(); } catch {}
      resolve('(WhatsApp: Zeitüberschreitung beim Laden der Nachrichten - Session prüfen)\n');
    }, 45000);

    client.on('auth_failure', async () => {
      clearTimeout(timeout);
      try { await client.destroy(); } catch {}
      resolve('(WhatsApp Authentifizierung fehlgeschlagen oder abgelaufen: Bitte "npm run agent -- whatsapp-auth" ausführen)\n');
    });

    client.on('ready', async () => {
      try {
        const chats = await client.getChats();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);
        const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

        const excludePatterns = getExcludedChatPatterns();
        const priorityPatterns = getPriorityChatPatterns();

        const activeChats = chats
          .filter((c: any) => !c.isArchived)
          .filter((c: any) => (c.timestamp || 0) >= cutoffTimestamp)
          .filter((c: any) => !isExcludedChat(c.name || '', excludePatterns))
          .sort((a: any, b: any) => {
            const aPrio = isPriorityChat(a.name || '', priorityPatterns) ? 1 : 0;
            const bPrio = isPriorityChat(b.name || '', priorityPatterns) ? 1 : 0;
            if (aPrio !== bPrio) return bPrio - aPrio;
            return (b.timestamp || 0) - (a.timestamp || 0);
          })
          .slice(0, MAX_CHATS);

        if (activeChats.length === 0) {
          clearTimeout(timeout);
          try { await client.destroy(); } catch {}
          return resolve('(WhatsApp: Keine aktiven Chats mit Nachrichten im 7-Tage-Fenster gefunden)\n');
        }

        let context = 'Aktuelle WhatsApp-Nachrichten (letzte 7 Tage, rein lesend):\n';
        let totalMessages = 0;

        for (const chat of activeChats) {
          const chatName = chat.name || 'Unbekannter Chat';
          const isPrio = isPriorityChat(chatName, priorityPatterns);
          const limit = isPrio ? MAX_MESSAGES_PER_CHAT : MAX_MESSAGES_PER_LOW_PRIORITY_CHAT;

          const messages = await chat.fetchMessages({ limit });
          const recentMessages = messages
            .filter((m: any) => (m.timestamp || 0) >= cutoffTimestamp)
            .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

          if (recentMessages.length === 0) continue;

          context += `\n## Chat: "${chatName}"${chat.isGroup ? ' (Gruppe)' : ''}\n`;

          for (const msg of recentMessages) {
            if (totalMessages >= MAX_TOTAL_MESSAGES) break;

            const sender = msg.author || msg.from || 'Teilnehmer';
            const body = msg.body ? msg.body.trim().replace(/\r?\n+/g, ' ') : '(Kein Text / Medien)';
            const dateStr = msg.timestamp
              ? new Date(msg.timestamp * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
              : '';

            if (recordEvidence) {
              recordEvidence([{
                sourceType: 'whatsapp',
                sourceId: `whatsapp:${chat.id?._serialized || chat.id}:${msg.id?._serialized || msg.id}`,
                content: `${chatName} - ${sender} [${dateStr}]: ${body}`,
                sourceTimestamp: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
                author: sender,
                sourceUrl: `https://web.whatsapp.com`,
                parentId: String(chat.id?._serialized || chat.id),
                metadata: { platform: 'whatsapp', groupTitle: chatName, isGroup: Boolean(chat.isGroup) },
              }]);
            }

            context += `- [${dateStr}] ${sender}: ${body}\n`;
            totalMessages++;
          }
        }

        clearTimeout(timeout);
        try { await client.destroy(); } catch {}
        resolve(context);
      } catch (err: any) {
        clearTimeout(timeout);
        try { await client.destroy(); } catch {}
        resolve(`(WhatsApp-Nachrichten konnten nicht vollständig gelesen werden: ${err?.message || err})\n`);
      }
    });

    client.initialize().catch((err: any) => {
      clearTimeout(timeout);
      resolve(`(WhatsApp Initialisierungsfehler: ${err?.message || err})\n`);
    });
  });
}
