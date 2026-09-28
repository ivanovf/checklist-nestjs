import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';

import { HealthController } from './health.controller';
import { routeOf } from '../common/testing/route-metadata';
import { HealthService } from './health.service';

/**
 * FR-016 requires unavailability be reported *as* a failure, not as a success body carrying
 * a sad field — a 200 with `database: "down"` would be read as healthy by any automated
 * check. FR-017 requires the response disclose nothing about the connection itself.
 */
describe('HealthController', () => {
  let controller: HealthController;
  let health: Record<string, jest.Mock>;

  beforeEach(async () => {
    health = { databaseState: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('answers ok when the data store is available', () => {
    health.databaseState.mockReturnValue('up');

    expect(controller.check()).toEqual({ status: 'ok', database: 'up' });
  });

  it('fails with 503 rather than a success body when the data store is unavailable', () => {
    health.databaseState.mockReturnValue('down');

    expect(() => controller.check()).toThrow(HttpException);

    try {
      controller.check();
    } catch (error) {
      const thrown = error as HttpException;
      expect(thrown.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(thrown.getResponse()).toEqual({
        status: 'error',
        database: 'down',
      });
    }
  });

  it('discloses nothing about the connection in a failure response', () => {
    health.databaseState.mockReturnValue('down');

    try {
      controller.check();
    } catch (error) {
      const body = JSON.stringify((error as HttpException).getResponse());
      // No host, credential, database name, or driver error text may reach a caller.
      expect(body).not.toMatch(
        /mongodb|mongo|srv|password|user|@|cluster|readyState/i,
      );
      expect(Object.keys((error as HttpException).getResponse())).toEqual([
        'status',
        'database',
      ]);
    }
  });
});

// Routing and access declarations (constitution Principle I).
describe('HealthController routes', () => {
  it('reports health at a public GET /health', () => {
    expect(routeOf(HealthController, 'check')).toEqual({
      method: 'GET',
      path: '/health',
      roles: undefined,
      isPublic: true,
    });
  });
});
