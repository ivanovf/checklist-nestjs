import { envValidationSchema, parseCorsOrigins } from './env.validation';

/**
 * CORS_ORIGINS is the mechanism feature 001's configuration contract specified and left
 * unbuilt. The cases below are the ones that actually bite on a hosting platform: a value
 * that is absent, present-but-empty, or pasted with the quotes a local env file would have
 * stripped but a dashboard does not.
 */
describe('envValidationSchema — CORS_ORIGINS', () => {
  const base = {
    NODE_ENV: 'production',
    DB_DRIVE: 'mongodb+srv',
    DB_HOST: 'cluster.example.net',
    DB_NAME: 'checklist',
    DB_USER: 'svc',
    DB_PASS: 'secret',
  };

  const validate = (overrides: Record<string, unknown>) =>
    envValidationSchema.validate(
      { ...base, ...overrides },
      { abortEarly: false },
    );

  it('requires the value when deployed, naming it in the message', () => {
    const { error } = validate({});

    expect(error).toBeDefined();
    expect(error?.message).toContain('CORS_ORIGINS');
  });

  it('rejects a present-but-empty value when deployed', () => {
    const { error } = validate({ CORS_ORIGINS: '' });

    expect(error).toBeDefined();
    expect(error?.message).toContain('CORS_ORIGINS');
  });

  it('rejects a value wrapped in quotes, which a dashboard paste produces', () => {
    const { error } = validate({ CORS_ORIGINS: "'https://app.example'" });

    expect(error).toBeDefined();
    expect(error?.message).toContain('CORS_ORIGINS');
  });

  it('rejects an entry that is not an absolute origin', () => {
    const { error } = validate({ CORS_ORIGINS: 'app.example' });

    expect(error).toBeDefined();
  });

  it('accepts the literal "none" for a service with no browser client', () => {
    // A native mobile client is not governed by CORS at all, so "no origins permitted" is
    // the honest configuration rather than a placeholder origin nothing will ever use.
    expect(validate({ CORS_ORIGINS: 'none' }).error).toBeUndefined();
  });

  it('still requires the value to be set deliberately when deployed', () => {
    // "none" is an explicit choice; an absent value remains a configuration error, so a
    // forgotten variable is still caught rather than silently defaulting to deny-all.
    expect(validate({}).error).toBeDefined();
  });

  it('accepts a single absolute origin', () => {
    expect(
      validate({ CORS_ORIGINS: 'https://app.example' }).error,
    ).toBeUndefined();
  });

  it('accepts several comma-separated origins', () => {
    expect(
      validate({ CORS_ORIGINS: 'https://a.example,https://b.example' }).error,
    ).toBeUndefined();
  });

  it('treats the value as optional outside a deployed environment', () => {
    const { error } = envValidationSchema.validate(
      { ...base, NODE_ENV: 'local' },
      { abortEarly: false },
    );

    expect(error).toBeUndefined();
  });
});

describe('parseCorsOrigins', () => {
  it('returns an empty list when the value is absent', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });

  it('returns an empty list for "none"', () => {
    expect(parseCorsOrigins('none')).toEqual([]);
    expect(parseCorsOrigins(' none ')).toEqual([]);
  });

  it('parses a single origin', () => {
    expect(parseCorsOrigins('https://a.example')).toEqual([
      'https://a.example',
    ]);
  });

  it('trims whitespace after separators', () => {
    expect(parseCorsOrigins('https://a.example, https://b.example')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('drops empty entries so a trailing separator is harmless', () => {
    expect(parseCorsOrigins('https://a.example,')).toEqual([
      'https://a.example',
    ]);
  });

  it('preserves the declared order', () => {
    expect(parseCorsOrigins('https://b.example,https://a.example')).toEqual([
      'https://b.example',
      'https://a.example',
    ]);
  });
});
