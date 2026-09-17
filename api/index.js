/**
 * Vercel serverless function entry.
 *
 * Deliberately plain CommonJS rather than TypeScript: Vercel's Node builder transpiles TS with
 * esbuild, which does not emit `emitDecoratorMetadata`, and Nest's dependency injection cannot
 * resolve constructor types without that metadata. So the application is compiled ahead of time
 * by `nest build` (real tsc, via the project's buildCommand) and this shim only forwards to the
 * compiled handler.
 *
 * The `dist/src/...` path comes from tsc rooting the output at the project directory, because
 * `database.module.ts` and `lambda.ts` sit alongside `src/`.
 */
module.exports = require('../dist/src/serverless').default;
