import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// Änderungserkennung für den Daily-Lauf: Pro Quelle wird ein Fingerabdruck gespeichert.
// Nur neue oder geänderte Blöcke werden ans Modell gegeben; der Rest bleibt außen vor.

const STATE_FILE = path.join(process.cwd(), '.daily-state.json');

/**
 * Zerlegt einen Quellen-Kontext in Blöcke mit stabilem Schlüssel.
 * Mails und Chat-Zeilen sind je Zeile ein Block; Telegram/WhatsApp-Gruppen (`## Chat:`) sind je Gruppe ein Block.
 */
export function splitSourceBlocks(sourceName: string, context: string): [string, string][] {
  const lines = context.split('\n');
  const blocks: [string, string][] = [];
  let currentKey = `${sourceName}:header`;
  let buffer: string[] = [];
  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content) blocks.push([currentKey, content]);
    buffer = [];
  };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentKey = `${sourceName}:${line.slice(3).trim()}`;
      buffer.push(line);
    } else if (line.startsWith('- ')) {
      flush();
      currentKey = `${sourceName}:${line.slice(2, 120).trim()}`;
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return blocks;
}

export function fingerprint(text: string): string {
  // Zeitabhängige Zusätze (Altersvermerk) ändern sich täglich, nicht der Inhalt.
  const stable = text.replace(/\s*\[⚠️ HISTORISCHE E-MAIL \(\d+ Tage alt\)[^\]]*\]/g, '');
  return createHash('sha256').update(stable, 'utf8').digest('hex');
}

export function loadDailyState(file: string = STATE_FILE): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveDailyState(state: Record<string, string>, file: string = STATE_FILE): void {
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Gibt nur die Blöcke zurück, die seit dem letzten Lauf neu oder geändert sind.
 * `blocks` ist eine Liste von [schlüssel, inhalt]. Der Schlüssel ist z. B. "gmail:<id>".
 */
export function selectChangedBlocks(
  blocks: [string, string][],
  previous: Record<string, string>,
): { changed: [string, string][]; unchangedCount: number; next: Record<string, string> } {
  const next: Record<string, string> = {};
  const changed: [string, string][] = [];
  let unchangedCount = 0;
  for (const [key, content] of blocks) {
    const fp = fingerprint(content);
    next[key] = fp;
    if (previous[key] === fp) {
      unchangedCount += 1;
    } else {
      changed.push([key, content]);
    }
  }
  return { changed, unchangedCount, next };
}
