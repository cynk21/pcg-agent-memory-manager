import 'dotenv/config';
import { fetchTelegramGroupMessages } from '../src/server/telegram-reader.ts';

const result = await fetchTelegramGroupMessages();
const lines = result.split('\n').filter(Boolean);
const chats = lines.filter(l => l.startsWith('## Chat:'));
console.log(`--- Ergebnis: ${lines.length} Zeilen, ${chats.length} Chats ---`);
console.log(chats.join('\n'));
console.log('--- Erste Nachrichten ---');
console.log(lines.filter(l => l.startsWith('- ')).slice(0, 3).join('\n'));
