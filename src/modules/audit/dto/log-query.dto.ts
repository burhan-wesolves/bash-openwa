import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ToStrictNumber } from '../../../common/utils/strict-boolean';
import { AuditAction, AuditSeverity } from '../entities/audit-log.entity';

export class LogQueryDto {
  @ApiPropertyOptional({ enum: ['audit', 'event', 'webhook'] })
  @IsOptional()
  @IsIn(['audit', 'event', 'webhook'])
  source?: 'audit' | 'event' | 'webhook';
  @ApiPropertyOptional({ enum: AuditSeverity })
  @IsOptional()
  @IsEnum(AuditSeverity)
  severity?: AuditSeverity;
  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sessionId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  webhookId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deliveryId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  eventId?: string;
  @ApiPropertyOptional({ description: 'Exact event name, for example message.received' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  event?: string;
  @ApiPropertyOptional({ description: 'Search actions, event names, errors and structured metadata across all pages' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
  @ApiPropertyOptional({ enum: ['emitted', 'queued', 'attempting', 'delivered', 'retrying', 'failed', 'skipped'] })
  @IsOptional()
  @IsIn(['emitted', 'queued', 'attempting', 'delivered', 'retrying', 'failed', 'skipped'])
  outcome?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
  @ApiPropertyOptional({ enum: ['createdAt', 'action', 'severity', 'statusCode'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'action', 'severity', 'statusCode'])
  sortBy: 'createdAt' | 'action' | 'severity' | 'statusCode' = 'createdAt';
  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @ToStrictNumber()
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @ToStrictNumber()
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset = 0;
}
