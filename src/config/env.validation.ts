import * as Joi from 'joi';

/**
 * Startup validation for environment configuration.
 *
 * The service must fail fast and name the offending value rather than starting in a degraded
 * state and failing opaquely at request time (FR-008). `abortEarly: false` is set on the
 * ConfigModule so every failing value is reported in one pass, which lets a misconfigured
 * deployment be fixed in a single cycle.
 *
 * Values owned by later user stories (SECRET strength, TANK_API_KEY, LOGIN_*) are added by
 * those stories. CORS_ORIGINS is implemented here by feature 002. See specs/001-api-security-hardening/contracts/configuration.md
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

  // Browser origin allowlist. Required once deployed, because a deployed service with no
  // allowlist grants every origin — the state Constitution III prohibits. Left optional
  // locally so development needs no configuration.
  //
  // The pattern is what rejects a value pasted with its quotes still attached: a hosting
  // dashboard takes values literally, unlike a local env file, and `'https://x'` is not a
  // valid origin. It also requires an explicit scheme, so a bare host fails rather than
  // being silently accepted and never matching anything.
  CORS_ORIGINS: Joi.string()
    .pattern(/^https?:\/\/[^\s,'"]+(\s*,\s*https?:\/\/[^\s,'"]+)*,?$/)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .messages({
      'any.required': 'CORS_ORIGINS is required when NODE_ENV=production',
      'string.empty': 'CORS_ORIGINS is required when NODE_ENV=production',
      'string.pattern.base':
        'CORS_ORIGINS must be a comma-separated list of absolute origins, unquoted (e.g. https://app.example,https://admin.example)',
    }),
}).unknown(true);

/**
 * Splits the validated CORS_ORIGINS value into the list the transport layer needs.
 *
 * Empty entries are dropped rather than passed through, so a trailing separator is harmless;
 * an empty string in an allowlist would otherwise be an origin that can never match and is
 * easy to misread as "allow everything".
 */
export function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
