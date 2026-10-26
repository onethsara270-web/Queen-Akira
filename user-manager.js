/*
   ██████╗  █████╗ ████████╗██╗  ██╗██╗   ██╗███╗   ███╗     ████████╗███████╗ ██████╗██╗  ██╗
   ██╔══██╗██╔══██╗╚══██╔══╝██║  ██║██║   ██║████╗ ████║     ╚══██╔══╝██╔════╝██╔════╝██║  ██║
   ██████╔╝███████║   ██║   ███████║██║   ██║██╔████╔██║        ██║   █████╗  ██║     ███████║
   ██╔═══╝ ██╔══██║   ██║   ██╔══██║██║   ██║██║╚██╔╝██║        ██║   ██╔══╝  ██║     ██╔══██║
   ██║     ██║  ██║   ██║   ██║  ██║╚██████╔╝██║ ╚═╝ ██║        ██║   ███████╗╚██████╗██║  ██║
   ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝        ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝
        
                    ⚡ PATHUMTECH — WhatsApp Bot ⚡

    🛡️  WARNING — DO NOT REMOVE THIS CREDIT HEADER 🛡️
    ❌ ඉවත් කිරීම තහනම් | Removing credits is STRICTLY PROHIBITED

    📛 Original Author : PathumTech
    📅 Created         : 2024
    📦 Version         : 3.0.0
    🌐 Platform        : WhatsApp (Baileys Multi-Device)
    ⚙️  Framework       : @whiskeysockets/baileys

    📜  LICENSE & CREDIT NOTICE
    මෙම code එක PathumTech විසින් නිර්මාණය කරන ලදී.
    ඔබට මෙය edit කරන්න, වෙනස් කරන්න සහ භාවිතා කරන්න අවසර ඇත.
    නමුත් මෙම CREDIT HEADER එක ඉවත් කිරීම හෝ වෙනස් කිරීම
    සම්පූර්ණයෙන්ම තහනම් වේ. 🚫

    You are ALLOWED to :
      ✅ Use this code for personal & commercial purposes
      ✅ Modify, edit, and improve the code
      ✅ Share with friends (with credit intact)

    You are NOT ALLOWED to :
      ❌ Remove this credit header
      ❌ Claim this code as your own work
      ❌ Sell or redistribute without credit
      ❌ Change the author name to someone else

    📞  CONTACT
    👤  Owner      : Pathum Malsara
    📱  WhatsApp   : +94 77 341 6478
    📱  Support    : +94 76 106 8032
    📱  Support    : +94 72 397 5388
    🌐  GitHub     : github.com/pathumtech
    📺  YouTube    : @pathumtech

    ⚠️  LEGAL WARNING
    මෙම credit header එක ඉවත් කර, නැවත distribute කිරීම හෝ
    වෙනත් අයෙකුගේ නමින් පළ කිරීම —
    intellectual property theft (බුද්ධිමය දේපළ සොරකමක්) වේ.

    Credits removed = License terminated = No support = No updates

    © 2024 - 2026 PathumTech. All Rights Reserved.
*/


const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');

const config = require('./config');
let mongo = null;
try { mongo = require('./lib/mongo'); } catch (e) { mongo = null; }

const DATA_DIR = process.env.DATA_DIR || __dirname;
const USERS_FILE = path.join(DATA_DIR, 'data', 'users.json');
const USER_SESSIONS_DIR = path.join(DATA_DIR, 'user-sessions');
const USER_CONFIGS_DIR = path.join(DATA_DIR, 'user-configs');

[DATA_DIR, path.join(DATA_DIR, 'data'), USER_SESSIONS_DIR, USER_CONFIGS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const USERS = {};
const BOT_INSTANCES = new Map();

function cleanPhone(phone) { if (!phone) return ''; return String(phone).replace(/[^0-9]/g, '').trim(); }
function generateSessionId() { return 'sess_' + crypto.randomBytes(8).toString('hex'); }
function generateToken() { return crypto.randomBytes(24).toString('hex'); }
function generateOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }
function generateDashPassword() { return String(Math.floor(10000 + Math.random() * 90000)); }

