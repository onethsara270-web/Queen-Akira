// lib/antidel.js
// ===========================================================
// 🛡️ ANTI-DELETE HANDLER — Per-bot aware + CONFIG BASED
// Owner → global getAnti()  ·  User → own config
// ===========================================================
const config = require('../config');
const { getAnti } = require('../data/antidel');

// ============================================================
// ⭐ Config values
// ============================================================
function getConfig() {
    return {
        botName: config.BOT_NAME || 'LUXALGO-MD',
        ownerName: config.OWNER_NAME || 'LUXALGO',
        ownerNumber: config.OWNER_NUMBER || '94773416478'
    };
}

// ⚡ PER-BOT status resolver
function getBotAntiStatus(conn) {
    if (!conn) return { gc: false, dm: false };
    const isOwnerBot = conn._isOwnerBot === true;
    if (isOwnerBot) {
        return {
            gc: (typeof getAnti === 'function') ? getAnti('gc') : false,
            dm: (typeof getAnti === 'function') ? getAnti('dm') : false
        };
    }
    const cfg = conn._userConfig || {};
    return {
        gc: String(cfg.ANTI_DELETE_GC) === 'true',
        dm: String(cfg.ANTI_DELETE_DM) === 'true'
    };
}

function getSLTime() {
    const now = new Date();
    return {
        time: now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: true }),
        date: now.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric' })
    };
}

const DeletedText = async (conn, mek, jid, deleteInfo, isGroup, update) => {
    try {
        const messageContent =
            mek.message?.conversation ||
            mek.message?.extendedTextMessage?.text ||
            mek.message?.imageMessage?.caption ||
            mek.message?.videoMessage?.caption ||
            'Unknown content';

        const formattedContent = messageContent.length > 200
            ? messageContent.substring(0, 200) + '...'
            : messageContent;

        const deleteText = `🛡️ *ANTI-DELETE DETECTED*

${deleteInfo}

📝 *Message:*
${formattedContent}`;

        await conn.sendMessage(jid, {
            text: deleteText,
            contextInfo: {
                mentionedJid: isGroup
                    ? [update.key.participant, mek.key.participant].filter(Boolean)
                    : [update.key.remoteJid].filter(Boolean),
                forwardingScore: 999,
                isForwarded: true,
            },
        }, { quoted: mek });
        console.log(`✅ AntiDelete text → ${jid}`);
    } catch (error) {
        console.error('❌ DeletedText:', error.message);
    }
};

const DeletedMedia = async (conn, mek, jid, deleteInfo) => {
    try {
        const antideletedmek = JSON.parse(JSON.stringify(mek.message));
        const messageType = Object.keys(antideletedmek)[0];

        if (antideletedmek[messageType]) {
            antideletedmek[messageType].contextInfo = {
                stanzaId: mek.key.id,
                participant: mek.key.participant || mek.key.remoteJid,
                quotedMessage: mek.message,
            };
        }

        const deleteCaption = `🛡️ *ANTI-DELETE DETECTED*

${deleteInfo}`;

        if (messageType === 'imageMessage' || messageType === 'videoMessage') {
            antideletedmek[messageType].caption = deleteCaption;
            await conn.relayMessage(jid, antideletedmek, {});
        } else if (messageType === 'audioMessage') {
            await conn.sendMessage(jid, { text: deleteCaption }, { quoted: mek });
            await conn.relayMessage(jid, antideletedmek, {});
        } else if (messageType === 'documentMessage') {
            antideletedmek[messageType].caption = deleteCaption;
            await conn.relayMessage(jid, antideletedmek, {});
        } else if (messageType === 'stickerMessage') {
            await conn.sendMessage(jid, { text: `${deleteInfo}\n\n📎 *Sticker was deleted*` }, { quoted: mek });
            await conn.relayMessage(jid, antideletedmek, {});
        } else {
            await conn.sendMessage(jid, { text: deleteCaption }, { quoted: mek });
        }
        console.log(`✅ AntiDelete media → ${jid}`);
    } catch (e) {
        console.error('❌ DeletedMedia:', e.message);
        try {
            await conn.sendMessage(jid, { text: `🚨 *Deleted Media Detected*\n\n${deleteInfo}` }, { quoted: mek });
        } catch (err) {}
    }
};

const AntiDelete = async (conn, updates) => {
    try {
        const { gc: gcStatus, dm: dmStatus } = getBotAntiStatus(conn);

        if (!gcStatus && !dmStatus) return;

        const botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';

        for (const update of updates) {
            if (update.update.message !== null) continue;

            const { loadMessage } = require('../data');
            const store = await loadMessage(update.key.id);
            if (!store || !store.message) continue;

            const mek = store.message;
            const isGroup = (store.jid || '').endsWith('@g.us');

            const active = isGroup ? gcStatus : dmStatus;
            if (!active) continue;

            const { time: deleteTime, date: deleteDate } = getSLTime();
            let deleteInfo, jid;

            if (isGroup) {
                try {
                    const groupMetadata = await conn.groupMetadata(store.jid);
                    const sender = mek.key.participant || 'Unknown';
                    const deleter = update.key.participant || 'Unknown';
                    deleteInfo = `📋 *DETAILS*
🕐 ${deleteTime}
📅 ${deleteDate}
🏘️ ${groupMetadata.subject}
🗑️ @${deleter.split('@')[0]}
📤 @${sender.split('@')[0]}`;
                } catch (e) {
                    deleteInfo = `📋 *DETAILS*
🕐 ${deleteTime}
📅 ${deleteDate}
🏘️ Unknown`;
                }
                jid = store.jid;
            } else {
                const sender = mek.key.remoteJid?.split('@')[0] || 'Unknown';
                deleteInfo = `📋 *DETAILS*
🕐 ${deleteTime}
📅 ${deleteDate}
💬 Personal Chat
📤 @${sender}`;
                jid = botJid;
            }

            const hasText = mek.message?.conversation || mek.message?.extendedTextMessage?.text || mek.message?.imageMessage?.caption || mek.message?.videoMessage?.caption;
            const isMedia = mek.message?.imageMessage || mek.message?.videoMessage || mek.message?.audioMessage || mek.message?.documentMessage || mek.message?.stickerMessage;

            if (hasText && !isMedia) {
                await DeletedText(conn, mek, jid, deleteInfo, isGroup, update);
            } else if (isMedia) {
                await DeletedMedia(conn, mek, jid, deleteInfo);
            } else {
                await conn.sendMessage(jid, {
                    text: `🛡️ *ANTI-DELETE DETECTED*\n\n${deleteInfo}`
                }, { quoted: mek });
            }
        }
    } catch (error) {
        console.error('❌ AntiDelete:', error.message);
    }
};

module.exports = {
    DeletedText,
    DeletedMedia,
    AntiDelete,
    getBotAntiStatus,
};
