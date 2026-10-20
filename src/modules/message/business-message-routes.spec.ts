import 'reflect-metadata';
import { INTERCEPTORS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MessageController } from './message.controller';
import { CHAT_SCOPED_KEY, REQUIRED_ROLE_KEY } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { SendIdempotencyInterceptor } from './idempotency/send-idempotency.interceptor';

describe('business send route policies', () => {
  it.each(['Buttons', 'List', 'Carousel'] as const)(
    'protects send%s with operator, chat scope, and idempotency',
    kind => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Read Nest metadata; the handler is not invoked.
      const method = MessageController.prototype[`send${kind}`];
      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(`send-${kind.toLowerCase()}`);
      expect(Reflect.getMetadata(REQUIRED_ROLE_KEY, method)).toBe(ApiKeyRole.OPERATOR);
      expect(Reflect.getMetadata(CHAT_SCOPED_KEY, method)).toBe('fenced');
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, method)).toContain(SendIdempotencyInterceptor);
    },
  );
});
