import { fetchWhatsAppMessages } from '../src/server/whatsapp-reader.ts';

console.log('--- Teste WhatsApp Ingestion (letzte 7 Tage) ---');
const result = await fetchWhatsAppMessages(undefined, 7);
console.log('Ergebnis:');
console.log(result);
