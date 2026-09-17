import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Shared application wiring.
 *
 * The app is started two different ways — `main.ts` listens on a port for local development and
 * container deployments, while `serverless.ts` hands the underlying Express instance to a
 * Vercel function. Both paths have to apply the same pipes, prefix and CORS setup, so the
 * configuration lives here rather than being duplicated (and drifting) in each entry point.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Checklist API')
    .setDescription('Documentación Checklist API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // URL API
  SwaggerModule.setup('docs', app, document);

  app.enableCors();
}