function generateUnique5Digit() {
  const used = new Set();
  try { if (global.DASHBOARD_USERS) Object.keys(global.DASHBOARD_USERS).forEach(pw => used.add(String(pw))); } catch (e) {}
  try { Object.values(USERS || {}).forEach(u => { if (u && u.dashPassword) used.add(String(u.dashPassword)); }); } catch (e) {}
  let code, attempts = 0;
  do { code = String(Math.floor(10000 + Math.random() * 90000)); attempts++; }
  while (used.has(code) && attempts < 500);
  return code;
}

function getUserSessionDir(sessionId) {
  const dir = path.join(USER_SESSIONS_DIR, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getUserConfigPath(sessionId) { return path.join(USER_CONFIGS_DIR, `${sessionId}.json`); }

function loadUserConfig(sessionId) {
  try {
    const p = getUserConfigPath(sessionId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    const defPath = path.join(DATA_DIR, 'config.default.json');
    if (fs.existsSync(defPath)) return JSON.parse(fs.readFileSync(defPath, 'utf8'));
    return {};
  } catch (e) { return {}; }
}
function saveUserConfig(sessionId, cfg) {
  try { fs.writeFileSync(getUserConfigPath(sessionId), JSON.stringify(cfg, null, 2), 'utf8'); return true; }
  catch (e) { return false; }
}
function saveUsersToFile() {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2), 'utf8'); } catch (e) {}
}

