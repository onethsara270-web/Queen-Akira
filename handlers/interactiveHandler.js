// handlers/interactiveHandler.js
const events = require('../command');

async function handleInteractiveResponse(conn, mek, m, ctx) {
    try {
        if (!mek.message?.interactiveResponseMessage) return false;

        const response = mek.message.interactiveResponseMessage;
        const nativeFlow = response.nativeFlowResponseMessage;
        if (!nativeFlow || !nativeFlow.paramsJson) return false;

        let params;
        try {
            params = typeof nativeFlow.paramsJson === 'string'
                ? JSON.parse(nativeFlow.paramsJson)
                : nativeFlow.paramsJson;
        } catch (e) {
            console.error('❌ paramsJson parse error:', e);
            return false;
        }

        const selectedId = params.id;
        if (!selectedId) return false;

        console.log(`🔘 Button selected: ${selectedId}`);

        // ✅ NEW — Menu buttons (menu_1, menu_2, ...) ignore — menu.js body handler catches them
        if (/^menu_\d+$/i.test(selectedId)) {
            console.log(`📋 Menu button detected: ${selectedId} — passing to body handler`);
            return false; // Let index.js body handler catch it
        }

        const buttonMap = {
            aimenu: 'aimenu',
            anmiemenu: 'anmiemenu',
            reactions: 'reactions',
            convertmenu: 'convertmenu',
            funmenu: 'funmenu',
            dlmenu: 'dlmenu',
            listcmd: 'listcmd',
            mainmenu: 'menu',
            groupmenu: 'groupmenu',
            allmenu: 'allmenu',
            ownermenu: 'ownermenu',
            othermenu: 'othermenu',
            logo: 'logo',
            repo: 'repo'
        };

        const cmdName = buttonMap[selectedId] || selectedId;

        const cmd = events.commands.find((c) => c.pattern === cmdName)
            || events.commands.find((c) => c.alias && c.alias.includes(cmdName));

        // ✅ CHANGED — Instead of sending "Command not found", just skip silently
        if (!cmd) {
            console.log(`⚠️ No command found for: ${cmdName} — skipping`);
            return false; // Let other handlers try
        }

        const {
            from, quoted, body, isCmd, args, q, text,
            isGroup, sender, senderNumber, botNumber2, botNumber,
            pushname, isMe, isOwner, isCreator,
            groupMetadata, groupName, participants, groupAdmins,
            isBotAdmins, isAdmins, reply
        } = ctx;

        if (cmd.react) {
            await conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
        }

        await cmd.function(conn, mek, m, {
            from, quoted, body, isCmd,
            command: cmdName,
            args, q, text,
            isGroup, sender, senderNumber, botNumber2, botNumber,
            pushname, isMe, isOwner, isCreator,
            groupMetadata, groupName, participants, groupAdmins,
            isBotAdmins, isAdmins, reply
        });

        return true;
    } catch (err) {
        console.error('❌ Interactive handler error:', err);
        return false;
    }
}

module.exports = { handleInteractiveResponse };
