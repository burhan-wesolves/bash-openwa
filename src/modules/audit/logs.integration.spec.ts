import { createServer, Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { LogQueryDto } from './dto/log-query.dto';
import { Session } from '../session/entities/session.entity';
import { Webhook } from '../webhook/entities/webhook.entity';
import { WebhookOutboxEvent } from '../webhook/entities/webhook-outbox-event.entity';
import { WebhookDeliveryFailure } from '../webhook/entities/webhook-delivery-failure.entity';
import { WebhookOutboxService } from '../webhook/webhook-outbox.service';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';
import { WEBHOOK_EVENTS } from '../webhook/dto/webhook.dto';
import { HookManager } from '../../core/hooks';
import { GLOBAL_VALIDATION_OPTIONS } from '../../config/app-validation';

describe('event and webhook logs through a real HTTP receiver and SQLite', () => {
  let main: DataSource;
  let data: DataSource;
  let audit: AuditService;
  let delivery: WebhookDeliveryService;
  let receiver: Server;
  let sessionId: string;
  let otherSessionId: string;
  let webhook: Webhook;
  let url: string;
  let mode: 'success' | 'retry' | 'failure' = 'success';
  let posts: Array<{ event: string; deliveryId: string; signed: boolean }> = [];
  const previousAllowlist = process.env.SSRF_ALLOWED_HOSTS;
  const query = (input: Partial<LogQueryDto> = {}) => Object.assign(new LogQueryDto(), input);

  beforeAll(async () => {
    process.env.SSRF_ALLOWED_HOSTS = '127.0.0.1';
    receiver = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const payload = JSON.parse(body) as { event: string; deliveryId: string };
        posts.push({
          ...payload,
          signed:
            req.headers['x-openwa-signature'] ===
            'sha256=' + createHmac('sha256', 'secret-for-test').update(body).digest('hex'),
        });
        res.writeHead(mode === 'failure' || (mode === 'retry' && posts.length === 1) ? 503 : 200);
        res.end('ok');
      });
    });
    await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address() as { port: number };
    url = `http://127.0.0.1:${address.port}/hook`;
    main = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AuditLog],
      synchronize: true,
    }).initialize();
    data = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Session, Webhook, WebhookDeliveryFailure, WebhookOutboxEvent],
      synchronize: true,
    }).initialize();
    audit = new AuditService(main.getRepository(AuditLog));
    sessionId = (await data.getRepository(Session).save({ name: 'logs-test' })).id;
    otherSessionId = (await data.getRepository(Session).save({ name: 'other-tenant' })).id;
    webhook = await data
      .getRepository(Webhook)
      .save({ sessionId, url, events: ['*'], secret: 'secret-for-test', retryCount: 2 });
    const hooks = {
      execute: (_name: string, value: unknown) => Promise.resolve({ continue: true, data: value }),
    } as unknown as HookManager;
    delivery = new WebhookDeliveryService(
      data.getRepository(Webhook),
      data.getRepository(WebhookDeliveryFailure),
      new ConfigService({
        queue: { enabled: false },
        webhook: { timeout: 2000, retryDelay: 1, dispatchConcurrency: 4 },
      }),
      hooks,
      new WebhookOutboxService(data.getRepository(WebhookOutboxEvent)),
      undefined,
      undefined,
      audit,
    );
  });
  beforeEach(async () => {
    mode = 'success';
    posts = [];
    await main.getRepository(AuditLog).clear();
    await data.getRepository(Webhook).update(webhook.id, { events: ['*'], filters: null });
  });
  afterAll(async () => {
    await delivery?.onModuleDestroy();
    receiver?.closeAllConnections();
    await new Promise<void>(resolve => receiver?.close(() => resolve()));
    await main?.destroy();
    await data?.destroy();
    if (previousAllowlist === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
    else process.env.SSRF_ALLOWED_HOSTS = previousAllowlist;
  });

  it('records emission and signed delivery for every advertised event without storing payloads', async () => {
    for (const event of WEBHOOK_EVENTS)
      await delivery.dispatch(sessionId, event, { id: event, qr: 'NEVER-LOG-THIS', body: 'PRIVATE-CONTENT' });
    expect(posts.map(p => p.event)).toEqual([...WEBHOOK_EVENTS]);
    expect(posts.every(p => p.signed)).toBe(true);
    for (const event of WEBHOOK_EVENTS) {
      const rows = await audit.findLogs(query({ event }));
      expect(rows.data.map(r => r.action)).toEqual(
        expect.arrayContaining([
          AuditAction.EVENT_EMITTED,
          AuditAction.WEBHOOK_QUEUED,
          AuditAction.WEBHOOK_ATTEMPT,
          AuditAction.WEBHOOK_DELIVERED,
        ]),
      );
      const success = rows.data.find(r => r.action === AuditAction.WEBHOOK_DELIVERED)!;
      expect(success.statusCode).toBe(200);
      expect(success.metadata).toMatchObject({ webhookId: webhook.id, outcome: 'delivered', attempt: 1 });
      expect(posts.some(p => p.deliveryId === success.metadata?.deliveryId)).toBe(true);
      const emitted = rows.data.find(r => r.action === AuditAction.EVENT_EMITTED)!;
      expect((await audit.findLogs(query({ eventId: String(emitted.metadata?.eventId) }))).total).toBe(4);
    }
    const all = await audit.findLogs(query({ limit: 200 }));
    expect(JSON.stringify(all)).not.toMatch(/NEVER-LOG-THIS|PRIVATE-CONTENT|secret-for-test/);
  });
  it('records a retry followed by delivery with one correlation ID', async () => {
    mode = 'retry';
    await delivery.dispatch(sessionId, 'message.received', { id: 'retry' });
    const rows = await audit.findLogs(query({ webhookId: webhook.id }));
    expect(rows.data.find(r => r.action === AuditAction.WEBHOOK_RETRY)?.statusCode).toBe(503);
    expect(rows.data.find(r => r.action === AuditAction.WEBHOOK_DELIVERED)?.metadata?.attempt).toBe(2);
    expect(new Set(posts.map(p => p.deliveryId)).size).toBe(1);
  });
  it('records terminal failure and filtering without falsely reporting delivery', async () => {
    mode = 'failure';
    await delivery.dispatch(sessionId, 'message.received', { id: 'failed' });
    expect((await audit.findLogs(query({ outcome: 'failed' }))).total).toBe(1);
    expect((await audit.findLogs(query({ outcome: 'delivered' }))).total).toBe(0);
    await data.getRepository(Webhook).update(webhook.id, { events: ['call.received'] });
    await delivery.dispatch(sessionId, 'message.edited', { id: 'skipped' });
    await new Promise(resolve => setImmediate(resolve));
    expect((await audit.findLogs(query({ outcome: 'skipped' }))).data[0].errorMessage).toBe('Event not subscribed');
  });
  it('filters, searches the whole table, sorts and pages while enforcing tenant scope', async () => {
    await delivery.dispatch(sessionId, 'message.received', { id: 'search' });
    await delivery.dispatch(otherSessionId, 'call.received', {});
    const all = await audit.findLogs(query({ limit: 1, sortBy: 'action', sortOrder: 'ASC' }));
    expect(all.data).toHaveLength(1);
    expect(all.total).toBeGreaterThan(1);
    const next = await audit.findLogs(query({ limit: 1, offset: 1, sortBy: 'action', sortOrder: 'ASC' }));
    expect(next.data[0].id).not.toBe(all.data[0].id);
    expect((await audit.findLogs(query({ search: 'message.received', source: 'webhook' }))).total).toBe(3);
    expect((await audit.findLogs(query({ search: '%' }))).total).toBe(0);
    expect((await audit.findLogs(query({ sessionId: otherSessionId }), [sessionId])).total).toBe(0);
    expect((await audit.findLogs(query(), [])).total).toBe(5); // Empty allowlists are unrestricted in the existing key model.
    expect((await audit.findLogs(query(), [sessionId])).data.every(r => r.sessionId === sessionId)).toBe(true);
    expect((await audit.findLogs(query({ startDate: '2099-01-01T00:00:00Z' }))).total).toBe(0);
    expect((await audit.findLogs(query({ endDate: '2000-01-01T00:00:00Z' }))).total).toBe(0);
  });
  it.each([
    { limit: 201 },
    { limit: -1 },
    { offset: 1.5 },
    { sortBy: 'metadata' },
    { sortOrder: 'DROP TABLE' },
    { source: 'other' },
    { startDate: 'yesterday' },
    { event: ['call.received'] },
  ])('rejects invalid query %p', async value => {
    const pipe = new ValidationPipe(GLOBAL_VALIDATION_OPTIONS);
    await expect(pipe.transform(value, { type: 'query', metatype: LogQueryDto })).rejects.toThrow();
  });
});
