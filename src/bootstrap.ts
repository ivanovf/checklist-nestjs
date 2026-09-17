import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { parseCorsOrigins } from './config/env.validation';

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

  app.useGlobalPipes(
    new ValidationPipe({
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Checklist API')
    .setDescription('Documentación Checklist API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

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
  // origin. Deployed environments always have a list, because startup validation requires
  // the value there; locally an absent value keeps development origins working without
  // configuration.
  const origins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));
  app.enableCors(origins.length > 0 ? { origin: origins } : {});
}
