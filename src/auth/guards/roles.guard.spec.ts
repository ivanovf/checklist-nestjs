import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  it('should be defined', () => {
    expect(new RolesGuard(reflector)).toBeDefined();
  });
});
