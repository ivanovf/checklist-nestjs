import { Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Config, ConfigSchema } from './entities/config.entity';

@Module({
  controllers: [ConfigController],
  providers: [ConfigService],
  imports: [
    MongooseModule.forFeature([
      {
        name: Config.name,
        schema: ConfigSchema,
      },
    ]),
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
