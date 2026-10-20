/* eslint-disable @typescript-eslint/unbound-method -- Host methods are mock spies inspected by expect and jest.mocked. */
import type * as Baileys from '@whiskeysockets/baileys';
import type { WASocket, BinaryNode, proto } from '@whiskeysockets/baileys';
import { BaileysMessaging, type BaileysMessagingHost } from './baileys-messaging';
import { nativeButton, businessNodes } from './baileys-business-messages';
import { BUSINESS_MESSAGE_EXAMPLES } from '../../modules/message/dto/interactive-message.dto';
import { EngineNotReadyError } from '../../common/errors/engine-not-ready.error';
import { loadRemoteMediaBuffer } from '../../common/media/load-remote-media';
import { PayloadTooLargeException } from '@nestjs/common';

jest.mock('../../common/media/load-remote-media', () => ({ loadRemoteMediaBuffer: jest.fn() }));

function harness() {
  const sock = {
    user: { id: '999@s.whatsapp.net' },
    onWhatsApp: jest.fn().mockResolvedValue([{ exists: true, jid: '919876543210@s.whatsapp.net' }]),
    relayMessage: jest
      .fn<Promise<string>, [string, proto.IMessage, { messageId: string; additionalNodes: BinaryNode[] }]>()
      .mockResolvedValue('sent-1'),
    sendMessage: jest.fn(),
  };
  const lib = {
    generateMessageIDV2: jest.fn().mockReturnValue('sent-1'),
    generateWAMessageFromContent: jest.fn((jid: string, content: proto.IMessage) => ({
      key: { id: 'sent-1', fromMe: true, remoteJid: jid },
      message: content,
      messageTimestamp: 123,
    })),
    normalizeMessageContent: (content: proto.IMessage) => content,
    getContentType: (content: proto.IMessage) => Object.keys(content)[0],
    prepareWAMessageMedia: jest.fn().mockResolvedValue({ imageMessage: { url: 'https://uploaded.example/image' } }),
  };
  const host = {
    ensureReady: jest.fn(),
    getSocket: () => sock as unknown as WASocket,
    getSocketOrNull: () => sock as unknown as WASocket,
    loadLib: () => Promise.resolve(lib as unknown as typeof Baileys),
    sessionProxyUrl: () => undefined,
    toEngineJid: (id: string) => id.replace('@c.us', '@s.whatsapp.net'),
    toNeutralJid: (id: string) => id.replace('@s.whatsapp.net', '@c.us'),
    getEphemeralExpiration: () => 86400,
    toUnixSeconds: () => 123,
    putStoredMessage: jest.fn().mockResolvedValue(undefined),
    recordMessage: jest.fn(),
    rememberOwnSend: jest.fn(),
    recordLidMapping: jest.fn(),
    getOnMessageCreate: () => undefined,
    getStoredMessage: jest.fn().mockResolvedValue(null),
    logger: { warn: jest.fn() },
  } as unknown as BaileysMessagingHost;
  return { sock, lib, host, messaging: new BaileysMessaging(host) };
}

