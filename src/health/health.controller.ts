import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { HealthService } from './health.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Deploy verification runs before anyone holds a credential, so this is public by design.
   * It carries no reservation, account, or configuration data — only two availability
   * labels, which is also what keeps it compliant with FR-017.
   */
  @Public()
  @Get()
  @ApiOkResponse({
    description: 'The service and its data store are available.',
    schema: {
      example: { status: 'ok', database: 'up' },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'The data store is not reachable.',
    schema: {
      example: { status: 'error', database: 'down' },
    },
  })
  check(): { status: string; database: string } {
    const database = this.healthService.databaseState();

    if (database !== 'up') {
      // A non-success status, not a 200 carrying a failure field: automated checks read the
      // status code, so a 200 here would be reported as healthy (FR-016).
      throw new HttpException(
        { status: 'error', database },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: 'ok', database };
  }
}
