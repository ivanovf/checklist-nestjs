import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../auth/models/role.model';
import { routeOf } from '../common/testing/route-metadata';
import { ActivityTypeController } from './activity-type.controller';
import { ActivityTypeService } from './activity-type.service';

/**
 * Routing, access declarations and input binding for every route (constitution Principle
 * I). Access *enforcement* is proven end to end by the authorization matrix suite; here,
 * the administrator role is declared once, on the controller, and remove forwards the raw id: it once passed `+id`, and Mongo ids are not numeric, so every delete arrived as NaN.
 *
 * ActivityTypeService is stubbed: the real one needs a Mongoose model, which is not what this is about.
 */
describe('ActivityTypeController', () => {
  let controller: ActivityTypeController;
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
      controllers: [ActivityTypeController],
      providers: [{ provide: ActivityTypeService, useValue: service }],
    }).compile();

    controller = module.get<ActivityTypeController>(ActivityTypeController);
  });

  describe('routes', () => {
    it.each([
      ['create', 'POST', '/activity-type', [Role.ADMIN]],
      ['findAll', 'GET', '/activity-type', [Role.ADMIN]],
      ['findOne', 'GET', '/activity-type/:id', [Role.ADMIN]],
      ['update', 'PUT', '/activity-type/:id', [Role.ADMIN]],
      ['remove', 'DELETE', '/activity-type/:id', [Role.ADMIN]],
    ] as const)('%s is %s %s, open to %j', (handler, method, path, roles) => {
      expect(routeOf(ActivityTypeController, handler)).toEqual({
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
      expect(controller.findAll()).toBe(result);
      expect(service.findAll).toHaveBeenCalledWith();
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
