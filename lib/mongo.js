// ============================================================
// 🗄️ MONGODB CONNECTION & HELPERS
// Path: lib/mongo.js
// ============================================================
const { MongoClient } = require('mongodb');

// ============================================================
// 🔑 CONFIG (env variable + hardcoded fallback)
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://fixodev1_db_user:tYaX69ozKljm0Eha@cluster0.t8xf96n.mongodb.net/adcash_lk?appName=Cluster0';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'adcash_lk';

let client = null;
let db = null;
let connected = false;

const DB_NAME = MONGODB_DB_NAME;

// ============================================================
// 🔌 CONNECT
// ============================================================
async function connectMongo() {
  if (connected && client) return { client, db };

  const uri = MONGODB_URI;
  if (!uri || uri.includes('YOUR_PASSWORD') || uri.includes('xxxxx')) {
    console.warn('⚠️ MongoDB URI not set — check env MONGODB_URI or lib/mongo.js');
    return null;
  }

  try {
    console.log('🗄️ Connecting to MongoDB...');
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });

    await client.connect();
    db = client.db(DB_NAME);
    connected = true;

    await db.command({ ping: 1 });
    console.log(`✅ MongoDB connected — DB: ${DB_NAME}`);

    await ensureIndexes();
    return { client, db };
  } catch (e) {
    console.error('❌ MongoDB connection failed:', e.message);
    connected = false;
    return null;
  }
}

async function ensureIndexes() {
  try {
    const users = db.collection('users');
    await users.createIndex({ phone: 1 }, { unique: true });
    await users.createIndex({ sessionId: 1 });
    await users.createIndex({ dashPassword: 1 });

    const sessions = db.collection('sessions');
    await sessions.createIndex({ sessionId: 1 }, { unique: true });

    console.log('📇 MongoDB indexes created');
  } catch (e) {
    console.error('⚠️ Index creation warning:', e.message);
  }
}

function getDB() {
  if (!connected) throw new Error('MongoDB not connected');
  return db;
}

function isConnected() {
  return connected;
}

async function closeMongo() {
  if (client) {
    await client.close();
    connected = false;
    client = null;
    db = null;
    console.log('🔌 MongoDB connection closed');
  }
}

async function ping() {
  if (!connected) return false;
  try { await db.command({ ping: 1 }); return true; } catch (e) { return false; }
}

// ============================================================
// 👥 USERS
// ============================================================
async function getUsers() {
  if (!connected) return {};
  try {
    const docs = await db.collection('users').find({}).toArray();
    const users = {};
    for (const doc of docs) {
      const { _id, ...rest } = doc;
      users[rest.phone] = rest;
    }
    return users;
  } catch (e) {
    console.error('❌ getUsers error:', e.message);
    return {};
  }
}

// 🆕 Returns ARRAY (user-manager.js loadUsers() uses this)
async function getAllUsers() {
  if (!connected) return [];
  try {
    const docs = await db.collection('users').find({}).toArray();
    return docs.map(doc => {
      const { _id, ...rest } = doc;
      return rest;
    });
  } catch (e) {
    console.error('❌ getAllUsers error:', e.message);
    return [];
  }
}

async function getUser(phone) {
  if (!connected) return null;
  try {
    const doc = await db.collection('users').findOne({ phone: String(phone) });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
  } catch (e) {
    console.error('❌ getUser error:', e.message);
    return null;
  }
}

// 🆕 Alias
async function getUserByPhone(phone) {
  return await getUser(phone);
}

async function findUser(query) {
  if (!connected) return null;
  try {
    const doc = await db.collection('users').findOne(query);
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
  } catch (e) {
    console.error('❌ findUser error:', e.message);
    return null;
  }
}

