import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { routeOf } from './common/testing/route-metadata';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    /**
     * The scaffolded version asserted `expect(appController.getHome).toBe({...})`, comparing the
     * method itself — not its result — against an object by reference identity, so it could
     * never pass. The endpoint is the liveness probe the deployment platforms call, so what it
     * returns is worth pinning down.
     */
    it('returns the service identity banner', () => {
      expect(appController.getHome()).toEqual({
        api: 'Checklist',
        version: '1.0',
      });
    });
  });
});

// Routing and access declarations (constitution Principle I).
describe('AppController routes', () => {
  it('serves the identity banner at a public GET /', () => {
    expect(routeOf(AppController, 'getHome')).toEqual({
      method: 'GET',
      path: '/',
      roles: undefined,
      isPublic: true,
    });
  });
});
