import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { firstDifference } from './contract-diff';

/**
 * Writes the committed API contract, `openapi.json`, from the compiled application.
 *
 * Run as `node dist/src/openapi/export.js` (via `pnpm docs:export`), never through ts-node:
 * the Swagger CLI plugin that fills in DTO properties only runs in `nest build`, so any
 * other compilation produces a thinner document than the one the service serves.
 *
 * No database, secret or listener is involved. The application is created in preview mode,
 * which resolves the module graph without instantiating providers, so the Mongo connection
 * is never opened. Startup validation still runs when the root module is loaded, so it is
 * satisfied with fixed placeholders. None of these values can reach the document, which is
 * built from route metadata alone.
 */
const PLACEHOLDER_ENV: Record<string, string> = {
  NODE_ENV: 'local',
  DB_DRIVE: 'mongodb',
  DB_HOST: 'unreachable.invalid',
  DB_NAME: 'placeholder',
  DB_USER: 'placeholder',
  DB_PASS: 'placeholder',
  SECRET: 'placeholder',
  TANK_API_KEY: 'placeholder',
};

// This file compiles to dist/src/openapi/, three levels below the repository root.
const REPO_ROOT = join(__dirname, '..', '..', '..');
const CONTRACT_FILE = join(REPO_ROOT, 'openapi.json');

async function generateContract(): Promise<string> {
  Object.assign(process.env, PLACEHOLDER_ENV);
  delete process.env.CORS_ORIGINS;

  // Loaded only now: importing the root module runs the environment validation, which has
  // to see the placeholders above.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { buildOpenApiDocument } = await import('./openapi-document');

  const app = await NestFactory.create(AppModule, {
    preview: true,
    abortOnError: false,
    logger: false,
  });
  app.setGlobalPrefix('api');

  // Two-space indent and a trailing newline: stable, reviewable diffs on every OS.
  return `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;
}

/**
 * `--check`: compare against the committed file and never write it. CI runs this straight
 * after `pnpm build`, so it verifies the exact artifact the Build gate produced.
 */
function check(generated: string): number {
  if (!existsSync(CONTRACT_FILE)) {
    console.error(
      'openapi.json is missing.\nRun `pnpm docs:export` and commit the result.',
    );
    return 1;
  }

  const committed = readFileSync(CONTRACT_FILE, 'utf8');
  if (committed === generated) {
    console.log('openapi.json is up to date.');
    return 0;
  }

  // Equal documents that differ as bytes can only differ in formatting, most often line
  // endings rewritten by a checkout; .gitattributes should prevent it.
  const where =
    firstDifference(JSON.parse(committed), JSON.parse(generated)) ??
    'formatting only (line endings or whitespace)';
  console.error(
    [
      'openapi.json is out of date with the code.',
      'Run `pnpm docs:export` and commit the result.',
      `First difference: ${where}`,
    ].join('\n'),
  );
  return 1;
}

async function main(): Promise<number> {
  if (!existsSync(join(REPO_ROOT, 'package.json'))) {
    throw new Error(
      `Expected the repository root at ${REPO_ROOT}; run this from dist/src/openapi/.`,
    );
  }

  const generated = await generateContract();

  if (process.argv.includes('--check')) {
    return check(generated);
  }

  writeFileSync(CONTRACT_FILE, generated);
  console.log(`Wrote ${CONTRACT_FILE}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `Generating the API contract failed: ${(error as Error).message}`,
    );
    process.exit(1);
  },
);
