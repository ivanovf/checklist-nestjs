import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { buildOpenApiDocument } from '../../openapi/openapi-document';
import { ApiRefusals, REFUSAL_DESCRIPTIONS } from './api-refusals.decorator';

@Controller('probe')
class ProbeController {
  @ApiRefusals(401, 403)
  @Get('admin')
  admin(): string {
    return 'ok';
  }

  @ApiRefusals(400, 401, 404, 429)
  @Get('other')
  other(): string {
    return 'ok';
  }
}

/**
 * Refusals are documented through one decorator so every route describes the same status
 * the same way, with the error body the service really sends.
 */
describe('ApiRefusals', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
  });

  afterAll(async () => {
    await app.close();
  });

  const responsesOf = (path: string) =>
    buildOpenApiDocument(app).paths[path].get.responses;

  // Once any response is declared, Swagger stops inventing a default 200, which is why
  // every route must also declare its success response explicitly.
  it('documents exactly the listed statuses', () => {
    expect(Object.keys(responsesOf('/probe/admin')).sort()).toEqual([
      '401',
      '403',
    ]);
  });

  it('gives each status its fixed description and the shared error body', () => {
    const responses = responsesOf('/probe/other');

    for (const status of [400, 401, 404, 429] as const) {
      expect(responses[status]).toEqual({
        description: REFUSAL_DESCRIPTIONS[status],
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponseDto' },
          },
        },
      });
    }
  });

  it('registers the error body schema in the document', () => {
    const schema = buildOpenApiDocument(app).components.schemas
      .ErrorResponseDto as { properties: Record<string, unknown> };

    expect(Object.keys(schema.properties).sort()).toEqual([
      'error',
      'message',
      'statusCode',
    ]);
  });
});
