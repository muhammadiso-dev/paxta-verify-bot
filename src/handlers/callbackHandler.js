const { dbService } = require('../database');
const { paxtaWebApi } = require('../services/paxtaWebApi');

const ADMIN_IDS = (process.env.ADMIN_IDS || '100').split(',').map(s => s.trim());
const ORG_NAME = process.env.ORG_NAME || 'Insider Verify';
const ORG_CHANNEL = process.env.ORG_CHANNEL || '@insider';

class CallbackHandler {
  constructor(bot) {
    this.bot = bot;
  }

  async handle(cb) {
    const callbackId = cb.id;
    const data = cb.data;
    const msg = cb.message;
    const chatId = msg?.chat?.id;
    const messageId = msg?.message_id;
    const userId = cb.from?.id;

    const user = dbService.getOrCreateUser(userId, {
      first_name: cb.from?.first_name || '',
      username: cb.from?.username || ''
    });

    await this.bot.answerCallbackQuery(callbackId);

    // 1. Asosiy Menyu
    if (data === 'menu:main') {
      const { MessageHandler } = require('./messageHandler');
      const mh = new MessageHandler(this.bot);
      return mh.sendStart(chatId, user);
    }

    // 2. Reyestr (Tasdiqlanganlar ro'yxati)
    if (data === 'menu:registry') {
      return this.sendRegistry(chatId, messageId);
    }

    // 3. Tekshirish (Qidiruv)
    if (data === 'search:start') {
      dbService.updateUser(user.id, { step: 'search_query' });
      return this.bot.sendMessage(chatId,
        `🔍 **Akkaunt yoki Kanalni Tekshirish**\n\n` +
        `Tekshirmoqchi bo'lgan akkaunt usernameini yozib yuboring (Masalan: **@shade** yoki **@insider**):\n\n` +
        `__(Bekor qilish uchun /cancel deb yozing)__`
      );
    }

    // 4. Ariza topshirish (Verifikatsiya olish)
    if (data === 'menu:apply') {
      return this.sendApplyTypeMenu(chatId, messageId);
    }

    if (data.startsWith('apply:type:')) {
      const targetType = data.replace('apply:type:', ''); // 'user' | 'channel' | 'bot'
      dbService.updateUser(user.id, {
        step: 'apply_username',
        temp_data: { target_type: targetType, menu_msg_id: messageId }
      });

      let label = 'Shaxsiy Profil';
      let ex = '@shade';
      if (targetType === 'channel') { label = 'Kanal / Guruh'; ex = '@insider'; }
      if (targetType === 'bot') { label = 'Bot'; ex = '@Verifiy_bot'; }

      await this.bot.editMessageText(chatId, messageId,
        `📝 **1-Qadam: ${label} usernameini yuboring**\n\n` +
        `Tasdiqlatmoqchi bo'lgan usernameingizni yozib yuboring (Masalan: **${ex}**):\n\n` +
        `💳 To'lovlar to'g'ridan-to'g'ri tashkilot rahbari **@shade** orqali amalga oshiriladi.\n\n` +
        `__(Bekor qilish uchun /cancel deb yozing)__`
      );
      return;
    }

    // 5. Shikoyat yuborish
    if (data === 'menu:report') {
      dbService.updateUser(user.id, {
        step: 'report_target',
        temp_data: { menu_msg_id: messageId }
      });
      await this.bot.editMessageText(chatId, messageId,
        `🚨 **Shikoyat Yuborish Markazi**\n\n` +
        `Bizning **${ORG_NAME}** nishoniga ega bo'lgan va qoidalarni buzgan akkaunt, kanal yoki bot ustidan shikoyat qilishingiz mumkin.\n\n` +
        `📝 **1-Qadam:** Qaysi akkaunt ustidan shikoyat qilmoqchisiz? Usernameini yuboring (Masalan: **@username**):\n\n` +
        `__(Bekor qilish uchun /cancel deb yozing)__`
      );
      return;
    }

    // 6. Qoidalar
    if (data === 'menu:rules') {
      return this.sendRules(chatId, messageId);
    }

    // ==========================================
    // ADMIN HARAKATLARI
    // ==========================================
    if (ADMIN_IDS.includes(String(userId))) {
      // Arizani tasdiqlash
      if (data.startsWith('admin:app:approve:')) {
        const appId = data.replace('admin:app:approve:', '');
        return this.adminApproveApplication(chatId, messageId, appId);
      }

      // Arizani rad etish
      if (data.startsWith('admin:app:reject:')) {
        const appId = data.replace('admin:app:reject:', '');
        return this.adminRejectApplication(chatId, messageId, appId);
      }

      // Shikoyat bo'yicha chora: Nishonni bekor qilish
      if (data.startsWith('admin:cmp:revoke:')) {
        const cmpId = data.replace('admin:cmp:revoke:', '');
        return this.adminRevokeByComplaint(chatId, messageId, cmpId);
      }

      // Shikoyatni rad etish / yopish
      if (data.startsWith('admin:cmp:dismiss:')) {
        const cmpId = data.replace('admin:cmp:dismiss:', '');
        return this.adminDismissComplaint(chatId, messageId, cmpId);
      }

      // Admin arizalar ro'yxati
      if (data === 'admin:apps:pending') {
        return this.sendAdminPendingApps(chatId, messageId);
      }

      // Admin shikoyatlar ro'yxati
      if (data === 'admin:comps:pending') {
        return this.sendAdminPendingComps(chatId, messageId);
      }
    }
  }

