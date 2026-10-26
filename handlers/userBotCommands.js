// ============================================================
// 👥 USER MANAGER
// Multi-user bot management — sessions, passwords, configs
// ============================================================

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

// Ensure dirs
[DATA_DIR, path.join(DATA_DIR, 'data'), USER_SESSIONS_DIR, USER_CONFIGS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ══════════════════════════════════════════════════════════════
// 📦 GLOBAL STATE
// ══════════════════════════════════════════════════════════════
const USERS = {};                    // { phone: { phone, name, sessionId, dashPassword, ... } }
const BOT_INSTANCES = new Map();     // sessionId -> { conn, status, qr, pairingCode, ... }

// ══════════════════════════════════════════════════════════════
// 🔧 HELPERS
// ══════════════════════════════════════════════════════════════
function cleanPhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/[^0-9]/g, '').trim();
}

function generateSessionId() {
  return 'sess_' + crypto.randomBytes(8).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

function generateDashPassword() {
  return String(Math.floor(10000 + Math.random() * 90000)); // 5-digit
}

function generateUnique5Digit() {
  const used = new Set();
  try {
    if (global.DASHBOARD_USERS) {
      Object.keys(global.DASHBOARD_USERS).forEach(pw => used.add(String(pw)));
    }
  } catch (e) {}
  try {
    Object.values(USERS || {}).forEach(u => {
      if (u && u.dashPassword) used.add(String(u.dashPassword));
    });
  } catch (e) {}

  let code, attempts = 0;
  do {
    code = String(Math.floor(10000 + Math.random() * 90000));
    attempts++;
  } while (used.has(code) && attempts < 500);
  return code;
}

function getUserSessionDir(sessionId) {
  const dir = path.join(USER_SESSIONS_DIR, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserConfigPath(sessionId) {
  return path.join(USER_CONFIGS_DIR, `${sessionId}.json`);
}

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
  try {
    fs.writeFileSync(getUserConfigPath(sessionId), JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) { return false; }
}

// ══════════════════════════════════════════════════════════════
// 💾 PERSIST USERS
// ══════════════════════════════════════════════════════════════
function saveUsersToFile() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ Failed to save users file:', e.message);
  }
}

async function loadUsers() {
  // 1. Try MongoDB first
  if (mongo && mongo.isConnected && mongo.isConnected()) {
    try {
      const mongoUsers = await mongo.getAllUsers();
      if (mongoUsers && mongoUsers.length) {
        for (const u of mongoUsers) {
          if (u && u.phone) USERS[u.phone] = u;
        }
        console.log(`👥 Loaded ${mongoUsers.length} users from MongoDB`);
        return;
      }
    } catch (e) {
      console.warn('⚠️ Mongo load failed:', e.message);
    }
  }

  // 2. Fallback to file
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [phone, u] of Object.entries(parsed || {})) {
        if (u && u.phone) USERS[phone] = u;
      }
      console.log(`👥 Loaded ${Object.keys(USERS).length} users from file`);
    } else {
      console.log('👥 No users file found — starting fresh');
    }
  } catch (e) {
    console.warn('⚠️ File load failed:', e.message);
  }
}

async function persistUser(user) {
  if (!user || !user.phone) return;
  USERS[user.phone] = user;
  try { saveUsersToFile(); } catch (e) {}
  if (mongo && mongo.isConnected && mongo.isConnected()) {
    try { await mongo.saveUser(user); } catch (e) {}
  }
}

