import { Inject, Injectable } from '@nestjs/common';
import { Db } from 'mongodb';

@Injectable()
export class AppService {
  constructor(@Inject('MONGO') private database: Db) {}

  getHello(): object {
    return {
      api: 'Checklist',
      version: '1.0',
    };
  }
}
