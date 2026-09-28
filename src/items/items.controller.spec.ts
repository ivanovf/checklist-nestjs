import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../auth/models/role.model';
import { routeOf } from '../common/testing/route-metadata';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

/**
 * Routing, access declarations and input binding for every route (constitution Principle
 * I). Access *enforcement* is proven end to end by the authorization matrix suite; here,
 * the pagination query arrives as a typed PaginationQueryDto (D4).
 *
 * ItemsService is stubbed: the real one needs a Mongoose model, which is not what this is about.
 */
describe('ItemsController', () => {
  let controller: ItemsController;
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
      controllers: [ItemsController],
      providers: [{ provide: ItemsService, useValue: service }],
    }).compile();

    controller = module.get<ItemsController>(ItemsController);
  });

  describe('routes', () => {
    it.each([
      ['create', 'POST', '/items', [Role.ADMIN]],
      ['findAll', 'GET', '/items/all', [Role.ADMIN, Role.AUTHENTICATED]],
      ['findOne', 'GET', '/items/:id', [Role.ADMIN, Role.AUTHENTICATED]],
      ['update', 'PUT', '/items/:id', [Role.ADMIN]],
      ['remove', 'DELETE', '/items/:id', [Role.ADMIN]],
    ] as const)('%s is %s %s, open to %j', (handler, method, path, roles) => {
      expect(routeOf(ItemsController, handler)).toEqual({
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
      expect(controller.findAll({ limit: 5, offset: 2 })).toBe(result);
      expect(service.findAll).toHaveBeenCalledWith(5, 2);
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
});
