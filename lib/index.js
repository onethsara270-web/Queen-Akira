// ============================================================
// 🧬 LIB INDEX — QUEEN AKIRA MINI
// ============================================================
const {
    DeletedText,
    DeletedMedia,
    AntiDelete,
} = require('./antidel');

// const { AntiViewOnce } = require('./antivv');

const {
    DATABASE
} = require('./database');

const {
    getBuffer,
    getGroupAdmins,
    getRandom,
    h2k,
    isUrl,
    Json,
    runtime,
    sleep,
    fetchJson
} = require('./functions');

const {
    sms,
    downloadMediaMessage
} = require('./msg');

// const { shannzCdn } = require('./shannzCdn');

// ✅ AntiDelete control functions (data folder එකෙන්)
const {
    setAnti,
    getAnti,
    initializeAntiDeleteSettings
} = require('../data/antidel');

module.exports = {
    // ---- Anti-Delete (lib/antidel.js) ----
    DeletedText,
    DeletedMedia,
    AntiDelete,

    // ---- Anti-Delete control (data/antidel.js) ----
    setAnti,
    getAnti,
    initializeAntiDeleteSettings,

    // AntiViewOnce,

    // ---- Helpers ----
    getBuffer,
    getGroupAdmins,
    getRandom,
    h2k,
    isUrl,
    Json,
    runtime,
    sleep,
    fetchJson,

    // ---- Database ----
    DATABASE,

    // ---- Message utils ----
    sms,
    downloadMediaMessage,

    // shannzCdn,
};