// ══════════════════════════════════════════════════════════════
// 📱 SEND OTP (uses owner connection)
// ══════════════════════════════════════════════════════════════
async function sendOTP(ownerConn, phone, otp) {
  if (!ownerConn) {
    return { sent: false, error: 'Owner not connected' };
  }
  try {
    const cleanNum = cleanPhone(phone);
    const jid = cleanNum + '@s.whatsapp.net';
    const text = `🔐 *QUEEN AKIRA — Verification*

Your OTP code is: *${otp}*

⏱️ Valid for 10 minutes
🚫 Never share this code with anyone

> © Powered by Fixo Dev 🖤`;

    await ownerConn.sendMessage(jid, { text });
    console.log(`📤 OTP sent to ${cleanNum}`);
    return { sent: true };
  } catch (e) {
    console.error('❌ OTP send failed:', e.message);
    return { sent: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
// 🤖 CREATE USER BOT
// ══════════════════════════════════════════════════════════════
async function createUserBot(sessionId, phone, ownerConn, options = {}) {
  const { usePairingCode = false } = options;

  if (BOT_INSTANCES.has(sessionId)) {
    throw new Error('Bot already running');
  }

  const instance = {
    sessionId,
    phone,
    conn: null,
    status: 'connecting',
    qr: null,
    pairingCode: null,
    pairingCodeError: null,
    startedAt: new Date().toISOString(),
    connectedAt: null,
    stopRequested: false
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
      syncFullHistory: false,
      auth: state,
      version
    });

    instance.conn = conn;

    // ⚠️ VERY IMPORTANT — so password.js can detect user bot
    conn._userInfo = {
      phone: phone,
      sessionId: sessionId,
      name: (USERS[phone] && USERS[phone].name) || 'User'
    };

    // 📥 Pairing code request
    if (usePairingCode) {
      setTimeout(async () => {
        try {
          const code = await conn.requestPairingCode(phone);
          instance.pairingCode = code;
          instance.status = 'pairing_code_ready';
          console.log(`🔢 Pairing code for ${phone}: ${code}`);
        } catch (e) {
          instance.pairingCodeError = e.message;
          console.error(`❌ Pairing code failed for ${phone}:`, e.message);
        }
      }, 3000);
    }

    // 🔔 Connection updates
    conn.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        instance.qr = qr;
        instance.status = 'qr_ready';
      }

      if (connection === 'open') {
        instance.status = 'active';
        instance.qr = null;
        instance.pairingCode = null;
        instance.connectedAt = new Date().toISOString();
        console.log(`✅ User bot ${phone} connected`);

        // Persist status
        const user = USERS[phone];
        if (user) {
          user.status = 'active';
          user.connectedAt = instance.connectedAt;
          await persistUser(user);
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;

        if (instance.stopRequested) {
          instance.status = 'stopped';
          console.log(`⏹️ User bot ${phone} stopped by request`);
          return;
        }

        if (code === DisconnectReason.loggedOut || code === 401) {
          instance.status = 'offline';
          console.log(`🚫 User bot ${phone} logged out`);
          return;
        }

        if (code === 440) {
          instance.status = 'offline';
          console.log(`⚠️ User bot ${phone} session replaced`);
          return;
        }

        // Auto-reconnect for 515 / network errors
        instance.status = 'connecting';
        console.log(`🔄 User bot ${phone} reconnecting...`);
        setTimeout(() => {
          if (!instance.stopRequested && BOT_INSTANCES.has(sessionId)) {
            reconnectUserBot(sessionId);
          }
        }, 5000);
      }
    });

    conn.ev.on('creds.update', saveCreds);

    // 🛡️ Anti-delete for user bot
    conn.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (update.update && update.update.message === null) {
          try {
            const { AntiDelete } = require('./lib');
            if (AntiDelete) await AntiDelete(conn, updates);
          } catch (e) {}
          break;
        }
      }
    });

    // 🎯 Setup command handler for user bot
    try {
      const { setupUserBotCommands } = require('./handlers/user-bot-commands');
      setupUserBotCommands(conn, conn._userInfo);
    } catch (e) {
      console.warn(`⚠️ Could not setup user bot commands: ${e.message}`);
    }

    return instance;
  } catch (e) {
    BOT_INSTANCES.delete(sessionId);
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════
// 🔄 RECONNECT USER BOT
// ══════════════════════════════════════════════════════════════
async function reconnectUserBot(sessionId) {
  const old = BOT_INSTANCES.get(sessionId);
  if (!old) return;
  const phone = old.phone;
  try {
    if (old.conn) {
      try { old.conn.end(); } catch (e) {}
    }
  } catch (e) {}

  BOT_INSTANCES.delete(sessionId);
  try {
    await createUserBot(sessionId, phone, global.ownerConn, { usePairingCode: false });
  } catch (e) {
    console.error(`❌ Reconnect failed for ${phone}:`, e.message);
  }
}

// ══════════════════════════════════════════════════════════════
// ⏹️ STOP USER BOT (temporary)
// ══════════════════════════════════════════════════════════════
function stopUserBot(sessionId) {
  const instance = BOT_INSTANCES.get(sessionId);
  if (!instance) return false;

  instance.stopRequested = true;
  try {
    if (instance.conn) instance.conn.end();
  } catch (e) {}
  instance.status = 'stopped';
  BOT_INSTANCES.delete(sessionId);
  console.log(`⏹️ Stopped user bot: ${sessionId}`);
  return true;
}

// ══════════════════════════════════════════════════════════════
// 🔓 UNLINK USER BOT (logout + delete session)
// ══════════════════════════════════════════════════════════════
async function unlinkUserBot(sessionId) {
  const instance = BOT_INSTANCES.get(sessionId);

  // Try to logout first
  if (instance && instance.conn) {
    try {
      await instance.conn.logout();
    } catch (e) {
      console.warn('⚠️ Logout failed:', e.message);
    }
    try { instance.conn.end(); } catch (e) {}
  }

  instance && (instance.stopRequested = true);
  BOT_INSTANCES.delete(sessionId);

  // Delete session folder
  const sessionDir = path.join(USER_SESSIONS_DIR, sessionId);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`🗑️ Deleted session: ${sessionId}`);
    }
  } catch (e) {
    console.error('❌ Session delete failed:', e.message);
  }

  // Delete user config
  try {
    const cfgPath = getUserConfigPath(sessionId);
    if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
  } catch (e) {}

  return true;
}

