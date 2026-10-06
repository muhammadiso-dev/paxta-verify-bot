const { dbService } = require('../database');

const ADMIN_IDS = (process.env.ADMIN_IDS || '100').split(',').map(s => s.trim());
const ORG_NAME = process.env.ORG_NAME || 'Insider Verify';
const ORG_CHANNEL = process.env.ORG_CHANNEL || '@insider';

class MessageHandler {
  constructor(bot) {
    this.bot = bot;
  }

  async handle(msg) {
    const chatId = msg.chat?.id || msg.from?.id;
    const userId = msg.from?.id;
    const text = msg.text ? msg.text.trim() : '';
    const name = msg.from?.first_name || 'Foydalanuvchi';
    const username = msg.from?.username || '';

    const user = dbService.getOrCreateUser(userId, {
      first_name: name,
      username: username
    });

    // Bekor qilish
    if (text === '/cancel') {
      const tempData = user.temp_data || {};
      if (tempData.cleanup_ids) {
        for (const mid of tempData.cleanup_ids) {
          try { await this.bot.deleteMessage(chatId, mid); } catch (e) {}
        }
      }
      try { await this.bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
      dbService.updateUser(user.id, { step: null, temp_data: {} });
      await this.bot.sendMessage(chatId, '❌ Amal bekor qilindi.');
      return this.sendStart(chatId, user);
    }

    // Bosqichli harakatlar
    if (user.step) {
      return this.handleStep(chatId, user, text, msg.message_id);
    }

    // Buyruqlar
    if (text.startsWith('/start')) {
      return this.sendStart(chatId, user);
    }

    if (text === '/admin' && ADMIN_IDS.includes(String(userId))) {
      return this.sendAdminPanel(chatId);
    }

    if (text.startsWith('/verify') && ADMIN_IDS.includes(String(userId))) {
      return this.handleManualVerify(chatId, text);
    }

    if (text.startsWith('/revoke') && ADMIN_IDS.includes(String(userId))) {
      return this.handleManualRevoke(chatId, text);
    }

    if (text.startsWith('/setprice') && ADMIN_IDS.includes(String(userId))) {
      return this.handleSetPrice(chatId, text);
    }

    if (text.startsWith('/broadcast') && ADMIN_IDS.includes(String(userId))) {
      return this.handleBroadcast(chatId, text);
    }

    // Standart javob
    return this.sendStart(chatId, user);
  }

  // Bosh Menyu
  async sendStart(chatId, user) {
    const text =
      `🛡️ **Xush kelibsiz! — ${ORG_NAME} Rasmiy Markazi**\n\n` +
      `Biz Paxta.online platformasidagi akkauntlar, loyihalar va kanallarni rasmiy tekshiruvdan o'tkazuvchi va **tasdiqlanganlik nishonini (Verification Badge)** beruvchi tashkilotmiz.\n\n` +
      `✨ **Bot imkoniyatlari:**\n` +
      `• 📋 **Reyestr:** Tasdiqlangan barcha rasmiy akkauntlar ro'yxati\n` +
      `• 🔍 **Tekshirish:** Birovning nishoni haqiqiy yoki soxtaligini aniqlash\n` +
      `• 💎 **Verifikatsiya Olish:** O'z profilingiz yoki kanalingizga nishon olish\n` +
      `• 🚨 **Shikoyat Markazi:** Firibgarlik yoki qoidabuzarlik haqida xabar berish\n\n` +
      `Bosh tashkilot kanali: **${ORG_CHANNEL}**\n\n` +
      `Kerakli bo'limni tanlang:`;

    const keyboard = [
      [
        { text: '📋 Tasdiqlanganlar Reyestri', callback_data: 'menu:registry' },
        { text: '🔍 Akkauntni Tekshirish', callback_data: 'search:start' }
      ],
      [
        { text: '💎 Verifikatsiya Olish', callback_data: 'menu:apply' },
        { text: '🚨 Shikoyat Yuborish', callback_data: 'menu:report' }
      ],
      [
        { text: '📜 Qoidalar va Shartlar', callback_data: 'menu:rules' }
      ]
    ];

    await this.bot.sendMessage(chatId, text, {
      replyMarkup: { inline_keyboard: keyboard }
    });
  }

  // Bosqichlarni boshqarish (Wizard Flow)
  async handleStep(chatId, user, text, currentMsgId) {
    const tempData = user.temp_data || {};
    if (!tempData.cleanup_ids) tempData.cleanup_ids = [];
    if (currentMsgId) tempData.cleanup_ids.push(currentMsgId);

    const cleanupChat = async () => {
      for (const mid of tempData.cleanup_ids) {
        try { await this.bot.deleteMessage(chatId, mid); } catch (e) {}
      }
    };

    // 1. Qidiruv / Tekshirish
    if (user.step === 'search_query') {
      const clean = text.replace('@', '').trim();
      const verified = dbService.findVerified(clean);

      await cleanupChat();
      dbService.updateUser(user.id, { step: null, temp_data: {} });

      const backKeyboard = [
        [{ text: '🔍 Boshqa Akkauntni Tekshirish', callback_data: 'search:start' }],
        [{ text: '📋 Barcha Nishonlar Reyestri', callback_data: 'menu:registry' }],
        [{ text: '⬅️ Asosiy Menyu', callback_data: 'menu:main' }]
      ];

      if (verified && verified.status === 'active') {
        let icon = '👤';
        if (verified.target_type === 'channel') icon = '📢';
        if (verified.target_type === 'bot') icon = '🤖';

        const date = new Date(verified.verified_at).toLocaleDateString();
        const exp = new Date(verified.expires_at).toLocaleDateString();

        return this.bot.sendMessage(chatId,
          `🟢 **RASMIY TASDIQLANGAN AKKAUNT!**\n\n` +
          `• Nomi: **${verified.title}**\n` +
          `• Username: **@${verified.username}** ${icon}\n` +
          `• Tashkilot: **${ORG_NAME}**\n` +
          `• Soha: \`${verified.category}\`\n` +
          `• Tasdiqlangan: \`${date}\`\n` +
          `• Amal qilish muddati: \`${exp}\` gacha\n` +
          `• Holati: 🟢 **FAOL VA ISHONCHLI**\n\n` +
          `✅ Ushbu akkaunt rasmiy ro'yxatdan o'tgan, unga to'liq ishonishingiz mumkin!`, {
            replyMarkup: { inline_keyboard: backKeyboard }
          }
        );
      } else if (verified && verified.status === 'revoked') {
        return this.bot.sendMessage(chatId,
          `🔴 **OGOHLANTIRISH! NISHON BEKOR QILINGAN!**\n\n` +
          `**@${clean}** akkauntining rasmiy nishoni qoidabuzarlik yoki shikoyat sababli **BEKOR QILINGAN!**\n\n` +
          `⚠️ Ushbu akkaunt bilan savdo yoki hamkorlik qilish tavsiya etilmaydi!`, {
            replyMarkup: { inline_keyboard: backKeyboard }
          }
        );
      } else {
        return this.bot.sendMessage(chatId,
          `⚪ **DIQQAT! Akkaunt Reyestrda Mavjud Emas.**\n\n` +
          `**@${clean}** akkaunti bizning **${ORG_NAME}** tashkilotimiz tomonidan tasdiqlanmagan.\n\n` +
          `⚠️ Agar kimdir sizga nishoni borligini da'vo qilayotgan bo'lsa, u soxta bo'lishi mumkin.`, {
            replyMarkup: { inline_keyboard: backKeyboard }
          }
        );
      }
    }

    // 2. Ariza topshirish: Username kiritish
    if (user.step === 'apply_username') {
      const clean = text.replace('@', '').trim();
      tempData.target_username = clean;

      const sent = await this.bot.sendMessage(chatId,
        `✅ Akkaunt: **@${clean}**\n\n` +
        `📝 **2-Qadam:** Faoliyat sohangizni yozing (Masalan: **IT / Dasturlash**, **Blog**, **Savdo / Bozor**, **Avto**, **Kripto**):\n\n` +
        `__(Bekor qilish uchun /cancel deb yozing)__`
      );

      if (sent?.message_id) tempData.cleanup_ids.push(sent.message_id);

      dbService.updateUser(user.id, {
        step: 'apply_category',
        temp_data: tempData
      });
      return;
    }

    // 2.1 Ariza: Kategoriya kiritish
    if (user.step === 'apply_category') {
      tempData.category = text.trim();

      const sent = await this.bot.sendMessage(chatId,
        `📝 **3-Qadam:** Nima sababdan verifikatsiya olmoqchisiz va loyihangiz/kanalingiz haqida qisqacha ma'lumot bering:\n\n` +
        `__(Bekor qilish uchun /cancel deb yozing)__`
      );

      if (sent?.message_id) tempData.cleanup_ids.push(sent.message_id);

      dbService.updateUser(user.id, {
        step: 'apply_reason',
        temp_data: tempData
      });
      return;
    }

    // 2.2 Ariza: Sabab va yakunlash
    if (user.step === 'apply_reason') {
      tempData.reason = text.trim();
      tempData.applicant_username = user.username || '';

      const settings = dbService.getSettings();
      let price = settings.prices.profile_6m || 20000;
      let plan = 'profile_6m';

      if (tempData.target_type === 'channel') {
        price = settings.prices.channel_6m || 35000;
        plan = 'channel_6m';
      } else if (tempData.target_type === 'bot') {
        price = settings.prices.bot_6m || 50000;
        plan = 'bot_6m';
      }

      tempData.price = price;
      tempData.plan = plan;

      // Oraliq barcha yozishmalarni o'chirib tozalaymiz!
      await cleanupChat();

      // Arizani yaratamiz
      const app = dbService.createApplication(user.id, tempData);
      dbService.updateUser(user.id, { step: null, temp_data: {} });

      const backKeyboard = [
        [{ text: '💬 To\'lov Uchun @shade ga Yozish', url: 'https://paxta.online/u/shade' }],
        [{ text: '⬅️ Asosiy Menyu', callback_data: 'menu:main' }]
      ];

      await this.bot.sendMessage(chatId,
        `🎉 **Arizangiz Muvaffaqiyatli Qabul Qilindi! (${app.id})**\n\n` +
        `• Akkaunt: **@${app.target_username}** (${app.target_type})\n` +
        `• Soha: **${app.category}**\n` +
        `• Tarif: **6 Oylik Sinov Tarifi** (\`${app.price} Stars\`)\n` +
        `• Sabab: ${app.reason}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ **Sinov Davri Sharti:** Nizomga muvofiq, kelgusida narxlar yangilanganda muddat maksimal 2 barobargacha (3 oygacha) qisqarishi mumkin.\n\n` +
        `💳 **TO'LOV VA TEKSHIRUV:**\n` +
        `To'lovni amalga oshirish va nishonni rasmiy qabul qilish uchun to'g'ridan-to'g'ri tashkilot rahbari **@shade** ga yozing.\n\n` +
        `⏳ Arizangiz ma'muriyat tomonidan ko'rib chiqilmoqda!`, {
          replyMarkup: { inline_keyboard: backKeyboard }
        }
      );

      // Adminga xabarnoma yuboramiz
      for (const adminId of ADMIN_IDS) {
        try {
          const notifyText =
            `🔔 **YANGI VERIFY ARIZASI! (${app.id})**\n\n` +
            `• Akkaunt: **@${app.target_username}** (${app.target_type})\n` +
            `• Arizachi: @${app.applicant_username} (ID: \`${app.applicant_id}\`)\n` +
            `• Soha: **${app.category}**\n` +
            `• Narx: \`${app.price} Stars\`\n` +
            `• Ma'lumot: ${app.reason}`;

          const keyboard = [
            [
              { text: '✅ Tasdiqlash', callback_data: `admin:app:approve:${app.id}` },
              { text: '❌ Rad etish', callback_data: `admin:app:reject:${app.id}` }
            ]
          ];

          await this.bot.sendMessage(adminId, notifyText, {
            replyMarkup: { inline_keyboard: keyboard }
          });
        } catch (e) {}
      }

      return;
    }

    // 3. Shikoyat topshirish: Target username
    if (user.step === 'report_target') {
      const clean = text.replace('@', '').trim();
      tempData.target_username = clean;

      const sent = await this.bot.sendMessage(chatId,
        `✅ Shikoyat qilinuvchi: **@${clean}**\n\n` +
        `📝 **2-Qadam:** Qanday qoidabuzarlik yoki firibgarlik sodir bo'ldi? Batafsil bayon qiling:\n\n` +
        `__(Bekor qilish uchun /cancel deb yozing)__`
      );

      if (sent?.message_id) tempData.cleanup_ids.push(sent.message_id);

      dbService.updateUser(user.id, {
        step: 'report_reason',
        temp_data: tempData
      });
      return;
    }

    // 3.1 Shikoyat sababi
    if (user.step === 'report_reason') {
      tempData.reason = text.trim();

      const sent = await this.bot.sendMessage(chatId,
        `📝 **3-Qadam:** Qo'shimcha dalillar yoki havolalar (agar bo'lsa kiriting, bo'lmasa "yo'q" deb yozing):\n\n` +
        `__(Bekor qilish uchun /cancel deb yozing)__`
      );

      if (sent?.message_id) tempData.cleanup_ids.push(sent.message_id);

      dbService.updateUser(user.id, {
        step: 'report_evidence',
        temp_data: tempData
      });
      return;
    }

    // 3.2 Shikoyat yakunlash
    if (user.step === 'report_evidence') {
      tempData.evidence = text.trim();
      tempData.reporter_username = user.username || '';

      // Oraliq xabarlarni tozalaymiz!
      await cleanupChat();

      const cmp = dbService.createComplaint(user.id, tempData);
      dbService.updateUser(user.id, { step: null, temp_data: {} });

      const backKeyboard = [
        [{ text: '⬅️ Asosiy Menyu', callback_data: 'menu:main' }]
      ];

      await this.bot.sendMessage(chatId,
        `✅ **Shikoyatingiz Qabul Qilindi! (${cmp.id})**\n\n` +
        `Bizning ma'muriyatimiz zudlik bilan **@${cmp.target_username}** faoliyatini tekshiradi.\n\n` +
        `Tekshiruv natijasi (qabul qilingani yoki rad etilgani) haqida sizga ushbu bot orqali rasmiy xabarnoma yuboriladi! 🛡️`, {
          replyMarkup: { inline_keyboard: backKeyboard }
        }
      );

      // Adminga shikoyatni yetkazish
      for (const adminId of ADMIN_IDS) {
        try {
          const notifyText =
            `🚨 **YANGI SHIKOYAT TUSHDI! (${cmp.id})**\n\n` +
            `• Ayblanuvchi: **@${cmp.target_username}**\n` +
            `• Shikoyatchi: @${cmp.reporter_username} (ID: \`${cmp.reporter_id}\`)\n` +
            `• Tafsilot: ${cmp.reason}\n` +
            `• Dalil: ${cmp.evidence}`;

          const keyboard = [
            [
              { text: '🛡️ Nishonni Olib Tashlash', callback_data: `admin:cmp:revoke:${cmp.id}` },
              { text: '❌ Asossiz deb yopish', callback_data: `admin:cmp:dismiss:${cmp.id}` }
            ]
          ];

          await this.bot.sendMessage(adminId, notifyText, {
            replyMarkup: { inline_keyboard: keyboard }
          });
        } catch (e) {}
      }

      return;
    }
  }

  // Admin Panel
  async sendAdminPanel(chatId) {
    const stats = dbService.getStats();
    const settings = dbService.getSettings();

    const text =
      `👑 **Admin Panel — ${ORG_NAME}**\n\n` +
      `📊 **Statistika:**\n` +
      `• 👥 Jami foydalanuvchilar: **${stats.totalUsers} ta**\n` +
      `• 🛡️ Faol nishonlar: **${stats.activeVerified} ta**\n` +
      `• 📥 Kutilayotgan arizalar: **${stats.pendingApps} ta**\n` +
      `• 🚨 Ko'rilmagan shikoyatlar: **${stats.pendingComps} ta**\n\n` +
      `💰 **Joriy Tariflar (6 Oylik Sinov):**\n` +
      `• Profil (6m): **${settings.prices.profile_6m} ⭐**\n` +
      `• Kanal (6m): **${settings.prices.channel_6m} ⭐**\n` +
      `• Bot (6m): **${settings.prices.bot_6m} ⭐**\n\n` +
      `⚙️ **Tezkor Buyruqlar:**\n` +
      `• \`/verify <@username> <user|channel|bot> [nomi]\` — Nishon berish\n` +
      `• \`/revoke <@username>\` — Nishonni bekor qilish\n` +
      `• \`/setprice <tarif> <narx>\` — Narxni yangilash\n` +
      `• \`/broadcast <matn>\` — Ommaviy e'lon`;

    const keyboard = [
      [
        { text: `📥 Arizalar (${stats.pendingApps})`, callback_data: 'admin:apps:pending' },
        { text: `🚨 Shikoyatlar (${stats.pendingComps})`, callback_data: 'admin:comps:pending' }
      ],
      [
        { text: '📋 Barcha Nishonlar', callback_data: 'menu:registry' },
        { text: '⬅️ Asosiy Menyu', callback_data: 'menu:main' }
      ]
    ];

    await this.bot.sendMessage(chatId, text, {
      replyMarkup: { inline_keyboard: keyboard }
    });
  }

  // Qo'lda Verify berish: /verify @username <user|channel|bot> [nomi]
  async handleManualVerify(chatId, text) {
    const parts = text.split(' ').filter(Boolean);
    if (parts.length < 3) {
      return this.bot.sendMessage(chatId,
        `❌ **Format noto'g'ri!**\n\n` +
        `Foydalanish: \`/verify <@username> <user|channel|bot> [nomi]\`\n\n` +
        `__Misollar:__\n` +
        `• \`/verify @shade user Muhammadiso\`\n` +
        `• \`/verify @insider channel Insider\`\n` +
        `• \`/verify @Soat_bot bot Soat Bot\``
      );
    }

    const username = parts[1].replace('@', '').trim();
    let type = 'user';
    const rawType = parts[2].toLowerCase();
    if (rawType === 'channel') type = 'channel';
    if (rawType === 'bot') type = 'bot';

    const title = parts.slice(3).join(' ') || username;

    const item = dbService.addVerified({
      target_type: type,
      username: username,
      title: title,
      category: 'Admin tomonidan tasdiqlangan',
      notes: 'Admin qo\'lda tasdiqladi'
    });

    await this.bot.sendMessage(chatId,
      `✅ **Muvaffaqiyatli tasdiqlandi!**\n\n` +
      `• Akkaunt: **@${item.username}** (${item.target_type})\n` +
      `• Nomi: **${item.title}**\n` +
      `• Reyestrga qo'shildi va nishon faol holatga keltirildi!`
    );
  }

  // Qo'lda Nishonni olib tashlash: /revoke @username
  async handleManualRevoke(chatId, text) {
    const parts = text.split(' ').filter(Boolean);
    if (parts.length < 2) {
      return this.bot.sendMessage(chatId, '❌ Format: `/revoke <@username>`');
    }

    const username = parts[1].replace('@', '').trim();
    const updated = dbService.updateVerifiedStatus(username, 'revoked', 'Admin qo\'lda bekor qildi');

    if (!updated) {
      return this.bot.sendMessage(chatId, `❌ **@${username}** reyestrda topilmadi.`);
    }

    await this.bot.sendMessage(chatId, `🔴 **@${username}** nishoni muvaffaqiyatli bekor qilindi!`);
  }

  // Narx o'zgartirish: /setprice <profile_1m|profile_1y|channel_1m|channel_1y> <narx>
  async handleSetPrice(chatId, text) {
    const parts = text.split(' ').filter(Boolean);
    if (parts.length < 3) {
      return this.bot.sendMessage(chatId,
        `❌ **Format noto'g'ri!**\n\n` +
        `Foydalanish: \`/setprice <tarif> <narx>\`\n\n` +
        `Tariflar:\n` +
        `• \`profile_1m\` — Profil 1 oylik\n` +
        `• \`profile_1y\` — Profil 1 yillik\n` +
        `• \`channel_1m\` — Kanal 1 oylik\n` +
        `• \`channel_1y\` — Kanal 1 yillik\n\n` +
        `__Misol:__ \`/setprice profile_1y 2000\``
      );
    }

    const key = parts[1].toLowerCase();
    const price = parseInt(parts[2]);

    if (isNaN(price) || price <= 0) {
      return this.bot.sendMessage(chatId, '❌ Narx musbat son bo\'lishi kerak.');
    }

    const updated = dbService.updatePrices({ [key]: price });
    await this.bot.sendMessage(chatId, `✅ **Tarif yangilandi:** \`${key}\` = **${price} Stars**`);
  }

  // Broadcast
  async handleBroadcast(chatId, text) {
    const msg = text.replace('/broadcast', '').trim();
    if (!msg) return this.bot.sendMessage(chatId, '❌ Xabar matnini kiriting.');

    const users = dbService.getAllUsers();
    let count = 0;
    for (const u of users) {
      try {
        await this.bot.sendMessage(u.id, `📢 **${ORG_NAME} E'loni:**\n\n${msg}`);
        count++;
      } catch (e) {}
    }
    await this.bot.sendMessage(chatId, `✅ Xabar ${count} ta foydalanuvchiga yuborildi.`);
  }
}

module.exports = { MessageHandler };
