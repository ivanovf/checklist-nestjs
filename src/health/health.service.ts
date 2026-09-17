import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export type DatabaseState = 'up' | 'down';

/**
 * Reports whether the data store is actually usable.
 *
 * Reads the existing connection's state rather than issuing a query: the constitution
 * requires the connection be established once per instance and reused, so opening anything
 * here would undermine that, and a round-trip ping could itself hang and make the health
 * route the slowest route in the service.
 */
@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  databaseState(): DatabaseState {
    // Mongoose states: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting,
    // 99 uninitialized. Only `connected` is usable — reporting `connecting` as healthy is
    // the false positive this route exists to eliminate, and an unrecognised value must
    // never be optimistically treated as available.
    return this.connection.readyState === 1 ? 'up' : 'down';
  }
}
