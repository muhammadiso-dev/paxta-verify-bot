try { require('dotenv').config(); } catch (e) {}
const http = require('http');
const { PaxtaBotApi } = require('./services/paxtaBotApi');
const { MessageHandler } = require('./handlers/messageHandler');
const { CallbackHandler } = require('./handlers/callbackHandler');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi! Iltimos .env faylini tekshiring.');
  process.exit(1);
}

// Render Healthcheck Server
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🛡️ Insider Verify Bot is running!');
}).listen(PORT, () => {
  console.log(`🌐 Healthcheck server running on port ${PORT}`);
});

// ===============================================================
// 🛡️ ANTI-SLEEP CROSS-PING SYSTEM (Render Free Tier 24/7 Awake)
// Barcha botlar va servislarni bir-birini o'zaro uyg'otib turishi
// ===============================================================
const https = require('https');
const AWAKE_SERVICES = [
  'https://paxta-verify-bot.onrender.com',
  'https://paxta-soat-bot.onrender.com',
  'https://paxtamarket.onrender.com'
];

function pingAllServices() {
  AWAKE_SERVICES.forEach(url => {
    https.get(url, () => {}).on('error', () => {});
  });
}

// Har 5 daqiqada barcha servislarni ping qilib uxlatmaydi
setInterval(pingAllServices, 5 * 60 * 1000);
setTimeout(pingAllServices, 8000);

const bot = new PaxtaBotApi(BOT_TOKEN);
const messageHandler = new MessageHandler(bot);
const callbackHandler = new CallbackHandler(bot);

let offset = 0;
let isPolling = false;

async function start() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   🛡️ Insider Verify Bot v1.0           ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║   🤖 Bot: @Verifiy_bot                 ║');
  console.log('║   🌐 Platforma: paxta.online/bot       ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    const me = await bot.getMe();
    console.log(`✅ Bot muvaffaqiyatli ulandi: @${me.username} (${me.first_name})`);
  } catch (err) {
    console.error(`⚠️ getMe xatolik: ${err.message}`);
  }

  isPolling = true;
  poll();
}

async function poll() {
  while (isPolling) {
    try {
      const updates = await bot.getUpdates(offset, 100, 25);
      if (Array.isArray(updates)) {
        for (const upd of updates) {
          offset = upd.update_id + 1;
          handleUpdate(upd).catch(e => console.error('Update xatolik:', e.message));
        }
      }
    } catch (err) {
      await new Promise(r => setTimeout(r, 4000));
    }
    await new Promise(r => setTimeout(r, 400));
  }
}

async function handleUpdate(update) {
  if (update.message) {
    await messageHandler.handle(update.message);
  } else if (update.callback_query) {
    await callbackHandler.handle(update.callback_query);
  }
}

process.on('SIGINT', () => {
  console.log('\nTo\'xtatilmoqda...');
  isPolling = false;
  process.exit(0);
});

start();
