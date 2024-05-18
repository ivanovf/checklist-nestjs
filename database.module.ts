import { Global, Module } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { MongooseModule } from '@nestjs/mongoose';
@Global()
@Module({
  providers: [
    {
      provide: 'MONGO',
      useFactory: async () => {
        const uri = `mongodb+srv://${process.env.DB_USER}:${encodeURIComponent(
          process.env.DB_PASS,
        )}@${process.env.DB_HOST}:${
          process.env.DB_PORT
        }/?authMechanism=DEFAULT`;
        const client = new MongoClient(uri);

        await client.connect();
        const database = client.db('checklist');

        if (database) {
          console.log('A mongo connection was stablished.');
        }
        return database;
      },
    },
  ],
  exports: ['MONGO', MongooseModule],
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => {
        return {
          uri: `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`,
          user: process.env.DB_USER,
          pass: process.env.DB_PASS,
          dbName: process.env.DB_NAME,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
