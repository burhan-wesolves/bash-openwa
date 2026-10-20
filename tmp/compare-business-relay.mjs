import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { proto, generateWAMessageFromContent } from '@whiskeysockets/baileys';

const current = 'F:/Third Party Repo/OpenWA/node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js';
const reference = 'F:/Third Party Repo/bash_evo_api/node_modules/baileys/lib/Socket/messages-send.js';
const recipient = '222@s.whatsapp.net';
const content = { listMessage: { title: 'Choose', description: '', buttonText: 'Menu', footerText: '', listType: 1,
  sections: [{ title: 'Services', rows: [{ title: 'Billing', description: '', rowId: 'billing' }] }] } };
const nodes = [{ tag: 'biz', attrs: {}, content: [{ tag: 'list', attrs: { type: 'product_list', v: '2' } }] }];

async function capture(file, failPrimary = false) {
  const encrypted = [], stanzas = [], errors = [];
  const own = '111:1@s.whatsapp.net';
  const logger = Object.fromEntries(['debug', 'trace', 'info', 'warn', 'error'].map(level => [level,
    (obj, msg) => { if (level === 'error') errors.push(msg); }]));
  logger.child = () => logger;
  const devices = user => [0, 2].map(device => ({ user, device, server: 's.whatsapp.net' }));
  const sock = {
    authState: { creds: { me: { id: own } }, keys: {
      get: async (type, keys) => type === 'session' ? Object.fromEntries(keys.map(key => [key, {}])) : type === 'tctoken' ? Object.fromEntries(keys.map(key => [key,
        { token: Buffer.from('token'), timestamp: Math.floor(Date.now() / 1000), senderTimestamp: Math.floor(Date.now() / 1000) }])) : {},
      set: async () => {}, transaction: async fn => fn(),
    } },
    signalRepository: {
      lidMapping: { getLIDForPN: async () => null, getPNForLID: async () => null },
      validateSession: async () => ({ exists: true }),
      jidToSignalProtocolAddress: jid => jid,
      encryptMessage: async ({ jid, data }) => {
        if (failPrimary && jid === recipient) throw new Error('Primary-device encryption test failure');
        const unpadded = data.subarray(0, data.length - data[data.length - 1]);
        encrypted.push({ jid, bytes: unpadded.toString('hex'), root: Object.keys(proto.Message.toObject(proto.Message.decode(unpadded))) });
        return { type: 'msg', ciphertext: Buffer.from('encrypted') };
      },
    },
    ev: { on: () => {}, emit: () => {} },
    ws: { on: () => {} },
    serverProps: { privacyTokenOn1to1: true },
    registerSocketEndHandler: () => {},
    sendNode: async node => stanzas.push(node),
    query: async () => { throw new Error('No network should be needed'); },
  };
  globalThis.__businessRelaySock = sock;
  const fileUrl = pathToFileURL(file);
  const require = createRequire(fileUrl);
  const source = readFileSync(file, 'utf8').replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => {
    const url = specifier === '@cacheable/node-cache'
      ? 'data:text/javascript,export default class Cache { constructor(){this.items=new Map()} get(k){return this.items.get(k)} set(k,v){this.items.set(k,v)} del(k){this.items.delete(k)} }'
      : specifier === './newsletter.js'
      ? `data:text/javascript,export const makeNewsletterSocket=()=>globalThis.__businessRelaySock`
      : specifier.startsWith('.') ? new URL(specifier, fileUrl).href : pathToFileURL(require.resolve(specifier)).href;
    return `from ${JSON.stringify(url)}`;
  });
  const { makeMessagesSocket } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${failPrimary}`);
  const relay = makeMessagesSocket({ logger, options: {}, enableRecentMessageCache: false,
    patchMessageBeforeSending: message => message,
    userDevicesCache: { mget: async users => Object.fromEntries(users.map(user => [user, devices(user)])) },
  });
  let error;
  try { await relay.relayMessage(recipient, generateWAMessageFromContent(recipient, structuredClone(content), {
    userJid: own, messageId: 'wire-test',
  }).message, { messageId: 'wire-test', additionalNodes: nodes }); }
  catch (err) { error = err.message; }
  return { encrypted, stanzas: stanzas.map(node => ({ attrs: node.attrs, tags: node.content.map(child => child.tag) })), errors, error };
}
for (const [name, file] of [['OpenWA rc14', current], ['Evo rc9', reference]]) {
  try { console.log(JSON.stringify({ name, normal: await capture(file), primaryFailure: await capture(file, true) })); }
  catch (error) { console.log(JSON.stringify({name, error: error.message})); }
}
