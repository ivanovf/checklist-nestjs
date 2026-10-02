import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard, seconds } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { PasswordRecoveryService } from '../services/password-recovery.service';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../models/role.model';
import { AuthenticatedUser } from '../strategy/jwt-strategy';
import { CompleteRecoveryDto } from '../dto/complete-recovery.dto';
import { RecoveryCodeResponseDto } from '../dto/recovery-code-response.dto';
import { PasswordResetResponseDto } from '../dto/password-reset-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { ApiRefusals } from '../../common/decorators/api-refusals.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

/**
 * Administrator-issued password recovery (specs/012-password-recovery,
 * contracts/password-recovery.md).
 */
@ApiTags('Auth')
@Controller('password-recovery')
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}

  /** `no-store`: the response carries a live credential that no cache may keep (R12). */
  @Roles(Role.ADMIN)
  @Post(':userId/code')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Issue a one-time password recovery code for an account',
  })
  @ApiCreatedResponse({
    type: RecoveryCodeResponseDto,
    description:
      'The code, shown only here. Any earlier code for the account stops working.',
  })
  @ApiRefusals(400, 401, 403, 404)
  issue(
    @Param('userId', ParseObjectIdPipe) userId: string,
    @Req() req: Request,
  ) {
    return this.recovery.issue(userId, (req.user as AuthenticatedUser).id);
  }

  /**
   * 200, not 201: completing changes a password and creates nothing (research R2).
   *
   * Five requests a minute per source, failed ones included, as sign-in. This limit is per
   * instance and in memory, so it is defence in depth only; the guessing bound is the attempt
   * counter, which lives in MongoDB (research O1/R5, FR-008).
   *
   * Unknown body fields are refused by the global request rules (D5,
   * specs/010-fix-unknown-fields), which also run the DTO's byte limit (research R9).
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set a new password with a recovery code' })
  @ApiOkResponse({
    type: PasswordResetResponseDto,
    description:
      'The password was replaced. No session is returned: sign in with the new password.',
  })
  @ApiRefusals(400, 429)
  complete(@Body() dto: CompleteRecoveryDto) {
    return this.recovery.complete(dto);
  }
}
