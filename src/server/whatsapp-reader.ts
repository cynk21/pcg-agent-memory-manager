import * as fs from 'fs';
import * as path from 'path';

type RecordEvidence = (inputs: any[]) => void;

const AUTH_DIR = path.join(process.cwd(), '.whatsapp_auth');

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

  try {
    let baileys: any;
    try {
      baileys = await import('@whiskeysockets/baileys');
    } catch {
      return '(WhatsApp-Modul @whiskeysockets/baileys nicht geladen: Bitte "npm run agent -- whatsapp-auth" prüfen)\n';
    }

    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307], isLatest: false }));

    let sock: any;
    const socketPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WhatsApp Verbindungs-Timeout (15s)'));
      }, 15000);

      sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers ? Browsers.windows('Chrome') : ['Windows', 'Chrome', '131.0.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        logger: {
          level: 'silent',
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {},
          child: () => ({
            level: 'silent',
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {},
          }),
        } as any,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          if (!shouldReconnect) {
            clearTimeout(timeout);
            reject(new Error('WhatsApp Authentifizierung abgelaufen oder abgemeldet'));
          }
        } else if (connection === 'open') {
          clearTimeout(timeout);
          resolve(sock);
        }
      });
    });

    const activeSock = await socketPromise;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

    const excludePatterns = getExcludedChatPatterns();
    const priorityPatterns = getPriorityChatPatterns();

    let context = 'Aktuelle WhatsApp-Nachrichten (letzte 7 Tage, rein lesend):\n';
    let totalMessages = 0;

    // Beende Verbindung sauber
    try {
      activeSock.end(undefined);
    } catch {}

    if (totalMessages === 0) {
      return '(WhatsApp: Keine neuen Nachrichten im 7-Tage-Fenster gefunden)\n';
    }

    return context;
  } catch (err: any) {
    console.warn('[WhatsApp Reader] Fehler beim Abrufen der WhatsApp-Nachrichten:', err?.message || err);
    return `(WhatsApp-Abruf fehlgeschlagen: ${err?.message || err})\n`;
  }
}
