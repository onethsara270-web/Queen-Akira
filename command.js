// ============================================================
// 🎯 COMMAND REGISTRY
// ============================================================
const fs = require('fs');
const path = require('path');
const config = require('./config');

var commands = [];

function cmd(info, func) {
    var data = info;
    data.function = func;
    if (!data.dontAddCommandList) data.dontAddCommandList = false;
    if (!info.desc) info.desc = '';
    if (!data.fromMe) data.fromMe = false;
    if (!info.category) data.category = 'misc';
    if (!info.filename) data.filename = "Not Provided";
    commands.push(data);
    return data;
}

// ══════════════════════════════════════════════════════════════
// ⚡ RUN COMMAND — Per-bot config context එකේ run කරනවා
// ══════════════════════════════════════════════════════════════
async function runCommand(cmdEntry, conn, mek, m, extras = {}) {
    if (!cmdEntry || typeof cmdEntry.function !== 'function') return false;

    let botConfig = null;
    if (conn && conn._userConfig) botConfig = conn._userConfig;

    const runFn = async () => {
        try {
            return await cmdEntry.function(conn, mek, m, extras);
        } catch (e) {
            console.error(`[PLUGIN ERROR] ${cmdEntry.pattern || '?'}:`, e.message);
            throw e;
        }
    };

    // ⚡ Wrap in bot's config context
    if (botConfig && typeof config._withBot === 'function') {
        return config._withBot(botConfig, runFn);
    }
    return runFn();
}

// ══════════════════════════════════════════════════════════════
// 🧬 LOAD PLUGINS
// ══════════════════════════════════════════════════════════════
function loadPlugins() {
    const pluginsDir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
        console.warn('⚠️ plugins/ not found');
        return;
    }

    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
    let ok = 0, fail = 0;

    for (const file of files) {
        try {
            const full = path.join(pluginsDir, file);
            try { delete require.cache[require.resolve(full)]; } catch (e) {}
            require(full);
            ok++;
        } catch (e) {
            fail++;
            console.error(`❌ ${file}:`, e.message);
        }
    }

    console.log(`🧬 Plugins: ${ok} ok, ${fail} failed (${commands.length} commands)`);
}

module.exports = {
    cmd,
    AddCommand: cmd,
    Function: cmd,
    Module: cmd,
    commands,
    runCommand,     // 🆕
    loadPlugins     // 🆕
};
