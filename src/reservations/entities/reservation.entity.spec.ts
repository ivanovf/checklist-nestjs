import { ReservationSchema } from './reservation.entity';

/**
 * Principle V: every field the reservation list filters or sorts on is indexed
 * (specs/006-fix-reservation-paging, research R6).
 */
describe('ReservationSchema indexes', () => {
  const keys = () => ReservationSchema.indexes().map(([fields]) => fields);

  it.each([
    [{ dateIni: -1, _id: -1 }],
    [{ type: 1 }],
    [{ validated: 1 }],
    [{ dateEnd: 1 }],
  ])('indexes %j', (fields) => {
    expect(keys()).toContainEqual(fields);
  });
});
