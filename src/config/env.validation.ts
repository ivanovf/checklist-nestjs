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
  // The literal `none` is accepted and means "no browser origin may call this service".
  // That is the correct posture for an API consumed only by native clients: CORS is a
  // browser mechanism, so a native app is unaffected either way, and `none` states the
  // intent explicitly instead of forcing a placeholder origin that nothing will ever use.
  // It still has to be set deliberately, so a forgotten configuration is caught.
  //
  // The pattern is what rejects a value pasted with its quotes still attached: a hosting
  // dashboard takes values literally, unlike a local env file, and `'https://x'` is not a
  // valid origin. It also requires an explicit scheme, so a bare host fails rather than
  // being silently accepted and never matching anything.
  CORS_ORIGINS: Joi.string()
    .pattern(/^(none|https?:\/\/[^\s,'"]+(\s*,\s*https?:\/\/[^\s,'"]+)*,?)$/)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .messages({
      // Distinct messages on purpose. "Not set at all" and "set but blank" are different
      // mistakes with different fixes — on a hosting platform the second usually means the
      // variable exists but was saved empty, or was scoped to a different environment than
      // the one being deployed. One shared message sends the reader looking in the wrong
      // place.
      'any.required':
        'CORS_ORIGINS is not set, and is required when NODE_ENV=production. Set it to "none" if no browser client calls this API, or to a comma-separated list of origins. Check it is enabled for the environment being deployed.',
      'string.empty':
        'CORS_ORIGINS is set but empty. Set it to "none" if no browser client calls this API, or to a comma-separated list of origins.',
      'string.pattern.base':
        'CORS_ORIGINS must be "none" (no browser client) or a comma-separated list of absolute origins, unquoted (e.g. https://app.example,https://admin.example)',
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
  if (!value || value.trim() === 'none') {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