async function saveUser(user) {
  if (!connected || !user?.phone) return false;
  try {
    const { _id, ...rest } = user;
    rest.phone = String(rest.phone);
    await db.collection('users').updateOne(
      { phone: rest.phone },
      { $set: rest },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('❌ saveUser error:', e.message);
    return false;
  }
}

async function updateUser(phone, updates) {
  if (!connected || !phone) return false;
  try {
    await db.collection('users').updateOne(
      { phone: String(phone) },
      { $set: updates }
    );
    return true;
  } catch (e) {
    console.error('❌ updateUser error:', e.message);
    return false;
  }
}

async function deleteUser(phone) {
  if (!connected || !phone) return false;
  try {
    await db.collection('users').deleteOne({ phone: String(phone) });
    return true;
  } catch (e) {
    console.error('❌ deleteUser error:', e.message);
    return false;
  }
}

// 🆕 User count
async function getUserCount() {
  if (!connected) return 0;
  try {
    return await db.collection('users').countDocuments();
  } catch (e) { return 0; }
}

// ============================================================
// 🔐 SESSIONS
// ============================================================
async function saveSession(sessionId, credsData) {
  if (!connected || !sessionId) return false;
  try {
    await db.collection('sessions').updateOne(
      { sessionId },
      { $set: { sessionId, creds: credsData, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('❌ saveSession error:', e.message);
    return false;
  }
}

async function getSession(sessionId) {
  if (!connected || !sessionId) return null;
  try {
    const doc = await db.collection('sessions').findOne({ sessionId });
    return doc?.creds || null;
  } catch (e) {
    console.error('❌ getSession error:', e.message);
    return null;
  }
}

async function deleteSession(sessionId) {
  if (!connected || !sessionId) return false;
  try {
    await db.collection('sessions').deleteOne({ sessionId });
    return true;
  } catch (e) {
    console.error('❌ deleteSession error:', e.message);
    return false;
  }
}

async function getAllSessions() {
  if (!connected) return [];
  try {
    return await db.collection('sessions').find({}).toArray();
  } catch (e) {
    console.error('❌ getAllSessions error:', e.message);
    return [];
  }
}

// ============================================================
// ⚙️ CONFIG
// ============================================================
async function saveConfig(configData) {
  if (!connected) return false;
  try {
    await db.collection('config').updateOne(
      { _id: 'main_config' },
      { $set: { data: configData, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('❌ saveConfig error:', e.message);
    return false;
  }
}

async function getConfig() {
  if (!connected) return null;
  try {
    const doc = await db.collection('config').findOne({ _id: 'main_config' });
    return doc?.data || null;
  } catch (e) {
    console.error('❌ getConfig error:', e.message);
    return null;
  }
}

async function saveConfigBackup(configData) {
  if (!connected) return false;
  try {
    await db.collection('config_backup').updateOne(
      { _id: 'main_backup' },
      { $set: { data: configData, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('❌ saveConfigBackup error:', e.message);
    return false;
  }
}

async function getConfigBackup() {
  if (!connected) return null;
  try {
    const doc = await db.collection('config_backup').findOne({ _id: 'main_backup' });
    return doc?.data || null;
  } catch (e) {
    console.error('❌ getConfigBackup error:', e.message);
    return null;
  }
}

async function saveConfigDefault(configData) {
  if (!connected) return false;
  try {
    await db.collection('config_default').updateOne(
      { _id: 'main_default' },
      { $set: { data: configData, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('❌ saveConfigDefault error:', e.message);
    return false;
  }
}

async function getConfigDefault() {
  if (!connected) return null;
  try {
    const doc = await db.collection('config_default').findOne({ _id: 'main_default' });
    return doc?.data || null;
  } catch (e) {
    console.error('❌ getConfigDefault error:', e.message);
    return null;
  }
}

// ============================================================
// 📤 EXPORTS
// ============================================================
module.exports = {
  // Connection
  connectMongo,
  getDB,
  isConnected,
  closeMongo,
  ping,

  // Users
  getUsers,
  getAllUsers,       // 🆕 Array version
  getUser,
  getUserByPhone,    // 🆕 Alias
  findUser,
  saveUser,
  updateUser,
  deleteUser,
  getUserCount,      // 🆕 Count

  // Sessions
  saveSession,
  getSession,
  deleteSession,
  getAllSessions,

  // Config
  saveConfig,
  getConfig,
  saveConfigBackup,
  getConfigBackup,
  saveConfigDefault,
  getConfigDefault
};