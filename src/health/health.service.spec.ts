import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';

import { HealthService } from './health.service';

/**
 * The whole point of the health route is to stop a deploy reporting success while the data
 * store is unusable, so the state mapping is pinned exhaustively. `connecting` is the
 * interesting case: treating it as success would reintroduce exactly the false positive
 * this route exists to remove.
 */
describe('HealthService', () => {
  const serviceWith = async (readyState: number): Promise<HealthService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getConnectionToken(), useValue: { readyState } },
      ],
    }).compile();

    return module.get<HealthService>(HealthService);
  };

  it('reports the data store as up when the connection is connected', async () => {
    const service = await serviceWith(1);

    expect(service.databaseState()).toBe('up');
  });

  it.each([
    [0, 'disconnected'],
    [2, 'connecting'],
    [3, 'disconnecting'],
    [99, 'uninitialized'],
  ])(
    'reports the data store as down for readyState %i (%s)',
    async (readyState) => {
      const service = await serviceWith(readyState as number);

      expect(service.databaseState()).toBe('down');
    },
  );

  it('does not treat an unrecognised connection state as available', async () => {
    const service = await serviceWith(42);

    expect(service.databaseState()).toBe('down');
  });
});
