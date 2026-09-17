import { MongoMemoryServer } from 'mongodb-memory-server';

module.exports = async function globalTeardown(): Promise<void> {
  const mongod = (global as Record<string, unknown>).__MONGOD__ as
    | MongoMemoryServer
    | undefined;

  await mongod?.stop();
};
