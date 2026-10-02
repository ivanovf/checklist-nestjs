import { FieldList, project } from '../../common/projection';

/** A checklist item embedded in a reservation. Embedded items carry no `__v`. */
export class ReservationItemResponseDto {
  _id: string;

  label: string;

  status: boolean;

  checked: boolean;

  description?: string;

  comments: string;

  category: string;

  createdAt: Date;

  updatedAt: Date;
}

/**
 * The reservation as every operation answers it: the service projects each record through this
 * shape, embedded items included, so only these fields leave it (D3,
 * specs/009-fix-unprojected-records).
 */
export class ReservationResponseDto {
  _id: string;

  dateIni: Date;

  dateEnd: Date;

  type: string;

  validated: boolean;

  contact: string;

  quantity: number;

  cost?: number;

  items: ReservationItemResponseDto[];

  createdAt: Date;

  updatedAt: Date;
}

export const RESERVATION_ITEM_RESPONSE_FIELDS: FieldList<ReservationItemResponseDto> =
  {
    _id: true,
    label: true,
    status: true,
    checked: true,
    description: true,
    comments: true,
    category: true,
    createdAt: true,
    updatedAt: true,
  };

export const RESERVATION_RESPONSE_FIELDS: FieldList<ReservationResponseDto> = {
  _id: true,
  dateIni: true,
  dateEnd: true,
  type: true,
  validated: true,
  contact: true,
  quantity: true,
  cost: true,
  items: true,
  createdAt: true,
  updatedAt: true,
};

export function toReservationResponse(
  reservation: object,
): ReservationResponseDto {
  const answer = project<ReservationResponseDto>(
    reservation,
    RESERVATION_RESPONSE_FIELDS,
  );
  const items = (reservation as { items?: object[] }).items;

  return items
    ? {
        ...answer,
        items: items.map((item) =>
          project<ReservationItemResponseDto>(
            item,
            RESERVATION_ITEM_RESPONSE_FIELDS,
          ),
        ),
      }
    : answer;
}
