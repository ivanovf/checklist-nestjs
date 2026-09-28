import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Builds the OpenAPI document for the application.
 *
 * Two callers need it: `configureApp` serves it at `/docs` locally, and the exporter writes
 * it to the committed `openapi.json`. Both go through this function so the page a developer
 * browses and the file a consumer reads offline cannot describe different APIs.
 *
 * The global prefix is applied by the caller before this runs; paths are read from the
 * application as configured.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Checklist API')
    .setDescription('Documentación Checklist API')
    .setVersion('1.0')
    // Referenced by `@ApiBearerAuth()` on every signed-in route; the token comes from
    // `POST /api/login`.
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config);
}
