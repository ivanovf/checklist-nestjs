import { Controller, Get, INestApplication } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { buildOpenApiDocument } from './openapi-document';

@ApiTags('Probe')
@Controller('probe')
class ProbeController {
  @Get()
  read(): string {
    return 'ok';
  }
}

/**
 * The served `/docs` page and the exported `openapi.json` must describe the API
 * identically, so both are produced by this one builder. These assertions pin the parts of
 * the document that do not come from route metadata.
 */
describe('buildOpenApiDocument', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    // The prefix is the caller's responsibility, exactly as in bootstrap and the exporter.
    app.setGlobalPrefix('api');
  });

  afterEach(async () => {
    await app.close();
  });

  it('describes the API with its fixed title, description and version', () => {
    const doc = buildOpenApiDocument(app);

    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info).toMatchObject({
      title: 'Checklist API',
      description: 'Documentación Checklist API',
      version: '1.0',
    });
  });

  it('declares the bearer-token scheme that signed-in routes reference', () => {
    const doc = buildOpenApiDocument(app);

    expect(doc.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('lists routes under the global prefix the caller applied', () => {
    const doc = buildOpenApiDocument(app);

    expect(doc.paths['/api/probe']?.get?.tags).toEqual(['Probe']);
  });
});
