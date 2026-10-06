const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'verify_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultDb = {
  users: {},
  verified: {}, // Tasdiqlanganlar reyestri
  applications: {}, // Arizalar
  complaints: {}, // Shikoyatlar
  settings: {
    prices: {
      profile_6m: 20000,
      profile_1m: 4000,
      channel_6m: 35000,
      channel_1m: 7000,
      bot_6m: 50000,
      bot_1m: 10000
    },
    payment_contact: '@shade',
    rules: `1. 🛡️ HALOLLIK VA XAVFSIZLIK TALABI:
Har bir tasdiqlangan profil, kanal va bot o'z faoliyatida 100% qonuniy va halol bo'lishi shart.

2. 🚫 TAQIQLANGAN HARAKATLAR:
• Firibgarlik (Scam), aldamchilik va moliyaviy piramidalar;
• Shaxsiy ma'lumotlarni o'g'irlash (Phishing), zararli havolalar;
• Soxta yutuqli o'yinlar (Fake Giveaway) va aldamchi auksionlar;
• 18+ kontent, zo'ravonlik va noqonuniy mahsulotlar savdosi.

3. 🤖 BOTLAR UCHUN MAXSUS TALABLAR:
• Bot foydalanuvchilarning login, parol yoki to'lov ma'lumotlarini o'g'irlamasligi va xavfsiz saqlashi;
• 24/7 rejimida barqaror va nosozliklarsiz ishlashi;
• Botda to'lovlar va xizmatlar ko'rsatilishi shaffof bo'lishi shart.

4. 📢 KANALLAR VA GURUHLAR UCHUN TALABLAR:
• Soxta obunachilar (nakrutka) orqali auditoriya ko'paytirmaslik;
• Tasdiqlanmagan yoki yolg'on reklama/yangiliklarni tarqatmaslik.

5. ⚖️ JAZO VA NISHONNI BEKOR QILISH:
• Agar nishon egasi ustidan asosli shikoyat tushsa va qoidabuzarlik isbotlansa, nishon ZUDLIK BILAN BEKOR QILINADI!
• Qoidabuzar akkaunt qora ro'yxatga kiritiladi va to'lov mutlaqo qaytarilmaydi!

6. 💳 TO'LOV VA ARIZA:
• To'lovlar faqat rasmiy tekshiruvdan so'ng @shade orqali qabul qilinadi.

7. 🔬 SINOV (BETA) DAVRI VA MUDDATLAR SHARTI:
• Hozirgi barcha tariflar platformadagi dastlabki Sinov Davri uchun belgilangan.
• Sinov davri yakunlanib, tizim rasmiy to'liq rejimga o'tgach, narxlar va obuna muddatlari qayta ko'rib chiqilishi mumkin.
• Ushbu sinov davrida nishon olgan foydalanuvchilarning muddati yangi narx siyosatiga ko'ra MAKSIMAL 2 BAROBARGACHA qisqartirilishi mumkin (Masalan: 6 oylik olingan bo'lsa, maksimal o'zgartirish holatida ham eng ko'pi bilan 3 oy kesilishi mumkin, ya'ni kafolatlangan minimum 3 oy xizmat ko'rsatiladi).
• Ariza topshirgan har bir arizachi ushbu sinov davri shartlariga to'liq rozilik bildirgan hisoblanadi.`
  }
};

let db = { ...defaultDb };

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      db = { ...defaultDb, ...JSON.parse(data) };
      // Narxlar va sozlamalarni yangilaymiz
      db.settings = { ...defaultDb.settings };
      db.settings.prices = { ...defaultDb.settings.prices };
      db.settings.rules = defaultDb.settings.rules;
      db.settings.payment_contact = '@shade';
      if (!db.verified) db.verified = {};
      if (!db.applications) db.applications = {};
      if (!db.complaints) db.complaints = {};
    } else {
      // Dastlabki namunaviy verifikatsiyalar
      db.verified['insider'] = {
        id: 'insider',
        target_type: 'channel',
        username: 'insider',
        title: 'Insider Rasmiy Kanal',
        category: 'Media / Yangiliklar',
        badge_name: 'Insider Verified',
        verified_at: new Date().toISOString(),
        expires_at: '2027-10-06T00:00:00.000Z',
        status: 'active',
        notes: 'Bosh tashkilot rasmiy kanali'
      };
      db.verified['shade'] = {
        id: 'shade',
        target_type: 'user',
        username: 'shade',
        title: 'Muhammadiso',
        category: 'Asoschi / Developer',
        badge_name: 'Insider Verified',
        verified_at: new Date().toISOString(),
        expires_at: '2027-10-06T00:00:00.000Z',
        status: 'active',
        notes: 'Tashkilot asoschisi va bosh ma\'muri'
      };
      saveDb();
    }
  } catch (err) {
    console.error('Database load error:', err);
    db = { ...defaultDb };
  }
}

function saveDb() {
  try {
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('Database save error:', err);
  }
}

loadDb();

