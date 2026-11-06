import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { LogsController } from './logs.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog], 'main')],
  controllers: [AuditController, LogsController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
