import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

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
  getHome(): object {
    return this.appService.getHome();
  }
}