const dbService = {
  // 1. Foydalanuvchilar
  getOrCreateUser(userId, data = {}) {
    const uid = String(userId);
    if (!db.users[uid]) {
      db.users[uid] = {
        id: uid,
        username: data.username || '',
        first_name: data.first_name || '',
        step: null,
        temp_data: {},
        created_at: new Date().toISOString()
      };
      saveDb();
    } else {
      if (data.username) db.users[uid].username = data.username;
      if (data.first_name) db.users[uid].first_name = data.first_name;
    }
    return db.users[uid];
  },

  getUser(userId) {
    return db.users[String(userId)] || null;
  },

  updateUser(userId, updates) {
    const uid = String(userId);
    if (db.users[uid]) {
      Object.assign(db.users[uid], updates);
      saveDb();
      return db.users[uid];
    }
    return null;
  },

  getAllUsers() {
    return Object.values(db.users);
  },

  // 2. Tasdiqlanganlar reyestri (Verified Registry)
  getVerifiedList(status = 'active') {
    const list = Object.values(db.verified);
    if (!status) return list;
    return list.filter(v => v.status === status);
  },

  findVerified(query) {
    if (!query) return null;
    const clean = query.replace('@', '').trim().toLowerCase();
    return Object.values(db.verified).find(v => 
      v.username.toLowerCase() === clean || 
      (v.id && v.id.toLowerCase() === clean)
    ) || null;
  },

  addVerified(data) {
    const clean = data.username.replace('@', '').trim();
    const key = clean.toLowerCase();
    const item = {
      id: key,
      target_type: data.target_type || 'user',
      username: clean,
      title: data.title || clean,
      category: data.category || 'Umumiy',
      badge_name: data.badge_name || 'Insider Verified',
      verified_at: new Date().toISOString(),
      expires_at: data.expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      notes: data.notes || ''
    };
    db.verified[key] = item;
    saveDb();
    return item;
  },

  updateVerifiedStatus(username, status, notes = '') {
    const key = username.replace('@', '').trim().toLowerCase();
    if (db.verified[key]) {
      db.verified[key].status = status; // 'active' | 'suspended' | 'revoked'
      if (notes) db.verified[key].notes = notes;
      saveDb();
      return db.verified[key];
    }
    return null;
  },

  deleteVerified(username) {
    const key = username.replace('@', '').trim().toLowerCase();
    if (db.verified[key]) {
      delete db.verified[key];
      saveDb();
      return true;
    }
    return false;
  },

  // 3. Arizalar (Applications)
  createApplication(applicantId, data) {
    const id = `APP-${Math.floor(1000 + Math.random() * 9000)}`;
    const app = {
      id,
      applicant_id: String(applicantId),
      applicant_username: data.applicant_username || '',
      target_type: data.target_type || 'user',
      target_username: data.target_username.replace('@', '').trim(),
      title: data.title || data.target_username,
      category: data.category || 'Umumiy',
      reason: data.reason || '',
      plan: data.plan || 'profile_1y',
      price: data.price || 1500,
      status: 'pending', // 'pending' | 'approved' | 'rejected'
      created_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      notes: ''
    };
    db.applications[id] = app;
    saveDb();
    return app;
  },

  getApplication(id) {
    return db.applications[id] || null;
  },

  getApplicationsByStatus(status = 'pending') {
    return Object.values(db.applications).filter(a => a.status === status);
  },

  updateApplication(id, updates) {
    if (db.applications[id]) {
      Object.assign(db.applications[id], updates);
      saveDb();
      return db.applications[id];
    }
    return null;
  },

  // 4. Shikoyatlar (Complaints)
  createComplaint(reporterId, data) {
    const id = `CMP-${Math.floor(1000 + Math.random() * 9000)}`;
    const cmp = {
      id,
      reporter_id: String(reporterId),
      reporter_username: data.reporter_username || '',
      target_username: data.target_username.replace('@', '').trim(),
      reason: data.reason || '',
      evidence: data.evidence || '',
      status: 'pending', // 'pending' | 'resolved' | 'dismissed'
      created_at: new Date().toISOString(),
      admin_notes: '',
      resolved_at: null
    };
    db.complaints[id] = cmp;
    saveDb();
    return cmp;
  },

  getComplaint(id) {
    return db.complaints[id] || null;
  },

  getComplaintsByStatus(status = 'pending') {
    return Object.values(db.complaints).filter(c => c.status === status);
  },

  updateComplaint(id, updates) {
    if (db.complaints[id]) {
      Object.assign(db.complaints[id], updates);
      saveDb();
      return db.complaints[id];
    }
    return null;
  },

  // 5. Statistika
  getStats() {
    const verified = Object.values(db.verified);
    const activeVerified = verified.filter(v => v.status === 'active');
    const apps = Object.values(db.applications);
    const pendingApps = apps.filter(a => a.status === 'pending');
    const comps = Object.values(db.complaints);
    const pendingComps = comps.filter(c => c.status === 'pending');

    return {
      totalUsers: Object.keys(db.users).length,
      totalVerified: verified.length,
      activeVerified: activeVerified.length,
      pendingApps: pendingApps.length,
      totalApps: apps.length,
      pendingComps: pendingComps.length,
      totalComps: comps.length
    };
  },

  getSettings() {
    return db.settings;
  },

  updatePrices(prices) {
    Object.assign(db.settings.prices, prices);
    saveDb();
    return db.settings.prices;
  }
};

module.exports = { dbService };
