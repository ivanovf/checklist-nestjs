import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../auth/models/role.model';
import { routeOf } from '../common/testing/route-metadata';
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
      expect(controller.findAll()).toBe(result);
      expect(service.findAll).toHaveBeenCalledWith();
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
});
