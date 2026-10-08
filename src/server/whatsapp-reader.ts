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
 * Es werden alle Nachrichten der letzten `daysBack` Tage (z. B. 2 bis 7 Tage) übernommen.
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
    let isResolved = false;
    const finish = async (result: string) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timeout);
      try { await client.destroy(); } catch {}
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finish('(WhatsApp: Zeitüberschreitung beim Laden der Nachrichten - Session prüfen)\n');
    }, 60000);

    client.on('auth_failure', () => {
      finish('(WhatsApp Authentifizierung fehlgeschlagen oder abgelaufen: Bitte "npm run agent -- whatsapp-auth" ausführen)\n');
    });

    client.on('qr', () => {
      finish('(WhatsApp nicht angemeldet: Bitte führe "npm run agent -- whatsapp-auth" aus)\n');
    });

    client.on('ready', async () => {
      try {
        const page = (client as any).pupPage;
        if (!page) {
          return finish('(WhatsApp: Browser-Page nicht verfügbar)\n');
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);
        const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

        const excludePatterns = getExcludedChatPatterns();
        const priorityPatterns = getPriorityChatPatterns();

        // Extrahiere alle aktiven Chats und deren Nachrichten direkt aus dem In-Memory-Model
        const extraction = await page.evaluate(async (cutoff: number, maxChats: number, maxPerChat: number, maxLowPerChat: number, maxTotal: number) => {
          const collections = (window as any).require ? (window as any).require('WAWebCollections') : null;
          if (!collections?.Chat) return { chats: [] };

          const allChatModels = collections.Chat.getModelsArray ? collections.Chat.getModelsArray() : (collections.Chat.models || []);
          const resChats: any[] = [];
          let currentTotal = 0;

          for (const chat of allChatModels) {
            if (chat.isArchived || chat.archive) continue;
            const chatTimestamp = chat.t || 0;
            if (chatTimestamp < cutoff) continue;

            const name = chat.name || chat.formattedTitle || chat.contact?.name || 'Unbekannter Chat';
            const chatId = chat.id?._serialized || String(chat.id);
            const isGroup = Boolean(chat.isGroup);

            // Versuche Nachrichten zu laden falls leer
            if (chat.loadEarlierMsgs && (!chat.msgs?.models || chat.msgs.models.length < 5)) {
              try { await chat.loadEarlierMsgs(); } catch {}
            }

            const rawMsgs = (chat.msgs?.getModelsArray ? chat.msgs.getModelsArray() : chat.msgs?.models) || [];
            const filteredMsgs = rawMsgs
              .filter((m: any) => (m.t || 0) >= cutoff)
              .map((m: any) => ({
                id: m.id?._serialized || String(m.id?.id || m.id),
                timestamp: m.t || 0,
                body: (m.body || m.caption || '').trim(),
                sender: m.notifyName || m.sender?.name || m.author?._serialized || m.from?._serialized || 'Teilnehmer',
              }))
              .filter((m: any) => m.body.length > 0)
              .sort((a: any, b: any) => a.timestamp - b.timestamp);

            if (filteredMsgs.length > 0) {
              resChats.push({
                id: chatId,
                name,
                isGroup,
                timestamp: chatTimestamp,
                messages: filteredMsgs,
              });
              currentTotal += filteredMsgs.length;
              if (resChats.length >= maxChats || currentTotal >= maxTotal) break;
            }
          }

          return { chats: resChats };
        }, cutoffTimestamp, MAX_CHATS, MAX_MESSAGES_PER_CHAT, MAX_MESSAGES_PER_LOW_PRIORITY_CHAT, MAX_TOTAL_MESSAGES);

        const extractedChats = (extraction?.chats || [])
          .filter((c: any) => !isExcludedChat(c.name, excludePatterns))
          .sort((a: any, b: any) => {
            const aPrio = isPriorityChat(a.name, priorityPatterns) ? 1 : 0;
            const bPrio = isPriorityChat(b.name, priorityPatterns) ? 1 : 0;
            if (aPrio !== bPrio) return bPrio - aPrio;
            return b.timestamp - a.timestamp;
          });

        if (extractedChats.length === 0) {
          return finish('(WhatsApp: Keine aktiven Chats mit Nachrichten im Zeitfenster gefunden)\n');
        }

        let context = `Aktuelle WhatsApp-Nachrichten (letzte ${daysBack} Tage, rein lesend):\n`;
        let totalMessages = 0;

        for (const chat of extractedChats) {
          context += `\n## Chat: "${chat.name}"${chat.isGroup ? ' (Gruppe)' : ''}\n`;
          for (const msg of chat.messages) {
            if (totalMessages >= MAX_TOTAL_MESSAGES) break;
            const dateStr = msg.timestamp
              ? new Date(msg.timestamp * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
              : '';

            if (recordEvidence) {
              recordEvidence([{
                sourceType: 'whatsapp',
                sourceId: `whatsapp:${chat.id}:${msg.id}`,
                content: `${chat.name} - ${msg.sender} [${dateStr}]: ${msg.body.replace(/\r?\n+/g, ' ')}`,
                sourceTimestamp: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
                author: msg.sender,
                sourceUrl: `https://web.whatsapp.com`,
                parentId: chat.id,
                metadata: { platform: 'whatsapp', groupTitle: chat.name, isGroup: chat.isGroup },
              }]);
            }

            context += `- [${dateStr}] ${msg.sender}: ${msg.body.replace(/\r?\n+/g, ' ')}\n`;
            totalMessages++;
          }
        }

        console.log(`[WhatsApp Reader] Erfolgreich ${totalMessages} Nachrichten aus ${extractedChats.length} Chats geladen.`);
        return finish(context);
      } catch (err: any) {
        return finish(`(WhatsApp-Nachrichten konnten nicht vollständig gelesen werden: ${err?.message || err?.stack || err})\n`);
      }
    });

    client.initialize().catch((err: any) => {
      finish(`(WhatsApp Initialisierungsfehler: ${err?.message || err})\n`);
    });
  });
}
