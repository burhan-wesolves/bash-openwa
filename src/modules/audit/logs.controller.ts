import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { LogQueryDto } from './dto/log-query.dto';
import { LogListResponseDto } from './dto/audit-response.dto';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({
    summary: 'List audit, emitted event and webhook delivery logs with search, filters, sorting and pagination',
  })
  @ApiResponse({ status: 200, type: LogListResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid filter, date range, sort or page size' })
  findAll(@Query() query: LogQueryDto, @CurrentApiKey() key?: ApiKey) {
    if (query.startDate && query.endDate && new Date(query.startDate) > new Date(query.endDate)) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    return this.audit.findLogs(query, key?.allowedSessions);
  }
}