// ══════════════════════════════════════════════════════════════
// 🗑️ REMOVE USER (unlink + delete from DB)
// ══════════════════════════════════════════════════════════════
async function removeUser(phone) {
  const cleanNum = cleanPhone(phone);
  const user = USERS[cleanNum];
  if (!user) return { removed: false, reason: 'User not found' };

  // Stop & unlink bot
  try {
    await unlinkUserBot(user.sessionId);
  } catch (e) {
    console.warn('⚠️ Unlink error during remove:', e.message);
  }

  // Remove from memory
  delete USERS[cleanNum];
  try { saveUsersToFile(); } catch (e) {}

  // Remove from Mongo
  if (mongo && mongo.isConnected && mongo.isConnected() && mongo.deleteUser) {
    try { await mongo.deleteUser(cleanNum); } catch (e) {}
  }

  console.log(`🗑️ Removed user: ${cleanNum}`);
  return { removed: true, phone: cleanNum };
}

// ══════════════════════════════════════════════════════════════
// 🔄 RESTORE ALL SESSIONS (on bot restart)
// ══════════════════════════════════════════════════════════════
async function restoreAllSessions(ownerConn) {
  const userList = Object.values(USERS).filter(u => {
    if (!u || !u.sessionId) return false;
    // Only restore those with existing creds
    const credsPath = path.join(USER_SESSIONS_DIR, u.sessionId, 'creds.json');
    return fs.existsSync(credsPath);
  });

  if (!userList.length) {
    console.log('ℹ️ No user sessions to restore');
    return;
  }

  console.log(`🔄 Restoring ${userList.length} user session(s)...`);

  for (const u of userList) {
    try {
      // Skip if already running
      if (BOT_INSTANCES.has(u.sessionId)) continue;
      await createUserBot(u.sessionId, u.phone, ownerConn, { usePairingCode: false });
      console.log(`✅ Restored: ${u.phone}`);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`❌ Restore failed for ${u.phone}:`, e.message);
    }
  }

  console.log(`✅ Session restore complete`);
}

// ══════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  // State
  USERS,
  BOT_INSTANCES,

  // Helpers
  cleanPhone,
  generateSessionId,
  generateToken,
  generateOTP,
  generateDashPassword,
  generateUnique5Digit,

  // User config
  getUserSessionDir,
  getUserConfigPath,
  loadUserConfig,
  saveUserConfig,

  // Persistence
  loadUsers,
  persistUser,
  saveUsersToFile,

  // OTP
  sendOTP,

  // Bot lifecycle
  createUserBot,
  stopUserBot,
  unlinkUserBot,
  removeUser,
  reconnectUserBot,
  restoreAllSessions
};
