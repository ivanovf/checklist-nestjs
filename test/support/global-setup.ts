import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Starts one in-memory MongoDB for the whole e2e run and publishes its URI plus the
 * configuration every suite needs. Values are set here rather than read from a developer's
 * `.env` so the suite cannot accidentally run against a real database.
 */
module.exports = async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryServer.create();

  (global as Record<string, unknown>).__MONGOD__ = mongod;

  process.env.NODE_ENV = 'local';
  process.env.MONGO_URI = mongod.getUri();

  // Deterministic test configuration. 32+ characters, as startup validation requires.
  process.env.SECRET = 'test-secret-value-thirty-two-chars-min';
  process.env.TANK_API_KEY = 'test-tank-api-key-thirty-two-chars-min';
  process.env.CORS_ORIGINS = 'https://app.test.local';
  process.env.LOGIN_MAX_ATTEMPTS = '5';
  process.env.LOGIN_WINDOW_MINUTES = '15';
  process.env.LOGIN_LOCKOUT_MINUTES = '15';
};
