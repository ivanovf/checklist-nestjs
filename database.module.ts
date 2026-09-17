import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      // Injected rather than read from process.env, so the connection cannot be built from
      // values that have not passed startup validation.
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUser = config.get<string>('DB_USER');
        const dbPass = encodeURIComponent(config.get<string>('DB_PASS'));
        const dbHost = config.get<string>('DB_HOST');
        const rawPort = config.get<string>('DB_PORT');
        const dbPort = rawPort ? `:${rawPort}` : '';
        const dbDrive = config.get<string>('DB_DRIVE');
        const dbName = config.get<string>('DB_NAME');
        const rawArgs = config.get<string>('DB_ARGS');
        const args = rawArgs ? `?${rawArgs}` : '';

        return {
          uri: `${dbDrive}://${dbHost}${dbPort}/${args}`,
          user: dbUser,
          pass: dbPass,
          dbName: dbName,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
