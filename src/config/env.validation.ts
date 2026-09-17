import * as Joi from 'joi';

/**
 * Startup validation for environment configuration.
 *
 * The service must fail fast and name the offending value rather than starting in a degraded
 * state and failing opaquely at request time (FR-008). `abortEarly: false` is set on the
 * ConfigModule so every failing value is reported in one pass, which lets a misconfigured
 * deployment be fixed in a single cycle.
 *
 * Values owned by later user stories (SECRET strength, TANK_API_KEY, CORS_ORIGINS, LOGIN_*)
 * are added by those stories. See specs/001-api-security-hardening/contracts/configuration.md
 * for the authoritative table.
 */

// `.env` values arrive as strings, so an unset value and an empty value are both `''`.
// Joi treats `''` as invalid for a required string by default, which is exactly what the
// spec's edge case requires: present-but-empty must fail, not be accepted.
const requiredString = Joi.string().required();

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('local', 'production').required(),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  DB_DRIVE: requiredString,
  DB_HOST: requiredString,
  DB_PORT: Joi.number().integer().min(1).max(65535).optional().allow(''),
  DB_NAME: requiredString,
  DB_USER: requiredString,
  DB_PASS: requiredString,
  DB_ARGS: Joi.string().optional().allow(''),
}).unknown(true);
