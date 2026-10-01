import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ConfigService } from './config.service';
import { Config } from './entities/config.entity';

/**
 * The by-id changes used to test an unawaited query, which is never falsy, so an unknown id
 * was answered as success (D2, specs/008-fix-unknown-id-404).
 */
describe('ConfigService', () => {
  let service: ConfigService;
  let model: { findByIdAndUpdate: jest.Mock; find: jest.Mock };

  const id = '6aba80d38c58c96b58020000';
  const record = { _id: id };
  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const notFound = new NotFoundException(`config #${id} not found`);

  /** A chainable query stub: each step returns the stub, and `exec` resolves `value`. */
  const chain = (value: unknown) => {
    const query: Record<string, jest.Mock> = {
      exec: jest.fn().mockResolvedValue(value),
    };
    for (const step of ['sort', 'skip', 'limit', 'populate']) {
      query[step] = jest.fn(() => query);
    }
    return query;
  };

  beforeEach(async () => {
    model = { findByIdAndUpdate: jest.fn(), find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: getModelToken(Config.name), useValue: model },
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  /**
   * The list used to return the whole collection (D6, specs/011-fix-unbounded-lists).
   */
  describe('findAll', () => {
    it('reads one page, oldest first', async () => {
      const query = chain([record]);
      model.find.mockReturnValue(query);

      await expect(service.findAll(5, 10)).resolves.toEqual([record]);
      // A total order, so consecutive pages never repeat or skip a record (R4).
      expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('update', () => {
    it('answers the changed record', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.update(id, {})).resolves.toBe(record);
    });

    it('refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.update(id, {})).rejects.toThrow(notFound);
    });
  });

  describe('updateAnalogLecure', () => {
    const report = (apiKey = process.env.TANK_API_KEY) =>
      ({ analogLecture: 1, apiKey, time: 1 }) as never;

    beforeEach(() => {
      process.env.TANK_API_KEY = 'unit-test-tank-key';
    });

    it('answers the changed record', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.updateAnalogLecure(id, report())).resolves.toBe(
        record,
      );
    });

    it('refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.updateAnalogLecure(id, report())).rejects.toThrow(
        notFound,
      );
    });

    it('still refuses a wrong key before looking the record up (D10)', async () => {
      await expect(
        service.updateAnalogLecure(id, report('wrong')),
      ).rejects.toThrow(new NotFoundException('Invalid API Key'));
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
