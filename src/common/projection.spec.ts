import { Schema, Types, model } from 'mongoose';

import { FieldList, project } from './projection';

interface Shape {
  _id: string;
  label: string;
  note?: string;
  parent: string | null;
  createdAt: Date;
}

const FIELDS: FieldList<Shape> = {
  _id: true,
  label: true,
  note: true,
  parent: true,
  createdAt: true,
};

/**
 * The allowlist every record answer is built with (D3, specs/009-fix-unprojected-records).
 * Its output must be byte-identical to what the API sent before, apart from the fields it
 * leaves out.
 */
describe('project', () => {
  const id = new Types.ObjectId();
  const createdAt = new Date('2026-01-01T00:00:00.000Z');

  it('copies only the listed fields', () => {
    const result = project<Shape>(
      {
        _id: id,
        label: 'l',
        parent: 'p',
        createdAt,
        __v: 3,
        password: '$2b$10$hash',
        legacy: 'x',
      },
      FIELDS,
    );

    expect(Object.keys(result).sort()).toEqual([
      '_id',
      'createdAt',
      'label',
      'parent',
    ]);
  });

  it('leaves out a listed field the record does not hold', () => {
    const result = project<Shape>(
      { _id: id, label: 'l', parent: 'p', createdAt },
      FIELDS,
    );

    expect(Object.keys(result)).not.toContain('note');
  });

  it('keeps null as null', () => {
    const result = project<Shape>(
      { _id: id, label: 'l', parent: null, createdAt },
      FIELDS,
    );

    expect(result.parent).toBeNull();
  });

  it('answers the id as its hex string', () => {
    const result = project<Shape>(
      { _id: id, label: 'l', parent: 'p', createdAt },
      FIELDS,
    );

    expect(result._id).toBe(id.toHexString());
  });

  it('keeps dates as dates', () => {
    const result = project<Shape>(
      { _id: id, label: 'l', parent: 'p', createdAt },
      FIELDS,
    );

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reads a hydrated document through its getters', () => {
    const Doc = model(
      'ProjectionProbe',
      new Schema(
        { label: String, parent: String, secret: String },
        { timestamps: true },
      ),
    );
    const doc = new Doc({ label: 'l', parent: 'p', secret: 's' });

    const result = project<Shape>(doc, FIELDS);

    expect(result).toEqual({
      _id: String(doc._id),
      label: 'l',
      parent: 'p',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  // FR-006: the list a projection uses can't drift from its DTO. If the type ever stops
  // enforcing that, these `@ts-expect-error` lines stop erroring and compilation fails.
  it('accepts only a list naming exactly the shape’s fields', () => {
    const exact: FieldList<{ a: string; b?: number }> = { a: true, b: true };

    // @ts-expect-error: `b` is missing, optional or not
    const missing: FieldList<{ a: string; b?: number }> = { a: true };

    const extra: FieldList<{ a: string }> = {
      a: true,
      // @ts-expect-error: `c` is not a field of the shape
      c: true,
    };

    expect([exact, missing, extra]).toHaveLength(3);
  });
});
