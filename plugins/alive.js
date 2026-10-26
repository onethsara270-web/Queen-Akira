const { cmd, commands } = require('../command');
const os = require("os");
const { runtime } = require('../lib/functions');
const config = require('../config');

cmd({
    pattern: "alive",
    alias: ["status", "runtime", "uptime"],
    desc: "Check bot status with interactive UI",
    category: "main",
    react: "🧚‍♂️",
    filename: __filename
},
async (conn, mek, m, {
    from, quoted, body, isCmd, command, args, q, isGroup,
    sender, senderNumber, botNumber2, botNumber, pushname,
    isMe, isOwner, groupMetadata, groupName, participants,
    groupAdmins, isBotAdmins, isAdmins, reply
}) => {

    try {
        // ══════════════════════════════════════════════════════════
        // 📊 SYSTEM STATS
        // ══════════════════════════════════════════════════════════
        const uptime = runtime(process.uptime());
        const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const ramTotal = (os.totalmem() / 1024 / 1024).toFixed(2);
        const host = os.hostname();

        // ══════════════════════════════════════════════════════════
        // ⭐ CONFIG VALUES
        // ══════════════════════════════════════════════════════════
        const botName = config.BOT_NAME || 'LUXALGO-MD';
        const ownerName = config.OWNER_NAME || 'LUXALGO';
        const aliveImg = config.ALIVE_IMG || 'https://i.postimg.cc/Y9VQtfYS/file-000000006b04821189e40920bd7a1471.png';
        const description = config.DESCRIPTION || '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜxᴀʟɢᴏ';

        // 👤 User name
        const userName = pushname || senderNumber || 'User';

        // ══════════════════════════════════════════════════════════
        // 📝 CAPTION TEXT
        // ══════════════════════════════════════════════════════════
        const caption = `
👋 𝙷𝙴𝙻𝙻𝙾𝚆 *${userName}* 𝚆𝙴𝙻𝙲𝙾𝙼𝙴 𝚃𝙾 ʟᴜxᴀʟɢᴏ 🎉

 ╭─「 ꜱᴛᴀᴛᴜꜱ ᴘᴀɴᴇʟ 」 ──●●►
 │  ⏳ *Uptime*   : ${uptime}
 │  👤 *User*     : ${userName}
 │  📂 *RAM*      : ${ramUsed}MB / ${ramTotal}MB
 │  ⚙️ *Host*     : ${host}
 │  👨‍💻 *Owner*    : ${ownerName}
 │  🧬 *Version*  : 3.0.0 BETA
 ╰───────────●●►

${description}`;

        // ══════════════════════════════════════════════════════════
        // 🎯 CONTEXT INFO — Group & DM දෙකටම
        // ══════════════════════════════════════════════════════════
        const contextInfo = {
            mentionedJid: [sender],
            forwardingScore: 999,
            isForwarded: true
        };

        // Newsletter context — DM වලට විතරක් (group වල error එනවා)
        if (!isGroup) {
            contextInfo.forwardedNewsletterMessageInfo = {
                newsletterJid: '120363409414874042@newsletter',
                newsletterName: botName,
                serverMessageId: 143
            };
        }

        // Group එකට අදාල extra data
        if (isGroup) {
            contextInfo.expiration = 0;
            if (participants && participants.length > 0) {
                contextInfo.mentionedJid = participants
                    .slice(0, 5)
                    .map(p => p.id || p.jid || p)
                    .filter(Boolean);
            }
        }

        // ══════════════════════════════════════════════════════════
        // 🎯 KEY FLAG — DM = true, Group = false
        // ══════════════════════════════════════════════════════════
        const aiBadge = !isGroup; // 👈 DM එකට true, Group එකට false

        // ══════════════════════════════════════════════════════════
        // 🎯 BUTTON CHECK
        // ══════════════════════════════════════════════════════════
        const buttonEnabled = String(config.BUTTON).toLowerCase() === 'true';

        // Group වල buttons 3ට වඩා support නැහැ සමහර versions වල
        const maxButtons = isGroup ? 3 : 6;

        if (buttonEnabled) {
            // ✅ Button list හදන්න
            let buttonsList = [
                {
                    buttonId: '.ping',
                    buttonText: { displayText: '🏓 Ping' },
                    type: 1
                },
                {
                    buttonId: '.owner',
                    buttonText: { displayText: '👤 Owner' },
                    type: 1
                },
                {
                    buttonId: '.menu',
                    buttonText: { displayText: '📋 Menu' },
                    type: 1
                }
            ];

            // Group නම් buttons කපන්න
            buttonsList = buttonsList.slice(0, maxButtons);

            // ══════════════════════════════════════════════════
            // 📤 SEND with BUTTONS (ai: aiBadge)
            // ══════════════════════════════════════════════════
            await conn.sendMessage(from, {
                image: { url: aliveImg },
                caption: caption,
                footer: '🔘 Select an option below',
                ai: aiBadge,  // 👈 DM = true, Group = false
                buttons: buttonsList,
                headerType: 1,
                contextInfo
            }, { quoted: mek });

            console.log(`✅ Buttons sent (${isGroup ? 'GROUP' : 'DM'}) — count: ${buttonsList.length}, ai: ${aiBadge}`);

        } else {
            // ══════════════════════════════════════════════════
            // 📤 SEND WITHOUT BUTTONS (ai: aiBadge)
            // ══════════════════════════════════════════════════
            await conn.sendMessage(from, {
                image: { url: aliveImg },
                caption: caption,
                ai: aiBadge,  // 👈 DM = true, Group = false
                contextInfo
            }, { quoted: mek });

            console.log(`✅ No buttons sent (${isGroup ? 'GROUP' : 'DM'}) — ai: ${aiBadge}`);
        }

    } catch (e) {
        console.error("alive Error:", e);

        // ══════════════════════════════════════════════════════════
        // 🔄 FALLBACK — Group & DM දෙකටම
        // ══════════════════════════════════════════════════════════
        const botName = config.BOT_NAME || 'LUXALGO-MD';
        const ownerName = config.OWNER_NAME || 'LUXALGO';
        const description = config.DESCRIPTION || '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜxᴀʟɢᴏ';
        const userName = pushname || senderNumber || 'User';

        const fallback = `
👋 𝙷𝙴𝙻𝙻𝙾𝚆 *${userName}* 𝚆𝙴𝙻𝙲𝙾𝙼𝙴 𝚃𝙾 ʟᴜxᴀʟɢᴏ 🎉

 ╭─「 ꜱᴛᴀᴛᴜꜱ ᴘᴀɴᴇʟ 」 ──●●►
 │  ⏳ *Uptime*   : ${runtime(process.uptime())}
 │  👤 *User*     : ${userName}
 │  📂 *RAM*      : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB / ${(os.totalmem() / 1024 / 1024).toFixed(2)}MB
 │  ⚙️ *Host*     : ${os.hostname()}
 │  👨‍💻 *Owner*    : ${ownerName}
 │  🧬 *Version*  : 3.0.0 BETA
 ╰───────────●●►

${description}`;

        try {
            await conn.sendMessage(from, {
                text: fallback,
                ai: !isGroup,  // 👈 DM = true, Group = false
                contextInfo: {
                    mentionedJid: [sender]
                }
            }, { quoted: mek });
        } catch (err) {
            // අන්තිම fallback — සරල text (ai flag නැතුව)
            try {
                await reply(fallback);
            } catch (finalErr) {
                console.error("Final fallback failed:", finalErr);
            }
        }
    }
});
