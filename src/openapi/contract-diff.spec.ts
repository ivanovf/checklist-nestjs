import { firstDifference } from './contract-diff';

const base = {
  openapi: '3.0.0',
  info: { title: 'Checklist API', version: '1.0' },
  paths: {
    '/api/users': { get: { summary: 'List' }, post: { summary: 'Create' } },
    '/api/items': { get: { summary: 'List' } },
  },
  components: { schemas: { User: { type: 'object' } } },
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * `docs:check` has to tell a contributor *where* the committed contract went stale, not
 * just that it did: with 38 operations, "files differ" sends them diffing by hand.
 */
describe('firstDifference', () => {
  it('reports nothing when the documents are equal', () => {
    expect(firstDifference(base, clone(base))).toBeUndefined();
  });

  it('names the operation whose documentation changed', () => {
    const changed = clone(base);
    changed.paths['/api/users'].post.summary = 'Add';

    expect(firstDifference(base, changed)).toBe('post /api/users');
  });

  it('names an operation present on only one side', () => {
    const changed = clone(base);
    delete (changed.paths as Record<string, unknown>)['/api/items'];

    expect(firstDifference(base, changed)).toBe('get /api/items');
  });

  it('names the schema that changed', () => {
    const changed = clone(base);
    changed.components.schemas.User = { type: 'string' };

    expect(firstDifference(base, changed)).toBe('schema User');
  });

  it('falls back to the top-level section when neither paths nor schemas differ', () => {
    const changed = clone(base);
    changed.info.version = '2.0';

    expect(firstDifference(base, changed)).toBe('info');
  });
});