async function loadUsers() {
  console.log('👥 Loading users...');
  if (mongo && typeof mongo.isConnected === 'function' && mongo.isConnected()) {
    try {
      if (typeof mongo.getAllUsers === 'function') {
        const mongoUsers = await mongo.getAllUsers();
        if (mongoUsers && mongoUsers.length) {
          for (const u of mongoUsers) if (u && u.phone) USERS[u.phone] = u;
          console.log(`👥 Loaded ${mongoUsers.length} from MongoDB`);
          try { saveUsersToFile(); } catch (e) {}
          return;
        }
      }
    } catch (e) { console.warn('⚠️ Mongo:', e.message); }
  }
  try {
    if (fs.existsSync(USERS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      for (const [phone, u] of Object.entries(parsed || {})) if (u && u.phone) USERS[phone] = u;
      console.log(`👥 Loaded ${Object.keys(USERS).length} from file`);
    }
  } catch (e) {}
}

async function persistUser(user) {
  if (!user || !user.phone) return;
  USERS[user.phone] = user;
  try { saveUsersToFile(); } catch (e) {}
  if (mongo && typeof mongo.isConnected === 'function' && mongo.isConnected()) {
    try { await mongo.saveUser(user); } catch (e) {}
  }
}

async function sendOTP(ownerConn, phone, otp) {
  if (!ownerConn) return { sent: false, error: 'No owner' };
  try {
    const jid = cleanPhone(phone) + '@s.whatsapp.net';
    await ownerConn.sendMessage(jid, { text: `🔐 OTP: *${otp}*` });
    return { sent: true };
  } catch (e) { return { sent: false, error: e.message }; }
}

// ══════════════════════════════════════════════════════════════
// 🤖 CREATE USER BOT
// ══════════════════════════════════════════════════════════════
async function createUserBot(sessionId, phone, ownerConn, options = {}) {
  const { usePairingCode = false } = options;
  if (BOT_INSTANCES.has(sessionId)) throw new Error('Already running');

  const instance = {
    sessionId, phone, conn: null, status: 'connecting',
    qr: null, pairingCode: null, pairingCodeError: null,
    startedAt: new Date().toISOString(), connectedAt: null, stopRequested: false
  };
  BOT_INSTANCES.set(sessionId, instance);

  const sessionDir = getUserSessionDir(sessionId);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
      logger: P({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS('Firefox'),
      syncFullHistory: true,
      auth: state, version
    });

    instance.conn = conn;

    // ⚡ Set user info
    conn._userInfo = {
      phone: phone,
      sessionId: sessionId,
      name: (USERS[phone] && USERS[phone].name) || 'User'
    };

    // ⚡ Load user's own config
    try {
      const userCfgPath = path.join(USER_CONFIGS_DIR, `${sessionId}.json`);
      if (fs.existsSync(userCfgPath)) {
        conn._userConfig = JSON.parse(fs.readFileSync(userCfgPath, 'utf8'));
        console.log(`📋 Config loaded for ${phone} (${Object.keys(conn._userConfig).length} keys)`);
      } else {
        const defPath = path.join(DATA_DIR, 'config.default.json');
        if (fs.existsSync(defPath)) {
          conn._userConfig = JSON.parse(fs.readFileSync(defPath, 'utf8'));
        } else {
          conn._userConfig = {};
        }
        console.log(`📋 Default config for ${phone}`);
      }
    } catch (e) {
      conn._userConfig = {};
      console.error(`Config error ${phone}:`, e.message);
    }

    // Pairing code
    if (usePairingCode) {
      setTimeout(async () => {
        try {
          const code = await conn.requestPairingCode(phone);
          instance.pairingCode = code;
          instance.status = 'pairing_code_ready';
          console.log(`🔢 Pairing ${phone}: ${code}`);
        } catch (e) {
          instance.pairingCodeError = e.message;
        }
      }, 3000);
    }

    conn.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) { instance.qr = qr; instance.status = 'qr_ready'; }

      if (connection === 'open') {
        instance.status = 'active';
        instance.qr = null;
        instance.pairingCode = null;
        instance.connectedAt = new Date().toISOString();
        console.log(`✅ User bot ${phone} connected`);

        const user = USERS[phone];
        if (user) { user.status = 'active'; user.connectedAt = instance.connectedAt; await persistUser(user); }

        setTimeout(() => {
          if (typeof global.sendConnectedMessage === 'function') {
            global.sendConnectedMessage(conn, false, conn._userInfo).catch(e => {});
          }
        }, 10000);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (instance.stopRequested) { instance.status = 'stopped'; return; }
        if (code === DisconnectReason.loggedOut || code === 401) {
          instance.status = 'offline';
          console.log(`🚫 ${phone} logged out`);
          return;
        }
        if (code === 440) { instance.status = 'offline'; return; }
        instance.status = 'connecting';
        console.log(`🔄 ${phone} reconnecting...`);
        setTimeout(() => {
          if (!instance.stopRequested && BOT_INSTANCES.has(sessionId)) reconnectUserBot(sessionId);
        }, 5000);
      }
    });

    // 💾 Session save
    conn.ev.on('creds.update', async () => {
      await saveCreds();
      try {
        if (mongo && typeof mongo.isConnected === 'function' && mongo.isConnected() && typeof mongo.saveSession === 'function') {
          const credsPath = path.join(sessionDir, 'creds.json');
          if (fs.existsSync(credsPath)) {
            await mongo.saveSession(sessionId, fs.readFileSync(credsPath, 'utf8')).catch(() => {});
          }
        }
      } catch (e) {}
    });

    // ⚠️ Anti-delete handler දැන් setupBotCommands එකේ තියෙනවා
    // මෙතන තියෙන duplicate එක අයින් කරා ❌

    // ⚡ Setup commands (anti-delete handler included)
    if (typeof global.setupBotCommands === 'function') {
      global.setupBotCommands(conn, { isOwnerBot: false, userInfo: conn._userInfo });
    }

    // ⚡ Setup helpers
    if (typeof global.attachConnHelpers === 'function') {
      global.attachConnHelpers(conn);
    }

    return instance;
  } catch (e) {
    BOT_INSTANCES.delete(sessionId);
    throw e;
  }
}

