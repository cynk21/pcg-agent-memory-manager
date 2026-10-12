import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import * as fs from 'fs';
import * as path from 'path';

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];
let chromePath: string | undefined;
for (const p of chromeCandidates) {
  if (fs.existsSync(p)) { chromePath = p; break; }
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: process.cwd() }),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  },
});

client.on('ready', async () => {
  console.log('CLIENT READY!');
  try {
    const page = (client as any).pupPage;
    const fetchRes = await page.evaluate(async () => {
      try {
        const collections = window.require ? window.require('WAWebCollections') : null;
        const chat = collections.Chat.get('491719191613-1466363927@g.us');
        
        let fetched: any = null;
        if (window.require) {
          const loadMsgs = window.require('WAWebMsgLoad') || window.require('WAWebMsgLoadEarlier');
          const findMsgs = window.require('WAWebFindChatMsgs') || window.require('WAWebMsgFind');
          fetched = {
            hasLoad: Boolean(loadMsgs),
            hasFind: Boolean(findMsgs),
            chatKeys: chat ? Object.keys(chat) : []
          };
        }

        // Teste chat.fetchMessages-Äquivalent
        if (chat && chat.loadEarlierMsgs) {
          await chat.loadEarlierMsgs();
        }

        const msgs = (chat?.msgs?.getModelsArray ? chat.msgs.getModelsArray() : chat?.msgs?.models) || [];
        return {
          fetched,
          msgsCount: msgs.length,
          lastMsgs: msgs.slice(-5).map((m: any) => ({
            id: m.id?._serialized,
            body: m.body || m.caption,
            t: m.t,
            from: m.from?._serialized,
            author: m.author?._serialized,
            notifyName: m.notifyName || m.sender?.name
          }))
        };
      } catch (e: any) {
        return { err: e.message || String(e), stack: e.stack };
      }
    });
    console.log('Fetch Result:', JSON.stringify(fetchRes, null, 2));
  } catch (err) {
    console.error('Eval error:', err);
  } finally {
    await client.destroy();
    process.exit(0);
  }
});

client.initialize();
