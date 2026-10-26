/**
 * 🛡️ Antilink Plugin — single file (with whitelist toggle)
 */

const TLDS = 'com|net|org|io|me|co|info|biz|app|dev|link|site|online|top|club|live|shop|xyz|tk|ml|ga|cf|gq|lk|in|uk|us|ru|cn|jp|de|fr|au|ca|tv|cc|pro|tech|store|blog|news|edu|moe';
const LINK_RX = new RegExp(
  `https?:\\/\\/[^\\s]+|www\\.[^\\s]+|[a-z0-9][a-z0-9-]*\\.(?:${TLDS})[^\\s]*`,
  'gi'
);

const CFG_COLL = 'antilink_config';
const WARN_COLL = 'antilink_warns';

let _db = null;

// ═══════════════════════════════════════════════════════════
//  🔗 Link detection
// ═══════════════════════════════════════════════════════════
function extractLinks(text) {
  if (!text) return [];
  const m = String(text).match(LINK_RX);
  return m ? [...new Set(m)] : [];
}

function isWhitelisted(link, whitelist = []) {
  if (!whitelist.length) return false;
  const l = link.toLowerCase();
  return whitelist.some(w => l.includes(String(w).toLowerCase().trim()));
}

function findBlocked(text, whitelist = []) {
  return extractLinks(text).filter(l => !isWhitelisted(l, whitelist));
}

