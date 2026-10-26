// ============================================================
// 🛡️ ANTI-DELETE — data/antidel.js
// Simple JSON storage — GC + DM mode
// ============================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const DB_PATH = path.join(DATA_DIR, 'antidelete.json');

function ensureStorage() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ gc: false, dm: false }, null, 2));
    }
}

function loadDB() {
    ensureStorage();
    try {
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        // backward compatibility
        if (db.mode && typeof db.gc !== 'boolean') {
            if (db.mode === 'both') { db.gc = true; db.dm = true; }
            else if (db.mode === 'group') { db.gc = true; db.dm = false; }
            else if (db.mode === 'inbox') { db.gc = false; db.dm = true; }
            else { db.gc = false; db.dm = false; }
        }
        if (typeof db.gc !== 'boolean') db.gc = false;
        if (typeof db.dm !== 'boolean') db.dm = false;
        return db;
    } catch (e) {
        return { gc: false, dm: false };
    }
}

function saveDB(db) {
    ensureStorage();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function setAnti(type, status) {
    const db = loadDB();
    if (type === 'gc') db.gc = !!status;
    else if (type === 'dm') db.dm = !!status;
    else return false;
    saveDB(db);
    console.log(`✅ AntiDelete ${type} = ${status}`);
    return true;
}

function getAnti(type) {
    const db = loadDB();
    if (type === 'gc') return !!db.gc;
    if (type === 'dm') return !!db.dm;
    return false;
}

function initializeAntiDeleteSettings() {
    ensureStorage();
    const db = loadDB();
    console.log(`✅ AntiDelete initialized — GC: ${db.gc}, DM: ${db.dm}`);
}

// ✅ පරණ code compatibility
function getAllAntiDeleteSettings() {
    const gc = getAnti('gc');
    const dm = getAnti('dm');
    return [{ gc_status: gc, dm_status: dm }];
}

module.exports = {
    setAnti,
    getAnti,
    initializeAntiDeleteSettings,
    getAllAntiDeleteSettings,
    AntiDelDB: null,  // Dummy (පරණ code එකට)
};
