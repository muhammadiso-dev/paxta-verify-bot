const https = require('https');

class PaxtaWebApi {
  constructor() {
    this.hostname = 'paxta.online';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) InsiderVerifyBot/1.0';
  }

  // Profil yoki kanalni tekshirish
  async checkTarget(username) {
    const clean = username.replace('@', '').trim();
    return new Promise((resolve) => {
      https.get({
        hostname: this.hostname,
        path: `/api/users/${encodeURIComponent(clean)}`,
        headers: {
          'Accept': 'application/json',
          'User-Agent': this.userAgent
        }
      }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200 && json.user) {
              resolve({
                found: true,
                type: 'user',
                data: json.user
              });
            } else {
              resolve({ found: false, error: json.message || 'Topilmadi' });
            }
          } catch (e) {
            resolve({ found: false, error: 'Parse xatolik' });
          }
        });
      }).on('error', err => {
        resolve({ found: false, error: err.message });
      });
    });
  }
}

const paxtaWebApi = new PaxtaWebApi();
module.exports = { paxtaWebApi };