function parseWhitelist(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str.map(s => String(s).toLowerCase().trim()).filter(Boolean);
  return String(str).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isEnabled(cfg) {
  const v = cfg.ANTI_LINK_ENABLED !== undefined ? cfg.ANTI_LINK_ENABLED : cfg.ANTI_LINK;
  return String(v || 'false') === 'true';
}

// ═══════════════════════════════════════════════════════════
//  💾 Mongo config helpers
// ═══════════════════════════════════════════════════════════
const DEFAULT_CFG = {
  enabled: null,
  action: null,
  warnLimit: null,
  whitelist: null,
  whitelistEnabled: null,
  groups: {}
};

async function getCfg(sessionId) {
  if (!_db) return { ...DEFAULT_CFG };
  const doc = await _db.collection(CFG_COLL).findOne({ _id: sessionId });
  return { ...DEFAULT_CFG, ...(doc || {}) };
}

async function saveCfg(sessionId, patch) {
  if (!_db) return;
  await _db.collection(CFG_COLL).updateOne(
    { _id: sessionId },
    { $set: { ...patch, updatedAt: new Date() } },
    { upsert: true }
  );
}

function forGroup(cfg, jid) {
  const g = cfg.groups?.[jid] || {};
  return {
    enabled: g.enabled != null ? g.enabled : cfg.enabled,
    action: g.action || cfg.action,
    warnLimit: g.warnLimit != null ? g.warnLimit : cfg.warnLimit,
    whitelist: g.whitelist || cfg.whitelist,
    whitelistEnabled: g.whitelistEnabled != null ? g.whitelistEnabled : cfg.whitelistEnabled
  };
}

async function updateGroup(sessionId, jid, patch) {
  const cfg = await getCfg(sessionId);
  const groups = { ...(cfg.groups || {}) };
  groups[jid] = { ...(groups[jid] || {}), ...patch };
  await saveCfg(sessionId, { groups });
}

async function resetGroup(sessionId, jid) {
  const cfg = await getCfg(sessionId);
  const groups = { ...(cfg.groups || {}) };
  delete groups[jid];
  await saveCfg(sessionId, { groups });
}

async function ensureIndexes(db) {
  try {
    await db.collection(WARN_COLL).createIndex({ key: 1 }, { unique: true });
    await db.collection(WARN_COLL).createIndex({ updatedAt: 1 }, { expireAfterSeconds: 86400 });
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════
//  🔧 Resolve effective settings
// ═══════════════════════════════════════════════════════════
function resolveEnabled(cfgEnabled, config) {
  if (cfgEnabled != null) return !!cfgEnabled;
  return isEnabled(config);
}

function resolveAction(cfgAction, config) {
  return String(cfgAction || config.ANTI_LINK_ACTION || 'delete').toLowerCase();
}

function resolveWarnLimit(cfgLimit, config) {
  const v = cfgLimit != null ? cfgLimit : config.ANTI_LINK_WARN_LIMIT;
  return parseInt(v, 10) || 3;
}

function resolveWhitelistEnabled(cfgValue, config) {
  if (cfgValue != null) return !!cfgValue;
  const v = config.ANTI_LINK_WHITELIST_ENABLED !== undefined
    ? config.ANTI_LINK_WHITELIST_ENABLED
    : 'true';
  return String(v) === 'true';
}

function resolveWhitelist(cfgWl, config, whitelistEnabled) {
  // 🔥 If whitelist disabled → no exceptions, block all links
  if (!whitelistEnabled) return [];

  if (cfgWl && cfgWl.length) return Array.isArray(cfgWl) ? cfgWl : parseWhitelist(cfgWl);
  return parseWhitelist(config.ANTI_LINK_WHITELIST || 'whatsapp.com,youtube.com,github.com');
}

// ═══════════════════════════════════════════════════════════
//  ⚙️ MAIN HANDLER
// ═══════════════════════════════════════════════════════════
async function handle(ctx) {
  const {
    sock, conn, m, mek, from, body, sender,
    isGroup, isAdmin, isBotAdmin, isOwner, isMe,
    isCmd, command, args, text,
    config = {}, sessionId = null,
    reply, saveConfig
  } = ctx;

  const socket = sock || conn;
  const msg = m || mek;

  if (!socket || !from || !body) return false;

  const sid = sessionId || config.BOT_NAME || config.OWNER_NUMBER || 'default';
  const prefix = config.PREFIX || '.';
  const lower = String(body).trim().toLowerCase();

  // ─── COMMAND ───
  if ((isCmd && command === 'antilink') || lower.startsWith((prefix + 'antilink').toLowerCase())) {
    return await handleCommand({
      ...ctx, sock: socket, m: msg, sid, prefix,
      reply: reply || ((t) => socket.sendMessage(from, { text: t }, { quoted: msg }))
    });
  }

  // ─── GROUP LINK CHECK ───
  if (!isGroup) return false;
  if (isMe) return false;

  const cfg = await getCfg(sid);
  const gCfg = forGroup(cfg, from);

  const skipAdmins = String(config.ANTI_LINK_SKIP_ADMINS || 'true') === 'true';
  const skipBot = String(config.ANTI_LINK_SKIP_BOT || 'true') === 'true';

  if (skipBot && isMe) return false;
  if (skipAdmins && isAdmin) {
    console.log('🛡️ [al] skip: sender is admin');
    return false;
  }

  const enabled = resolveEnabled(gCfg.enabled, config);
  if (!enabled) return false;

  const whitelistEnabled = resolveWhitelistEnabled(gCfg.whitelistEnabled, config);
  const whitelist = resolveWhitelist(gCfg.whitelist, config, whitelistEnabled);
  const blocked = findBlocked(body, whitelist);

  console.log('🛡️ [al] wl.enabled:', whitelistEnabled, '| whitelist:', whitelist, '| blocked:', blocked);

  if (!blocked.length) return false;

  const action = resolveAction(gCfg.action, config);
  const warnLimit = resolveWarnLimit(gCfg.warnLimit, config);
  const notify = String(config.ANTI_LINK_NOTIFY || 'true') === 'true';
  const tag = '@' + String(sender).split('@')[0].split(':')[0];

  // ─── DELETE ───
  try {
    await socket.sendMessage(from, { delete: msg.key });
    console.log('✅ [al] deleted');
  } catch (e) {
    console.log('❌ [al] delete failed:', e.message);
  }

  // ─── KICK ───
  if (action === 'kick') {
    if (!isBotAdmin) {
      if (notify) await safe(socket.sendMessage(from, {
        text: `⚠️ ${tag} link not allowed. (bot needs admin)`,
        mentions: [sender]
      }));
      return true;
    }
    try {
      await socket.groupParticipantsUpdate(from, [sender], 'remove');
      if (notify) await safe(socket.sendMessage(from, {
        text: `🚫 ${tag} removed — links not allowed.`,
        mentions: [sender]
      }));
    } catch (e) { console.log('❌ [al] kick failed:', e.message); }
    return true;
  }

  // ─── WARN ───
  if (action === 'warn') {
    const key = `${sid}:${from}:${sender}`;
    let count = 1;
    if (_db) {
      try {
        const doc = await _db.collection(WARN_COLL).findOne({ key });
        count = (doc?.count || 0) + 1;
        await _db.collection(WARN_COLL).updateOne(
          { key },
          { $set: { count, updatedAt: new Date() } },
          { upsert: true }
        );
      } catch (e) {}
    }

    if (count >= warnLimit && isBotAdmin) {
      try {
        await socket.groupParticipantsUpdate(from, [sender], 'remove');
        if (notify) await safe(socket.sendMessage(from, {
          text: `🚫 ${tag} removed — ${warnLimit} warnings exceeded.`,
          mentions: [sender]
        }));
        if (_db) await _db.collection(WARN_COLL).deleteOne({ key });
      } catch (e) {}
    } else {
      if (notify) await safe(socket.sendMessage(from, {
        text: `⚠️ ${tag} don't post links. (${count}/${warnLimit})`,
        mentions: [sender]
      }));
    }
    return true;
  }

  // ─── DELETE default ───
  if (notify) await safe(socket.sendMessage(from, {
    text: `🗑️ ${tag} links not allowed.`,
    mentions: [sender]
  }));
  return true;
}

function safe(promise) {
  return Promise.resolve(promise).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
//  ⌨️ COMMAND HANDLER
// ═══════════════════════════════════════════════════════════
async function handleCommand(ctx) {
  const { sock, conn, m, mek, from, body, isGroup, config, sid, prefix, reply } = ctx;
  const socket = sock || conn;
  const msg = m || mek;

  const r = reply || ((t) => socket.sendMessage(from, { text: t }, { quoted: msg }));

  const after = String(body).trim().slice(prefix.length + 'antilink'.length).trim();
  const parts = after.split(/\s+/);
  const sub = (parts[0] || '').toLowerCase();
  const cmdPrefix = prefix + 'antilink';

  if (!sub || sub === 'help') {
    return r(
`🛡️ *${config.BOT_NAME || 'BOT'} Antilink*

*Global:*
${cmdPrefix} on | off
${cmdPrefix} action delete|warn|kick
${cmdPrefix} limit <n>
${cmdPrefix} whitelist on | off
${cmdPrefix} whitelist add|remove|list [domain]
${cmdPrefix} status

*Per-group (inside group):*
${cmdPrefix} group on | off
${cmdPrefix} group action delete|warn|kick
${cmdPrefix} group limit <n>
${cmdPrefix} reset`);
  }

  // ─── GROUP SCOPED ───
  if (sub === 'group') {
    if (!isGroup) return r('❌ Run this inside a group.');
    const act = (parts[1] || '').toLowerCase();
    const val = (parts[2] || '').toLowerCase();

    if (act === 'on')  { await updateGroup(sid, from, { enabled: true });  return r('✅ ON for this group'); }
    if (act === 'off') { await updateGroup(sid, from, { enabled: false }); return r('⛔ OFF for this group'); }
    if (act === 'action') {
      if (!['delete','warn','kick'].includes(val)) return r('⚠️ delete | warn | kick');
      await updateGroup(sid, from, { action: val });
      return r('✅ Group action: *' + val + '*');
    }
    if (act === 'limit') {
      const n = parseInt(val, 10);
      if (!n || n < 1) return r('⚠️ ' + cmdPrefix + ' group limit <number>');
      await updateGroup(sid, from, { warnLimit: n });
      return r('✅ Group warn limit: *' + n + '*');
    }
    return r('❓ Try ' + cmdPrefix + ' help');
  }

  // ─── GLOBAL ───
  const cfg = await getCfg(sid);

  if (sub === 'on')  { await saveCfg(sid, { enabled: true });  return r('✅ Antilink ON'); }
  if (sub === 'off') { await saveCfg(sid, { enabled: false }); return r('⛔ Antilink OFF'); }

  if (sub === 'action') {
    const v = (parts[1] || '').toLowerCase();
    if (!['delete','warn','kick'].includes(v)) return r('⚠️ delete | warn | kick');
    await saveCfg(sid, { action: v });
    return r('✅ Action: *' + v + '*');
  }

  if (sub === 'limit') {
    const n = parseInt(parts[1], 10);
    if (!n || n < 1) return r('⚠️ ' + cmdPrefix + ' limit <number>');
    await saveCfg(sid, { warnLimit: n });
    return r('✅ Warn limit: *' + n + '*');
  }

  // ─── WHITELIST (with on/off toggle) ───
  if (sub === 'whitelist') {
    const op = (parts[1] || '').toLowerCase();
    const val = (parts[2] || '').toLowerCase();

    // 🔥 Whitelist enable/disable
    if (op === 'on') {
      await saveCfg(sid, { whitelistEnabled: true });
      return r('✅ Whitelist *ON* — trusted domains will be allowed');
    }
    if (op === 'off') {
      await saveCfg(sid, { whitelistEnabled: false });
      return r('⛔ Whitelist *OFF* — ALL links blocked');
    }

    const cur = cfg.whitelist || [];

    if (op === 'list' || !op) {
      const wlEnabled = resolveWhitelistEnabled(cfg.whitelistEnabled, config);
      return r(
`✅ *Whitelist:* ${wlEnabled ? '🟢 ON' : '🔴 OFF'}
${cur.length ? cur.join('\n') : '_empty_'}

Turn ON:  ${cmdPrefix} whitelist on
Turn OFF: ${cmdPrefix} whitelist off`);
    }
    if (op === 'add' && val) {
      const dom = val.replace(/^https?:\/\//,'').replace(/\/.*$/,'');
      await saveCfg(sid, { whitelist: [...new Set([...cur, dom])] });
      return r('✅ Added: *' + dom + '*');
    }
    if (op === 'remove' && val) {
      const dom = val.replace(/^https?:\/\//,'').replace(/\/.*$/,'');
      await saveCfg(sid, { whitelist: cur.filter(d => d !== dom) });
      return r('🗑️ Removed: *' + dom + '*');
    }
    return r('⚠️ ' + cmdPrefix + ' whitelist on | off | add | remove | list');
  }

  if (sub === 'status') {
    const gCfg = isGroup ? forGroup(cfg, from) : cfg;
    const enabled = resolveEnabled(gCfg.enabled, config);
    const action = resolveAction(gCfg.action, config);
    const limit = resolveWarnLimit(gCfg.warnLimit, config);
    const wlEnabled = resolveWhitelistEnabled(gCfg.whitelistEnabled, config);
    const wl = resolveWhitelist(gCfg.whitelist, config, wlEnabled);

    return r(
`🛡️ *Antilink Status*
Enabled: ${enabled ? '✅ ON' : '⛔ OFF'}
Action: *${action}*
Warn limit: *${limit}*
Whitelist: ${wlEnabled ? '🟢 ON' : '🔴 OFF'}
${wl.length ? 'Domains: ' + wl.join(', ') : ''}${isGroup ? '\n_(this group)_' : ''}`);
  }

  if (sub === 'reset' && isGroup) {
    await resetGroup(sid, from);
    return r('🔄 Reset this group to defaults');
  }

  return r('❓ Try ' + cmdPrefix + ' help');
}

// ═══════════════════════════════════════════════════════════
//  🔌 EXPORTS
// ═══════════════════════════════════════════════════════════
module.exports = {
  name: 'antilink',
  version: '1.0.2',

  async init({ db } = {}) {
    if (db) {
      _db = db;
      await ensureIndexes(db);
      console.log('🛡️ Antilink ready (MongoDB)');
    } else {
      console.log('🛡️ Antilink ready (defaults only)');
    }
  },

  handle,
  _getCfg: getCfg,
  _saveCfg: saveCfg
};
