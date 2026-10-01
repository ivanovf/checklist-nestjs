import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

import { Role } from '../auth/models/role.model';
import {
  paramPipes,
  queryPipes,
  routeOf,
} from '../common/testing/route-metadata';
import { PaginationQueryDto } from '../filter_dto/pagination-query.dto';

import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

/**
 * Routing, access declarations and input binding for every route (constitution Principle
 * I). Access *enforcement* is proven end to end by the authorization matrix suite; here,
 * the device route declares no role: any signed-in caller reaches it, and the device key is checked by the service (D10).
 *
 * ConfigService is stubbed: the real one needs a Mongoose model, which is not what this is about.
 */
describe('ConfigController', () => {
  let controller: ConfigController;
  let service: Record<string, jest.Mock>;

  const id = '507f1f77bcf86cd799439011';
  const dto = { field: 'value' } as never;
  const result = { marker: 'service result' };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockReturnValue(result),
      findAll: jest.fn().mockReturnValue(result),
      update: jest.fn().mockReturnValue(result),
      updateAnalogLecure: jest.fn().mockReturnValue(result),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigController],
      providers: [{ provide: ConfigService, useValue: service }],
    }).compile();

    controller = module.get<ConfigController>(ConfigController);
  });

  describe('routes', () => {
    it.each([
      ['create', 'POST', '/config', [Role.ADMIN]],
      ['findAll', 'GET', '/config', [Role.ADMIN, Role.AUTHENTICATED]],
      ['update', 'PUT', '/config/:id', [Role.ADMIN]],
      ['updateAnalogLecure', 'PATCH', '/config/:id', undefined],
    ] as const)('%s is %s %s, open to %j', (handler, method, path, roles) => {
      expect(routeOf(ConfigController, handler)).toEqual({
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
      expect(controller.findAll({ limit: 5, offset: 10 })).toBe(result);
      expect(service.findAll).toHaveBeenCalledWith(5, 10);
    });
    it('update forwards its input and returns the service result', () => {
      expect(controller.update(id, dto)).toBe(result);
      expect(service.update).toHaveBeenCalledWith(id, dto);
    });
    it('updateAnalogLecure forwards its input and returns the service result', () => {
      expect(controller.updateAnalogLecure(id, dto)).toBe(result);
      expect(service.updateAnalogLecure).toHaveBeenCalledWith(id, dto);
    });
  });

  /**
   * A malformed id is refused at the edge, after the guards, so it never reaches the
   * database (D7, specs/008-fix-unknown-id-404).
   */
  describe('id binding', () => {
    it.each(['update', 'updateAnalogLecure'] as const)(
      '%s checks its id with ParseObjectIdPipe',
      (handler) => {
        expect(paramPipes(ConfigController, handler, 'id')).toContain(
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
      const [pipe] = queryPipes(ConfigController, 'findAll');
      expect(pipe).toBeInstanceOf(ValidationPipe);

      return (pipe as ValidationPipe).transform(raw, {
        type: 'query',
        metatype: PaginationQueryDto,
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
  });
});
