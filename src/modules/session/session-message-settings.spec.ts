import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { IncomingMessage, IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { applyIncomingSettings } from './session-message-settings';

describe('incoming session settings', () => {
  const message = { id: 'm1', chatId: '123@c.us', fromMe: false } as IncomingMessage;
  let repository: Repository<Session>;
  let engine: IWhatsAppEngine;
  let sendSeen: jest.Mock;
  let warn: jest.Mock;
  let live: boolean;
  beforeEach(() => {
    repository = { findOne: jest.fn().mockResolvedValue({ config: {} }) } as unknown as Repository<Session>;
    sendSeen = jest.fn().mockResolvedValue(true);
    engine = { sendSeen } as unknown as IWhatsAppEngine;
    warn = jest.fn();
    live = true;
  });
  const run = (msg = message) => applyIncomingSettings(repository, 'session', engine, msg, () => live, warn);

  it('leaves receipts off by default and never acknowledges own messages', async () => {
    await expect(run()).resolves.toBe(true);
    await expect(run({ ...message, fromMe: true })).resolves.toBe(true);
    expect(sendSeen).not.toHaveBeenCalled();
  });
  it('keeps online presence separate from automatic reading', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue({ config: { alwaysOnline: true, readMessages: false } });
    await expect(run()).resolves.toBe(true);
    expect(sendSeen).not.toHaveBeenCalled();
  });
  it('reads the current preference on each message and acknowledges the exact message', async () => {
    (repository.findOne as jest.Mock).mockResolvedValueOnce({ config: { readMessages: true } });
    await run();
    expect(sendSeen).toHaveBeenCalledWith('123@c.us', ['m1']);
    await run({ ...message, id: 'm2' });
    expect(sendSeen).toHaveBeenCalledTimes(1);
  });
  it('drops ignored group messages before processing or sending receipts', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue({ config: { ignoreGroups: true, readMessages: true } });
    await expect(run({ ...message, isGroup: true, chatId: 'g@g.us' })).resolves.toBe(false);
    expect(sendSeen).not.toHaveBeenCalled();
    await expect(run()).resolves.toBe(true);
  });
  it('uses a separate preference and the broadcast address for statuses', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue({ config: { readMessages: true } });
    await run({ ...message, isStatusBroadcast: true });
    expect(sendSeen).not.toHaveBeenCalled();
    (repository.findOne as jest.Mock).mockResolvedValue({ config: { readStatus: true } });
    await run({ ...message, isStatusBroadcast: true });
    expect(sendSeen).toHaveBeenCalledWith('status@broadcast', ['m1']);
  });
  it('keeps receiving when a receipt fails', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue({ config: { readMessages: true } });
    sendSeen.mockRejectedValue(new Error('offline'));
    await expect(run()).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
  });
  it('does not send from a retired engine after reading preferences', async () => {
    (repository.findOne as jest.Mock).mockImplementation(() => {
      live = false;
      return Promise.resolve({ config: { readMessages: true } });
    });
    await expect(run()).resolves.toBe(false);
    expect(sendSeen).not.toHaveBeenCalled();
  });
  it('does not interpret legacy truthy values as enabled', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue({ config: { ignoreGroups: 'true', readMessages: 1 } });
    await expect(run({ ...message, isGroup: true })).resolves.toBe(true);
    expect(sendSeen).not.toHaveBeenCalled();
  });
});
