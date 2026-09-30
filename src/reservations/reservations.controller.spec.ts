import { PipeTransform, ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';

import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

import { Role } from '../auth/models/role.model';
import { paramPipes, routeOf } from '../common/testing/route-metadata';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { FilterReservationsDto } from '../filter_dto/filter-reservation.dto';

/**
 * Routing, access declarations and input binding for every route (constitution Principle
 * I). Access *enforcement* is proven end to end by the authorization matrix suite; here,
 * filters arrive as one query object.
 *
 * ReservationsService is stubbed: the real one needs a Mongoose model, which is not what this is about.
 */
describe('ReservationsController', () => {
  let controller: ReservationsController;
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
      controllers: [ReservationsController],
      providers: [{ provide: ReservationsService, useValue: service }],
    }).compile();

    controller = module.get<ReservationsController>(ReservationsController);
  });

  describe('routes', () => {
    it.each([
      ['create', 'POST', '/reservations', [Role.ADMIN]],
      ['findAll', 'GET', '/reservations/all', [Role.ADMIN, Role.AUTHENTICATED]],
      ['findOne', 'GET', '/reservations/:id', [Role.ADMIN, Role.AUTHENTICATED]],
      ['update', 'PUT', '/reservations/:id', [Role.ADMIN, Role.AUTHENTICATED]],
      ['remove', 'DELETE', '/reservations/:id', [Role.ADMIN]],
    ] as const)('%s is %s %s, open to %j', (handler, method, path, roles) => {
      expect(routeOf(ReservationsController, handler)).toEqual({
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
    it('remove forwards its input and returns the service result', () => {
      expect(controller.remove(id)).toBe(result);
      expect(service.remove).toHaveBeenCalledWith(id);
    });
  });

  /**
   * The global pipe validates the query but hands the handler the raw strings, so this route
   * converts its own query (specs/006-fix-reservation-paging, research R2).
   */
  describe('findAll query conversion', () => {
    const queryPipe = (): PipeTransform => {
      const args: Record<string, { pipes: PipeTransform[] }> =
        Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          ReservationsController,
          'findAll',
        );
      const [query] = Object.values(args);

      return query.pipes.find(
        (pipe) => pipe instanceof ValidationPipe,
      ) as PipeTransform;
    };
    const run = (value: object) =>
      queryPipe().transform(value, {
        type: 'query',
        metatype: FilterReservationsDto,
      });

    it('binds a ValidationPipe to the query', () => {
      expect(queryPipe()).toBeInstanceOf(ValidationPipe);
    });

    it('hands the handler a converted query with its defaults', async () => {
      const dto = await run({ sort: 'asc' });

      expect(dto).toBeInstanceOf(FilterReservationsDto);
      expect(dto).toMatchObject({ sort: 'asc', limit: 10, offset: 0 });
    });

    it('drops keys the query does not declare', async () => {
      expect(await run({ foo: 'x' })).not.toHaveProperty('foo');
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
        expect(paramPipes(ReservationsController, handler, 'id')).toContain(
          ParseObjectIdPipe,
        );
      },
    );
  });
});
