import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import express, { type Request } from 'express';
import request from 'supertest';
import type { PluginManifest } from '../../core/plugins/plugin.interfaces';
import { EngineStatus } from '../../engine/interfaces/whatsapp-engine.interface';
import { IngressController } from './ingress.controller';
import { IngressService } from './ingress.service';

describe('Supabase OTP acknowledgment HTTP contract', () => {
  it('returns parseable JSON with the JSON media type on first delivery and duplicate delivery', async () => {
    // Use the shipped manifest, real signature verifier, ingress service, controller and Express
    // response handling. A body-only assertion missed the missing Content-Type in this package.
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, '../../../integrations/supabase-otp-hook/manifest.json'), 'utf8'),
    ) as PluginManifest;
    const key = Buffer.from('isolated-test-key-for-hook-response');
    const secret = 'v1,whsec_' + key.toString('base64');
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const body = JSON.stringify({ user: { phone: '+919999999999' }, sms: { otp: '123456' } });
    const webhookId = 'test-hook-delivery';
    const signature = 'v1,' + createHmac('sha256', key).update(`${webhookId}.${timestamp}.${body}`).digest('base64');
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const service = new IngressService({
      instances: {
        resolve: () =>
          Promise.resolve({
            id: 'supabase-otp-hook:test',
            pluginId: 'supabase-otp-hook',
            instanceId: 'test',
            secret,
            enabled: true,
            sessionScope: 'session-1',
          }),
      },
      manifestRoute: () => manifest.ingress![0],
      sessionStatus: () => EngineStatus.READY,
      events: { recordOrSkip: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) },
      enqueue,
      now: () => now,
    });
    const controller = new IngressController(service);
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, bytes) => {
          (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(bytes);
        },
      }),
    );
    app.post('/hook', async (req, res) => {
      (req as Request).params.path = 'send-sms';
      await controller.receive(manifest.id, 'test', {}, req, res);
    });
    for (let i = 0; i < 2; i++) {
      const response = await request(app)
        .post('/hook')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', signature)
        .send(body);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^application\/json\b/);
      expect(response.body).toEqual({});
      expect(response.text).toBe('{}');
    }
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
