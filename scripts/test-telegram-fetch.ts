import 'dotenv/config';
import { fetchTelegramGroupMessages } from '../src/server/telegram-reader.ts';

const result = await fetchTelegramGroupMessages();
const lines = result.split('\n').filter(Boolean);
console.log(`--- Ergebnis: ${lines.length} Zeilen ---`);
console.log(lines.slice(0, 5).join('\n'));
if (lines.length > 5) console.log(`... (${lines.length - 5} weitere Zeilen)`);
