import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { AppInfoResponseDto } from './app-info-response.dto';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Service root. Public by design — it carries no reservation or account data and is used as
   * a liveness probe by the deployment platforms. Under default-deny this has to say so.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Identify the service' })
  @ApiOkResponse({
    type: AppInfoResponseDto,
    description: 'The service name and version.',
  })
  getHome(): object {
    return this.appService.getHome();
  }
}