  // Reyestr ko'rinishi
  async sendRegistry(chatId, messageId) {
    const list = dbService.getVerifiedList('active');
    let text =
      `🛡️ **${ORG_NAME} — Rasmiy Tasdiqlanganlar Reyestri**\n\n` +
      `Quyidagi ro'yxatdagi barcha profil va kanallar bizning tashkilotimiz ko'rigidan o'tgan va rasmiy nishonga ega:\n\n`;

    if (list.length === 0) {
      text += `_Hozircha reyestrda faol nishonlar mavjud emas._\n\n`;
    } else {
      list.forEach((item, idx) => {
        const icon = item.target_type === 'channel' ? '📢' : '👤';
        const date = new Date(item.verified_at).toLocaleDateString();
        text += `${idx + 1}. ${icon} **${item.title}** (@${item.username})\n`;
        text += `   🏷️ Soha: \`${item.category}\` | 📅 Sana: \`${date}\`\n\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔎 Biror akkauntni soxta emasligini tekshirish uchun **"🔍 Qidirish"** tugmasini bosing.`;

    const keyboard = [
      [{ text: '🔍 Akkauntni Tekshirish (Qidiruv)', callback_data: 'search:start' }],
      [{ text: '💎 Verifikatsiya Olish', callback_data: 'menu:apply' }],
      [{ text: '⬅️ Asosiy Menyu', callback_data: 'menu:main' }]
    ];

    await this.bot.editMessageText(chatId, messageId, text, {
      replyMarkup: { inline_keyboard: keyboard }
    });
  }

  // Ariza turini tanlash
  async sendApplyTypeMenu(chatId, messageId) {
    const settings = dbService.getSettings();
    const prices = settings.prices;

    const text =
      `💎 **${ORG_NAME} Nishoniga Ariza Topshirish**\n\n` +
      `Bizning rasmiy verifikatsiyamiz sizning obro'yingiz, mijozlar ishonchi va brend nufuzingizni maksimal darajada oshiradi!\n\n` +
      `**📊 Rasmiy Tariflar (Sinov Davri):**\n` +
      `👤 **Shaxsiy Profil:**\n` +
      `• 🔥 6 Oylik: **${prices.profile_6m} Stars**\n` +
      `• 1 Oylik: \`${prices.profile_1m} Stars\`\n\n` +
      `📢 **Kanal / Guruh / Loyiha:**\n` +
      `• 🔥 6 Oylik: **${prices.channel_6m} Stars**\n` +
      `• 1 Oylik: \`${prices.channel_1m} Stars\`\n\n` +
      `🤖 **Bot (Paxta Botlari):**\n` +
      `• 🔥 6 Oylik: **${prices.bot_6m} Stars** (Texnik audit & nishon)\n` +
      `• 1 Oylik: \`${prices.bot_1m} Stars\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ **SINOV DAVRI SHARTI:**\n` +
      `Hozirgi tariflar sinov davri uchun amal qiladi. Kelgusida narxlar qayta ko'rib chiqilganda, ushbu davrda olingan nishonlar muddati **maksimal 2 barobargacha qisqartirilishi mumkin** (ya'ni 6 oylik nishon uchun kafolatlangan minimum 3 oy xizmat ko'rsatiladi).\n\n` +
      `💳 **To'lov Tartibi:**\n` +
      `To'lovlar to'g'ridan-to'g'ri tashkilot rahbari **@shade** orqali rasmiy qabul qilinadi.\n\n` +
      `Qaysi biri uchun verifikatsiya olmoqchisiz? Tanlang:`;

    const keyboard = [
      [{ text: `👤 Shaxsiy Profil (${prices.profile_6m} ⭐)`, callback_data: 'apply:type:user' }],
      [{ text: `📢 Kanal / Guruh (${prices.channel_6m} ⭐)`, callback_data: 'apply:type:channel' }],
      [{ text: `🤖 Bot uchun (${prices.bot_6m} ⭐)`, callback_data: 'apply:type:bot' }],
      [{ text: '📜 Qat\'iy Qoidalar va Nizom', callback_data: 'menu:rules' }],
      [{ text: '⬅️ Bosh Menyu', callback_data: 'menu:main' }]
    ];

    await this.bot.editMessageText(chatId, messageId, text, {
      replyMarkup: { inline_keyboard: keyboard }
    });
  }

  // Qoidalar menyusi
  async sendRules(chatId, messageId) {
    const settings = dbService.getSettings();
    const text =
      `📜 **${ORG_NAME} — Rasmiy Verifikatsiya Nizomi**\n\n` +
      `${settings.rules}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📩 Savollar va rasmiy murojaat uchun: **@shade** | **${ORG_CHANNEL}**`;

    const keyboard = [
      [{ text: '💎 Ariza Topshirish', callback_data: 'menu:apply' }],
      [{ text: '⬅️ Bosh Menyu', callback_data: 'menu:main' }]
    ];

    await this.bot.editMessageText(chatId, messageId, text, {
      replyMarkup: { inline_keyboard: keyboard }
    });
  }

  // Admin: Arizani tasdiqlash
  async adminApproveApplication(chatId, messageId, appId) {
    const app = dbService.getApplication(appId);
    if (!app || app.status !== 'pending') {
      return this.bot.sendMessage(chatId, '⚠️ Ushbu ariza allaqachon ko\'rib chiqilgan.');
    }

    // Reyestrga qo'shamiz
    const verified = dbService.addVerified({
      target_type: app.target_type,
      username: app.target_username,
      title: app.title || app.target_username,
      category: app.category || 'Rasmiy Tasdiqlangan',
      badge_name: 'Insider Verified',
      notes: `Ariza orqali tasdiqlandi: ${app.id}`
    });

    dbService.updateApplication(appId, {
      status: 'approved',
      reviewed_at: new Date().toISOString()
    });

    await this.bot.sendMessage(chatId,
      `✅ **Ariza tasdiqlandi! (${appId})**\n\n` +
      `@${app.target_username} (${app.target_type}) muvaffaqiyatli reyestrga qo'shildi va rasmiy nishon berildi.`
    );

    // Foydalanuvchiga tabrik yuborish
    try {
      await this.bot.sendMessage(app.applicant_id,
        `🎉 **TABRIKLAYMIZ! Arizangiz Tasdiqlandi!**\n\n` +
        `Sizning **@${app.target_username}** akkauntingiz **${ORG_NAME}** tomonidan rasmiy tasdiqlandi va reyestrga kiritildi! 🛡️\n\n` +
        `Tashkilotimiz nufuzini birgalikda saqlashimizga ishonamiz.`
      );
    } catch (e) {}
  }

  // Admin: Arizani rad etish
  async adminRejectApplication(chatId, messageId, appId) {
    const app = dbService.getApplication(appId);
    if (!app || app.status !== 'pending') {
      return this.bot.sendMessage(chatId, '⚠️ Ushbu ariza allaqachon ko\'rib chiqilgan.');
    }

    dbService.updateApplication(appId, {
      status: 'rejected',
      reviewed_at: new Date().toISOString()
    });

    await this.bot.sendMessage(chatId, `❌ **Ariza rad etildi (${appId})**`);

    // Foydalanuvchiga xabar
    try {
      await this.bot.sendMessage(app.applicant_id,
        `❌ **Arizangiz bo'yicha qaror:**\n\n` +
        `Afsuski, sizning **@${app.target_username}** bo'yicha arizangiz tashkilot ma'muriyati tomonidan qanoatlantirilmadi.`
      );
    } catch (e) {}
  }

  // Admin: Shikoyat asosida nishonni bekor qilish
  async adminRevokeByComplaint(chatId, messageId, cmpId) {
    const cmp = dbService.getComplaint(cmpId);
    if (!cmp) return;

    dbService.updateVerifiedStatus(cmp.target_username, 'revoked', `Shikoyat bo'yicha olib tashlandi: ${cmpId}`);
    dbService.updateComplaint(cmpId, {
      status: 'resolved',
      admin_notes: 'Nishon olib tashlandi',
      resolved_at: new Date().toISOString()
    });

    await this.bot.sendMessage(chatId, `🛡️ **@${cmp.target_username} dan nishon muvaffaqiyatli olib tashlandi!**`);

    // Shikoyatchiga xabar yuborish
    try {
      await this.bot.sendMessage(cmp.reporter_id,
        `✅ **Shikoyatingiz Qanoatlantirildi!**\n\n` +
        `Sizning **@${cmp.target_username}** ustidan yuborgan shikoyatingiz (${cmp.id}) tashkilot ma'muriyati tomonidan to'liq tekshirildi.\n\n` +
        `Qoidabuzarlik tasdiqlangani sababli ushbu akkauntdan **${ORG_NAME}** rasmiy nishoni BUTUNLAY BEKOR QILINDI! 🛡️\n\n` +
        `Platforma tozaligi va xavfsizligiga befarq bo'lmaganingiz uchun tashakkur bildiramiz.`
      );
    } catch (e) {}
  }

  // Admin: Shikoyatni rad etish
  async adminDismissComplaint(chatId, messageId, cmpId) {
    const cmp = dbService.getComplaint(cmpId);
    if (!cmp) return;

    dbService.updateComplaint(cmpId, {
      status: 'dismissed',
      admin_notes: 'Asossiz shikoyat',
      resolved_at: new Date().toISOString()
    });

    await this.bot.sendMessage(chatId, `✅ Shikoyat ${cmpId} asossiz deb yopildi.`);

    // Shikoyatchiga rad javobi yuborish
    try {
      await this.bot.sendMessage(cmp.reporter_id,
        `❌ **Shikoyatingiz Rad Etildi:**\n\n` +
        `Sizning **@${cmp.target_username}** ustidan yuborgan shikoyatingiz (${cmp.id}) ko'rib chiqildi.\n\n` +
        `Tekshiruv natijasida dalillar yetarli emasligi yoki qoidabuzarlik aniqlanmagani sababli shikoyat asossiz deb topildi va yopildi.`
      );
    } catch (e) {}
  }

  // Admin: Kutilayotgan arizalar ro'yxati
  async sendAdminPendingApps(chatId, messageId) {
    const apps = dbService.getApplicationsByStatus('pending');
    if (apps.length === 0) {
      return this.bot.sendMessage(chatId, 'ℹ️ Hozircha kutilayotgan arizalar mavjud emas.');
    }

    for (const app of apps) {
      const text =
        `📥 **Yangi Ariza: ${app.id}**\n\n` +
        `• Akkaunt: **@${app.target_username}** (${app.target_type})\n` +
        `• Arizachi: @${app.applicant_username} (ID: \`${app.applicant_id}\`)\n` +
        `• Soha / Faoliyat: **${app.category}**\n` +
        `• Sabab: ${app.reason}\n` +
        `• Reja: \`${app.plan}\` (${app.price} Stars)`;

      const keyboard = [
        [
          { text: '✅ Tasdiqlash', callback_data: `admin:app:approve:${app.id}` },
          { text: '❌ Rad etish', callback_data: `admin:app:reject:${app.id}` }
        ]
      ];

      await this.bot.sendMessage(chatId, text, {
        replyMarkup: { inline_keyboard: keyboard }
      });
    }
  }

  // Admin: Kutilayotgan shikoyatlar
  async sendAdminPendingComps(chatId, messageId) {
    const comps = dbService.getComplaintsByStatus('pending');
    if (comps.length === 0) {
      return this.bot.sendMessage(chatId, 'ℹ️ Hozircha yangi shikoyatlar mavjud emas.');
    }

    for (const c of comps) {
      const text =
        `🚨 **Shikoyat: ${c.id}**\n\n` +
        `• Ayblanuvchi: **@${c.target_username}**\n` +
        `• Shikoyatchi: @${c.reporter_username} (ID: \`${c.reporter_id}\`)\n` +
        `• Sabab / Tafsilot: ${c.reason}\n` +
        `• Dalillar: ${c.evidence || 'Keltirilmagan'}`;

      const keyboard = [
        [
          { text: '🛡️ Nishonni Olib Tashlash', callback_data: `admin:cmp:revoke:${c.id}` },
          { text: '❌ Asossiz (Yopish)', callback_data: `admin:cmp:dismiss:${c.id}` }
        ]
      ];

      await this.bot.sendMessage(chatId, text, {
        replyMarkup: { inline_keyboard: keyboard }
      });
    }
  }
}

module.exports = { CallbackHandler };
