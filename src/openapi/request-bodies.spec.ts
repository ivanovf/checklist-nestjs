import type {
  OpenAPIObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { closeRequestBodies, OWN_ID_DESCRIPTION } from './request-bodies';

/**
 * The contract states the request rules (specs/010-fix-unknown-fields, research R7). Every
 * validated request body refuses undeclared fields, so its schema is closed. A change may
 * repeat its record's own `_id`, so change bodies declare it. Sign-in isn't body-validated,
 * so its schema stays open.
 */
describe('closeRequestBodies', () => {
  const body = (name: string) => ({
    content: {
      'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
    },
  });
  const object = (properties: SchemaObject['properties']): SchemaObject => ({
    type: 'object',
    properties,
  });

  const fixture = (): OpenAPIObject => ({
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {
      '/x': { post: { requestBody: body('CreateX'), responses: {} } },
      '/x/{id}': {
        put: {
          requestBody: body('UpdateX'),
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/XResponseDto' },
                },
              },
            },
          },
        },
      },
      '/login': {
        post: { requestBody: body('LoginRequestDto'), responses: {} },
      },
    },
    components: {
      schemas: {
        CreateX: object({
          name: { type: 'string' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/Nested' },
          },
        }),
        Nested: object({ label: { type: 'string' } }),
        UpdateX: object({ name: { type: 'string' } }),
        LoginRequestDto: object({ email: { type: 'string' } }),
        XResponseDto: object({ _id: { type: 'string' } }),
      },
    },
  });

  const schemas = (doc: OpenAPIObject) =>
    doc.components?.schemas as Record<string, SchemaObject>;

  it('closes every validated request body, nested schemas included', () => {
    const closed = schemas(closeRequestBodies(fixture()));

    expect(closed.CreateX.additionalProperties).toBe(false);
    expect(closed.Nested.additionalProperties).toBe(false);
    expect(closed.UpdateX.additionalProperties).toBe(false);
  });

  it('leaves sign-in and response schemas open', () => {
    const closed = schemas(closeRequestBodies(fixture()));

    expect(closed.LoginRequestDto).not.toHaveProperty('additionalProperties');
    expect(closed.XResponseDto).not.toHaveProperty('additionalProperties');
  });

  it("declares the record's own _id on change bodies only", () => {
    const closed = schemas(closeRequestBodies(fixture()));

    expect(closed.UpdateX.properties?._id).toStrictEqual({
      type: 'string',
      description: OWN_ID_DESCRIPTION,
    });
    expect(closed.UpdateX.required ?? []).not.toContain('_id');
    expect(closed.CreateX.properties).not.toHaveProperty('_id');
  });

  it('does not change the document it is given', () => {
    const original = fixture();

    closeRequestBodies(original);

    expect(original).toStrictEqual(fixture());
  });
});
