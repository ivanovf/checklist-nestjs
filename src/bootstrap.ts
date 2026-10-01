import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { OwnIdInterceptor } from './common/interceptors/own-id.interceptor';
import { RequestValidationPipe } from './common/pipes/request-validation.pipe';
import { parseCorsOrigins } from './config/env.validation';
import { buildOpenApiDocument } from './openapi/openapi-document';

/**
 * The request rules every route is held to (specs/010-fix-unknown-fields).
 *
 * Bodies and queries refuse undeclared fields, and pass on exactly what was sent (research
 * R3). A change may repeat its record's own `_id` (research R4). Exported so the test app
 * applies the very same rules rather than a copy of them.
 */
export function applyRequestRules(app: INestApplication): void {
  app.useGlobalPipes(new RequestValidationPipe());
  app.useGlobalInterceptors(new OwnIdInterceptor());
}

/**
 * Shared application wiring.
 *
 * The app is started two different ways — `main.ts` listens on a port for local development
 * and container deployments, while `serverless.ts` hands the underlying Express instance to
 * a Vercel function. Both paths have to apply the same pipes, prefix, transport security and
 * CORS setup, so the configuration lives here rather than being duplicated (and drifting) in
 * each entry point.
 *
 * Transport concerns in particular MUST stay here. A control applied in only one entry point
 * diverges silently between local and deployed behaviour, which is the failure this shared
 * function exists to prevent.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // A preview deployment is a deployed environment: the platform reports the same value for
  // both, and the spec requires they behave identically so that what is verified on a
  // preview is exactly what production does (FR-002b).
  const isDeployed = config.get<string>('NODE_ENV') === 'production';

  // Registered first so every later response, including error responses, carries the
  // protective headers.
  app.use(helmet());

  applyRequestRules(app);

  app.setGlobalPrefix('api');

  const document = buildOpenApiDocument(app);

  if (!isDeployed) {
    // The document is always generated — every endpoint keeps its metadata, so the API
    // contract stays accurate — but the browsable page is not served from a deployed
    // environment, where it would publish a complete map of the endpoint surface.
    //
    // Registered after `helmet()` so it overrides that strict CSP for this path only:
    // Swagger UI ships an inline initializer script, which `script-src 'self'` blocks, and
    // the page would render blank. Setting `contentSecurityPolicy: false` here would not
    // work — it simply would not set the header, leaving the strict one already in place.
    // The relaxation is unreachable once deployed, because this whole branch is skipped.
    app.use('/docs', (_req, res, next) => {
      res.removeHeader('Content-Security-Policy');
      next();
    });
    SwaggerModule.setup('docs', app, document);
  }

  // An explicit allowlist rather than the previous bare `enableCors()`, which granted every
  // origin. Three deliberate states, because "no origins configured" and "no origins
  // permitted" are different intentions and only one of them is safe once deployed:
  //
  //   absent  — local development only; startup validation requires the value once
  //             deployed, so this branch is unreachable there.
  //   'none'  — no browser origin may call this service. Correct for an API consumed only
  //             by native clients, which CORS does not govern in any case.
  //   a list  — only those origins are granted access.
  const configuredOrigins = config.get<string>('CORS_ORIGINS');
  const origins = parseCorsOrigins(configuredOrigins);

  if (configuredOrigins === undefined) {
    app.enableCors();
  } else if (origins.length === 0) {
    // `origin: false` omits the header entirely, so a browser refuses the response.
    app.enableCors({ origin: false });
  } else {
    app.enableCors({ origin: origins });
  }
}
