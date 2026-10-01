import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Refuses a path id that cannot name a stored record, before it reaches the database.
 *
 * A malformed id used to fail inside Mongoose as a server error, or, on three DELETE routes
 * whose query was never awaited, as a false `{ deleted: true }` (D7,
 * specs/008-fix-unknown-id-404). As a pipe it runs after the guards, so an unauthenticated or
 * unauthorised caller is still refused first and learns nothing from the id.
 *
 * `ObjectId.isValid` alone also accepts any 12-character string as raw bytes, so the value
 * must also survive a round trip to the 24-hex form.
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const valid =
      Types.ObjectId.isValid(value) &&
      String(new Types.ObjectId(value)) === value.toLowerCase();

    if (!valid) {
      throw new BadRequestException(`Invalid id "${value}"`);
    }
    return value;
  }
}
