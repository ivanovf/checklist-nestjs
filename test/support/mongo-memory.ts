import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * A real MongoDB engine for integration and end-to-end tests.
 *
 * The constitution forbids covering persistence and auth flows with mocks alone, and this
 * feature's throttling design depends on TTL-index behaviour that a mock would not reproduce.
 */
let mongod: MongoMemoryServer | undefined;

export async function startInMemoryMongo(): Promise<string> {
  mongod = await MongoMemoryServer.create();
  return mongod.getUri();
}

export async function stopInMemoryMongo(): Promise<void> {
  await mongod?.stop();
  mongod = undefined;
}

/**
 * Drop-in replacement for DatabaseModule in tests. Import this instead of connecting to a
 * real cluster.
 */
export const inMemoryMongooseModule = () =>
  MongooseModule.forRootAsync({
    useFactory: async () => ({ uri: await startInMemoryMongo() }),
  });