async function reconnectUserBot(sessionId) {
  const old = BOT_INSTANCES.get(sessionId);
  if (!old) return;
  const phone = old.phone;
  try { if (old.conn) old.conn.end(); } catch (e) {}
  BOT_INSTANCES.delete(sessionId);
  try { await createUserBot(sessionId, phone, global.ownerConn, { usePairingCode: false }); }
  catch (e) { console.error(`Reconnect ${phone}:`, e.message); }
}

function stopUserBot(sessionId) {
  const instance = BOT_INSTANCES.get(sessionId);
  if (!instance) return false;
  instance.stopRequested = true;
  try { if (instance.conn) instance.conn.end(); } catch (e) {}
  instance.status = 'stopped';
  BOT_INSTANCES.delete(sessionId);
  return true;
}

async function unlinkUserBot(sessionId) {
  const instance = BOT_INSTANCES.get(sessionId);
  if (instance && instance.conn) {
    try { await instance.conn.logout(); } catch (e) {}
    try { instance.conn.end(); } catch (e) {}
  }
  if (instance) instance.stopRequested = true;
  BOT_INSTANCES.delete(sessionId);

  const sessionDir = path.join(USER_SESSIONS_DIR, sessionId);
  try { if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
  try {
    if (mongo && typeof mongo.isConnected === 'function' && mongo.isConnected() && typeof mongo.deleteSession === 'function') {
      await mongo.deleteSession(sessionId);
    }
  } catch (e) {}
  try {
    const cfgPath = getUserConfigPath(sessionId);
    if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    if (fs.existsSync(cfgPath + '.backup')) fs.unlinkSync(cfgPath + '.backup');
  } catch (e) {}
  return true;
}

async function removeUser(phone) {
  const cleanNum = cleanPhone(phone);
  const user = USERS[cleanNum];
  if (!user) return { removed: false, reason: 'Not found' };
  try { await unlinkUserBot(user.sessionId); } catch (e) {}
  delete USERS[cleanNum];
  try { saveUsersToFile(); } catch (e) {}
  if (mongo && typeof mongo.isConnected === 'function' && mongo.isConnected() && typeof mongo.deleteUser === 'function') {
    try { await mongo.deleteUser(cleanNum); } catch (e) {}
  }
  return { removed: true, phone: cleanNum };
}

async function restoreAllSessions(ownerConn) {
  console.log('🔄 Restoring sessions...');
  let restored = 0, failed = 0;

  for (const user of Object.values(USERS)) {
    if (!user || !user.sessionId || !user.phone) continue;
    if (BOT_INSTANCES.has(user.sessionId)) continue;

    const sessionDir = path.join(USER_SESSIONS_DIR, user.sessionId);
    const credsPath = path.join(sessionDir, 'creds.json');

    if (!fs.existsSync(credsPath)) {
      try {
        if (mongo && typeof mongo.isConnected === 'function' && mongo.isConnected() && typeof mongo.getSession === 'function') {
          const credsData = await mongo.getSession(user.sessionId);
          if (credsData) {
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
            fs.writeFileSync(credsPath, credsData, 'utf8');
            console.log(`📥 From Mongo: ${user.phone}`);
          }
        }
      } catch (e) {}
    }

    if (!fs.existsSync(credsPath)) { console.log(`⏭️ No session: ${user.phone}`); continue; }

    try {
      await createUserBot(user.sessionId, user.phone, ownerConn, { usePairingCode: false });
      restored++;
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`❌ ${user.phone}:`, e.message);
      failed++;
    }
  }
  console.log(`✅ Restore done — ${restored} ok, ${failed} failed`);
}

module.exports = {
  USERS, BOT_INSTANCES,
  cleanPhone, generateSessionId, generateToken, generateOTP,
  generateDashPassword, generateUnique5Digit,
  getUserSessionDir, getUserConfigPath, loadUserConfig, saveUserConfig,
  loadUsers, persistUser, saveUsersToFile, sendOTP,
  createUserBot, stopUserBot, unlinkUserBot, removeUser,
  reconnectUserBot, restoreAllSessions
};