describe('Baileys business message relay', () => {
  it('sends mixed buttons with the business node, and preserves the send lifecycle', async () => {
    const { sock, lib, host, messaging } = harness();
    const input = BUSINESS_MESSAGE_EXAMPLES.buttons.mixed.value;
    await expect(messaging.sendButtonsMessage(input.chatId, input)).resolves.toEqual({ id: 'sent-1', timestamp: 123 });
    const content = lib.generateWAMessageFromContent.mock.calls[0][1];
    expect(content.interactiveMessage?.nativeFlowMessage?.buttons?.map(b => b.name)).toEqual([
      'quick_reply',
      'cta_url',
      'cta_copy',
    ]);
    expect(sock.relayMessage).toHaveBeenCalledWith('919876543210@s.whatsapp.net', content, {
      messageId: 'sent-1',
      additionalNodes: businessNodes(),
    });
    expect(lib.generateWAMessageFromContent).toHaveBeenCalledWith(
      expect.any(String),
      content,
      expect.objectContaining({ userJid: '999@s.whatsapp.net', ephemeralExpiration: 86400 }),
    );
    expect(sock.sendMessage).not.toHaveBeenCalled();
    expect(lib.generateMessageIDV2).toHaveBeenCalledWith('999@s.whatsapp.net');
    expect(host.rememberOwnSend).toHaveBeenCalledWith('sent-1');
    expect(host.putStoredMessage).toHaveBeenCalled();
    expect(host.recordMessage).toHaveBeenCalled();
  });
  it('sends lists as a native-flow single_select menu', async () => {
    const { sock, lib, messaging } = harness();
    const input = BUSINESS_MESSAGE_EXAMPLES.list.menu.value;
    await messaging.sendListMessage(input.chatId, input);
    const content = lib.generateWAMessageFromContent.mock.calls[0][1];
    expect(content.listMessage).toBeUndefined();
    const [button] = content.interactiveMessage!.nativeFlowMessage!.buttons!;
    expect(button.name).toBe('single_select');
    const params = JSON.parse(button.buttonParamsJson!) as {
      title: string;
      sections: { rows: { title: string; description: string; id: string }[] }[];
    };
    expect(params.title).toBe(input.buttonText);
    expect(params.sections[0].rows[0]).toMatchObject({ title: 'Billing', description: '', id: 'billing' });
    expect(sock.relayMessage.mock.calls[0][2].additionalNodes).toEqual(businessNodes());
  });
  it('routes business sends like ordinary sends and adds a message secret', async () => {
    const { sock, lib, messaging } = harness();
    const getLIDForPN = jest.fn().mockResolvedValue('777@lid');
    Object.assign(sock, { signalRepository: { lidMapping: { getLIDForPN, getPNForLID: jest.fn() } } });
    const input = BUSINESS_MESSAGE_EXAMPLES.list.menu.value;
    await messaging.sendListMessage(input.chatId, input);
    expect(getLIDForPN).toHaveBeenCalled();
    expect(sock.relayMessage.mock.calls[0][0]).toBe('777@lid');
    const secret = lib.generateWAMessageFromContent.mock.calls[0][1].messageContextInfo?.messageSecret;
    expect(secret).toHaveLength(32);
  });
  it('builds multiple carousel cards and flattens a single card without losing the introduction', async () => {
    const { lib, messaging } = harness();
    const input = BUSINESS_MESSAGE_EXAMPLES.carousel.cards.value;
    await messaging.sendCarouselMessage(input.chatId, input);
    expect(lib.generateWAMessageFromContent.mock.calls[0][1].interactiveMessage?.carouselMessage?.cards).toHaveLength(
      2,
    );
    await messaging.sendCarouselMessage(input.chatId, { ...input, cards: [input.cards[0]] });
    const single = lib.generateWAMessageFromContent.mock.calls[1][1].interactiveMessage;
    expect(single?.carouselMessage).toBeUndefined();
    expect(single?.body?.text).toBe('Our plans\n\nBasic plan');
    const metadata = JSON.parse(single!.nativeFlowMessage!.messageParamsJson!) as { from: string; templateId: string };
    expect(metadata.from).toBe('api');
    expect(metadata.templateId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('refuses unsupported destinations and unregistered recipients before relay', async () => {
    const { sock, messaging } = harness();
    const input = BUSINESS_MESSAGE_EXAMPLES.buttons.mixed.value;
    await expect(messaging.sendButtonsMessage('status@broadcast', input)).rejects.toThrow('individual or group');
    sock.onWhatsApp.mockResolvedValue([]);
    await expect(messaging.sendButtonsMessage(input.chatId, input)).rejects.toThrow('not registered');
    expect(sock.relayMessage).not.toHaveBeenCalled();
  });
  it('refuses unknown quotes and keeps supplied quotes in the generation options', async () => {
    const { lib, host, messaging } = harness();
    const input = { ...BUSINESS_MESSAGE_EXAMPLES.buttons.mixed.value, quotedMessageId: 'q1' };
    await expect(messaging.sendButtonsMessage(input.chatId, input)).rejects.toThrow();
    expect(lib.generateWAMessageFromContent).not.toHaveBeenCalled();
    const quoted = { key: { id: 'q1', remoteJid: input.chatId }, message: { conversation: 'Earlier' } };
    jest.mocked(host.getStoredMessage).mockResolvedValue(quoted);
    host.wasDeletedForEveryone = () => false;
    host.pendingEditOf = () => undefined;
    await messaging.sendButtonsMessage(input.chatId, input);
    expect(lib.generateWAMessageFromContent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ quoted }),
    );
  });
  it('reports an interrupted relay as engine-not-ready and does not persist success', async () => {
    const { sock, host, messaging } = harness();
    sock.relayMessage.mockImplementation(() => {
      host.getSocketOrNull = () => null;
      return Promise.reject(new Error('closed'));
    });
    await expect(
      messaging.sendButtonsMessage('120363123@g.us', BUSINESS_MESSAGE_EXAMPLES.buttons.mixed.value),
    ).rejects.toBeInstanceOf(EngineNotReadyError);
    expect(host.putStoredMessage).not.toHaveBeenCalled();
  });
  it('maps PIX keys to a standalone payment control', () => {
    const button = BUSINESS_MESSAGE_EXAMPLES.buttons.pix.value.buttons[0];
    const native = nativeButton(button);
    expect(native.name).toBe('payment_info');
    const params = JSON.parse(native.buttonParamsJson) as { payment_settings: { pix_static_code: unknown }[] };
    expect(params.payment_settings[0].pix_static_code).toEqual({
      merchant_name: 'Example Store',
      key: 'payments@example.com',
      key_type: 'EMAIL',
    });
  });
  it('relays PIX without text, footer, or image fields and never downloads its unused thumbnail', async () => {
    const { lib, messaging } = harness();
    jest.mocked(loadRemoteMediaBuffer).mockClear();
    const input = BUSINESS_MESSAGE_EXAMPLES.buttons.pix.value;
    await messaging.sendButtonsMessage(input.chatId, {
      ...input,
      description: 'ignored payment decoration',
      footer: 'ignored footer',
      thumbnailUrl: 'https://example.com/unused.jpg',
    });
    const payment = lib.generateWAMessageFromContent.mock.calls[0][1].interactiveMessage!;
    expect(Object.keys(payment)).toEqual(['nativeFlowMessage']);
    expect(payment.nativeFlowMessage?.buttons?.[0].name).toBe('payment_info');
    expect(loadRemoteMediaBuffer).not.toHaveBeenCalled();
  });
  it('keeps every image carousel card body and controls in the relayed envelope', async () => {
    const { lib, sock, messaging } = harness();
    jest.mocked(loadRemoteMediaBuffer).mockResolvedValue({ data: Buffer.from('image'), mimetype: 'image/png' });
    const input = BUSINESS_MESSAGE_EXAMPLES.carousel.cards.value;
    await messaging.sendCarouselMessage(input.chatId, {
      ...input,
      cards: input.cards.map(card => ({ ...card, imageUrl: 'https://example.com/card.png' })),
    });
    const cards = sock.relayMessage.mock.calls[0][1].interactiveMessage?.carouselMessage?.cards;
    expect(cards).toHaveLength(2);
    expect(cards?.map(card => card.body?.text)).toEqual(input.cards.map(card => card.body));
    expect(cards?.map(card => card.nativeFlowMessage?.buttons?.[0].name)).toEqual(['cta_url', 'quick_reply']);
    expect(cards?.every(card => card.header?.hasMediaAttachment && card.header.imageMessage)).toBe(true);
    expect(lib.prepareWAMessageMedia).toHaveBeenCalledTimes(2);
  });
  it('prepares image headers through the bounded proxy-aware media loader', async () => {
    const { lib, host, messaging } = harness();
    host.sessionProxyUrl = () => 'http://proxy.example:8080';
    jest.mocked(loadRemoteMediaBuffer).mockResolvedValue({ data: Buffer.from('image'), mimetype: 'image/png' });
    await messaging.sendButtonsMessage('120363123@g.us', {
      ...BUSINESS_MESSAGE_EXAMPLES.buttons.mixed.value,
      thumbnailUrl: 'https://example.com/image.png',
    });
    expect(loadRemoteMediaBuffer).toHaveBeenLastCalledWith(
      'https://example.com/image.png',
      'http://proxy.example:8080',
    );
    expect(lib.generateWAMessageFromContent.mock.calls[0][1].interactiveMessage?.header?.hasMediaAttachment).toBe(true);
  });
  it('propagates oversized image refusals before any relay', async () => {
    const { sock, messaging } = harness();
    jest.mocked(loadRemoteMediaBuffer).mockRejectedValueOnce(new PayloadTooLargeException('Image too large'));
    await expect(
      messaging.sendButtonsMessage('120363123@g.us', {
        ...BUSINESS_MESSAGE_EXAMPLES.buttons.mixed.value,
        thumbnailUrl: 'https://example.com/image.png',
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(sock.relayMessage).not.toHaveBeenCalled();
  });
});
