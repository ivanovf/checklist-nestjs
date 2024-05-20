import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => {
        const dbUser = process.env.DB_USER;
        const dbPass = encodeURIComponent(process.env.DB_PASS);
        const dbHost = process.env.DB_HOST;
        const dbPort = process.env.DB_PORT ? `:${process.env.DB_PORT}` : '';
        const dbDrive = process.env.DB_DRIVE;
        const dbName = process.env.DB_NAME;
        const args = process.env.DB_ARGS ? `?${process.env.DB_ARGS}`: '';

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
