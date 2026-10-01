import { ActivitySchema } from './activity.entity';

/**
 * Principle V: every field the activity list filters or sorts on is indexed
 * (specs/011-fix-unbounded-lists, research R5).
 */
describe('ActivitySchema indexes', () => {
  const keys = () => ActivitySchema.indexes().map(([fields]) => fields);

  it.each([
    [{ date: -1, _id: -1 }],
    [{ type: 1 }],
    [{ status: 1 }],
    [{ price: 1 }],
  ])('indexes %j', (fields) => {
    expect(keys()).toContainEqual(fields);
  });
});
