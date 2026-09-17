import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * No imports are needed: the Mongoose connection provider is registered globally by the
 * database module, so it can be injected here directly.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
