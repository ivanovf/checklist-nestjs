import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

import { Role } from '../auth/models/role.model';
import {
  paramPipes,
  queryPipes,
  routeOf,
} from '../common/testing/route-metadata';
import { FilterActivityDto } from './dto/filter-activity.dto';

import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/**
 * Routing, access declarations and input binding for every route (constitution Principle
 * I). Access *enforcement* is proven end to end by the authorization matrix suite; here,
 * delete answers a fixed message rather than the service result.
 *
 * ActivityService is stubbed: the real one needs a Mongoose model, which is not what this is about.
 */
describe('ActivityController', () => {
  let controller: ActivityController;
  let service: Record<string, jest.Mock>;

  const id = '507f1f77bcf86cd799439011';
  const dto = { field: 'value' } as never;
  const result = { marker: 'service result' };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockReturnValue(result),
      findAll: jest.fn().mockReturnValue(result),
      findOne: jest.fn().mockReturnValue(result),
      remove: jest.fn().mockReturnValue(result),
      update: jest.fn().mockReturnValue(result),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityController],
      providers: [{ provide: ActivityService, useValue: service }],
    }).compile();

    controller = module.get<ActivityController>(ActivityController);
  });

  describe('routes', () => {
    it.each([
      ['create', 'POST', '/activity', [Role.ADMIN]],
      ['findAll', 'GET', '/activity', [Role.ADMIN, Role.AUTHENTICATED]],
      ['findOne', 'GET', '/activity/:id', [Role.ADMIN, Role.AUTHENTICATED]],
      ['update', 'PUT', '/activity/:id', [Role.ADMIN, Role.AUTHENTICATED]],
      ['remove', 'DELETE', '/activity/:id', [Role.ADMIN]],
    ] as const)('%s is %s %s, open to %j', (handler, method, path, roles) => {
      expect(routeOf(ActivityController, handler)).toEqual({
        method,
        path,
        roles,
        isPublic: false,
      });
    });
  });

  describe('binding', () => {
    it('create forwards its input and returns the service result', () => {
      expect(controller.create(dto)).toBe(result);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
    it('findAll forwards its input and returns the service result', () => {
      expect(controller.findAll(dto)).toBe(result);
      expect(service.findAll).toHaveBeenCalledWith(dto);
    });
    it('findOne forwards its input and returns the service result', () => {
      expect(controller.findOne(id)).toBe(result);
      expect(service.findOne).toHaveBeenCalledWith(id);
    });
    it('update forwards its input and returns the service result', () => {
      expect(controller.update(id, dto)).toBe(result);
      expect(service.update).toHaveBeenCalledWith(id, dto);
    });
    it('remove waits for the service, then answers a fixed message', async () => {
      await expect(controller.remove(id)).resolves.toEqual({
        message: 'Activity deleted successfully',
      });
      expect(service.remove).toHaveBeenCalledWith(id);
    });
  });

  /**
   * A malformed id is refused at the edge, after the guards, so it never reaches the
   * database (D7, specs/008-fix-unknown-id-404).
   */
  describe('id binding', () => {
    it.each(['findOne', 'update', 'remove'] as const)(
      '%s checks its id with ParseObjectIdPipe',
      (handler) => {
        expect(paramPipes(ActivityController, handler, 'id')).toContain(
          ParseObjectIdPipe,
        );
      },
    );
  });

  /**
   * The global pipe validates but hands the handler the raw query, so paging defaults would
   * never reach it. The route pipe converts it (D6, specs/011-fix-unbounded-lists, R3).
   */
  describe('list query', () => {
    const convert = async (raw: object) => {
      const [pipe] = queryPipes(ActivityController, 'findAll');
      expect(pipe).toBeInstanceOf(ValidationPipe);

      return (pipe as ValidationPipe).transform(raw, {
        type: 'query',
        metatype: FilterActivityDto,
      });
    };

    it('applies the default page', async () => {
      await expect(convert({})).resolves.toMatchObject({
        limit: 10,
        offset: 0,
      });
    });

    it('converts the query strings', async () => {
      await expect(
        convert({ limit: '5', offset: '10' }),
      ).resolves.toMatchObject({ limit: 5, offset: 10 });
    });

    it('still converts the price filter', async () => {
      // `price` used to be converted only by the global pipe, on a copy it validated and
      // threw away. Through this pipe it must convert on its own (observed 2026-10-01:
      // `price=1` was refused with 400 until it did).
      await expect(convert({ price: '1' })).resolves.toMatchObject({
        price: 1,
      });
    });
  });
});
