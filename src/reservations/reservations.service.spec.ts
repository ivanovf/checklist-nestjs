import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ReservationsService } from './reservations.service';
import { Reservation } from './entities/reservation.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. Without it the testing module cannot construct the service at all.
 */
describe('ReservationsService', () => {
  let service: ReservationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getModelToken(Reservation.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
