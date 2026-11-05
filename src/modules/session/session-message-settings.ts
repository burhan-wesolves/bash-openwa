import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { IncomingMessage, IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';

/** Read the saved preference for each arrival so toggles apply without reconnecting. */
export async function applyIncomingSettings(
  repository: Repository<Session>,
  id: string,
  engine: IWhatsAppEngine,
  message: IncomingMessage,
  isLive: () => boolean,
  warn: (error: unknown) => void,
): Promise<boolean> {
  if (message.fromMe) return true;
  let config: Record<string, unknown>;
  try {
    config = (await repository.findOne({ where: { id }, select: { id: true, config: true } }))?.config ?? {};
  } catch (error) {
    warn(error);
    return isLive() && !message.isGroup; // Do not expose groups if their ignore preference cannot be read.
  }
  if (!isLive()) return false;
  if (message.isGroup && config.ignoreGroups === true) return false;
  const read = message.isStatusBroadcast ? config.readStatus : config.readMessages;
  if (read === true) {
    // Failure of an optional receipt must never discard the incoming message or status.
    void engine.sendSeen(message.isStatusBroadcast ? 'status@broadcast' : message.chatId, [message.id]).catch(warn);
  }
  return true;
}
