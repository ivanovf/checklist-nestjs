import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException, Type } from '@nestjs/common';

import { RequestValidationPipe } from './request-validation.pipe';
import { CreateItemDto } from '../../items/dto/create-item.dto';
import { UpdateItemDto } from '../../items/dto/update-item.dto';
import { UpdateReservationDto } from '../../reservations/dto/update-reservation.dto';
import { UpdateUserDto } from '../../users/dto/update-user.dto';
import { FilterReservationsDto } from '../../filter_dto/filter-reservation.dto';
import { FilterActivityDto } from '../../activity/dto/filter-activity.dto';
import { PaginationQueryDto } from '../../filter_dto/pagination-query.dto';

/**
 * The global request rules (specs/010-fix-unknown-fields, research R2–R3).
 *
 * Bodies and queries are checked strictly: a property the DTO doesn't declare is refused, at
 * every depth. When they pass, the handler receives the value exactly as it was sent, because
 * the rebuilt instance would differ from today's (R2): partial item changes would reset
 * `checked` and `comments`, and `"false"` would become `true`.
 *
 * Nested objects are only checked when the DTO marks them with `@ValidateNested` and `@Type`.
 * A nested field without both would let its contents through unchecked.
 */
describe('RequestValidationPipe', () => {
  const pipe = new RequestValidationPipe();
  const body = (metatype: Type<unknown>): ArgumentMetadata => ({
    type: 'body',
    metatype,
    data: '',
  });
  const query = (metatype: Type<unknown>): ArgumentMetadata => ({
    type: 'query',
    metatype,
    data: '',
  });

  const item = { label: 'l', status: true, description: 'd', category: 'c' };

  /** The refusal's messages, or a failure if the value was accepted. */
  const refusal = async (value: unknown, metadata: ArgumentMetadata) => {
    try {
      await pipe.transform(value, metadata);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      return response.message;
    }
    throw new Error('expected the value to be refused');
  };

  describe('bodies', () => {
    it('refuses an undeclared field, naming it', async () => {
      expect(
        await refusal({ ...item, notAField: true }, body(CreateItemDto)),
      ).toContain('property notAField should not exist');
    });

    it('refuses an undeclared field inside a reservation item', async () => {
      expect(
        await refusal(
          { items: [{ ...item, y: 1 }] },
          body(UpdateReservationDto),
        ),
      ).toContain('items.0.property y should not exist');
    });

    it('refuses an undeclared field on an intersection type', async () => {
      expect(await refusal({ x: 1 }, body(UpdateUserDto))).toContain(
        'property x should not exist',
      );
    });

    it.each(['_id', 'createdAt', 'updatedAt', '__v'])(
      'refuses the API-owned field %s',
      async (field) => {
        expect(
          await refusal({ ...item, [field]: 'x' }, body(CreateItemDto)),
        ).toContain(`property ${field} should not exist`);
      },
    );

    it('passes a partial change on as sent, without the DTO defaults', async () => {
      await expect(
        pipe.transform({ label: 'x' }, body(UpdateItemDto)),
      ).resolves.toStrictEqual({ label: 'x' });
    });

    it('passes values on unconverted', async () => {
      const sent = { ...item, status: 'false' };

      const received = await pipe.transform(sent, body(CreateItemDto));

      expect(received).toStrictEqual(sent);
      expect((received as typeof sent).status).toBe('false');
    });

    it('lists an undeclared field together with the other errors', async () => {
      // Implicit conversion would turn a wrongly typed scalar into a valid one, so the
      // second error is a missing required field instead.
      const messages = await refusal(
        { label: 'l', status: true, description: 'd', notAField: true },
        body(CreateItemDto),
      );

      expect(messages).toContain('property notAField should not exist');
      expect(messages).toContain('category must be a string');
    });
  });

  describe('queries', () => {
    it('refuses an undeclared parameter, naming it', async () => {
      expect(
        await refusal({ limit: '5', foo: '1' }, query(FilterReservationsDto)),
      ).toContain('property foo should not exist');
    });

    it('passes declared parameters on as sent', async () => {
      await expect(
        pipe.transform(
          { price: '3', status: 'TODO' },
          query(FilterActivityDto),
        ),
      ).resolves.toStrictEqual({ price: '3', status: 'TODO' });
    });

    it('leaves defaults to the route pipe', async () => {
      await expect(
        pipe.transform({}, query(PaginationQueryDto)),
      ).resolves.toStrictEqual({});
    });
  });

  it('leaves path parameters to their own pipes', async () => {
    await expect(
      pipe.transform('abc', { type: 'param', metatype: String, data: 'id' }),
    ).resolves.toBe('abc');
  });
});
