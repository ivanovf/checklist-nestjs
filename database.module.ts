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

        // The database name is passed as `dbName` below and deliberately kept OUT of the
        // URI path. With no database in the path the driver defaults its authentication
        // source to `admin`, which is where both Atlas users and the local container's root
        // user are created. Moving the name into the path changes the authentication source
        // to that database, where the user does not exist, and every connection fails with
        // `Authentication failed` — a message that points at credentials rather than at this
        // line. Verified against a live server; see specs/004-local-mongo-compose R4.
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
