import * as bcrypt from 'bcrypt';

import { RepairResult, formatReport, isBcryptHash } from './password-repair';

/**
 * The pure parts of the one-off repair for D17 (specs/009-fix-unprojected-records): telling a
 * hash from plain text, and a report that names accounts without leaking anything about them.
 * The repair itself runs against a real database in test/records/password-repair.e2e-spec.ts.
 */
describe('password repair', () => {
  describe('isBcryptHash', () => {
    it('recognises a real bcrypt hash', () => {
      expect(isBcryptHash(bcrypt.hashSync('x', 4))).toBe(true);
    });

    it.each([
      ['plain text', 'sent-pw'],
      ['an empty string', ''],
      ['a missing value', undefined],
      ['a lookalike with a bad prefix', `$9z$10$${'a'.repeat(53)}`],
      ['a hash one character short', bcrypt.hashSync('x', 4).slice(0, -1)],
    ])('treats %s as not a hash', (_, value) => {
      expect(isBcryptHash(value)).toBe(false);
    });
  });

  describe('formatReport', () => {
    const result: RepairResult = {
      database: 'checklist',
      apply: false,
      scanned: 5,
      toRepair: ['6aba80d38c58c96b58020001', '6aba80d38c58c96b58020002'],
      repaired: 0,
      skippedNoPassword: ['6aba80d38c58c96b58020003'],
    };

    it('names the database, the counts and each account by id', () => {
      const report = formatReport(result);

      expect(report).toContain('checklist');
      expect(report).toContain('dry run');
      expect(report).toMatch(/scanned:\s+5/i);
      expect(report).toMatch(/plain-text passwords:\s+2/i);
      result.toRepair.forEach((id) => expect(report).toContain(id));
      expect(report).toContain('6aba80d38c58c96b58020003');
    });

    it('reports what was repaired when applied', () => {
      const report = formatReport({ ...result, apply: true, repaired: 2 });

      expect(report).toMatch(/repaired:\s+2/i);
    });

    // Constitution: personal data stays out of logs, and a password must never be printed.
    it('carries no email or password, even when its input does', () => {
      const leaky = {
        ...result,
        email: 'guest@example.com',
        password: 'sent-pw',
      };

      const report = formatReport(leaky);

      expect(report).not.toContain('guest@example.com');
      expect(report).not.toContain('sent-pw');
    });
  });
});
