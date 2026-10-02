import {
  Injectable,
  NotFoundException,
  NotAcceptableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto, toUserResponse } from './dto/user-response.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  // Every answer goes through UserResponseDto, an allowlist, so neither the hash nor any other
  // stored field can reach a caller, whatever the store hands back (D3,
  // specs/009-fix-unprojected-records).
  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const newUser = new this.userModel(createUserDto);
    const hashPassword = await bcrypt.hash(newUser.password, SALT_ROUNDS);

    newUser.password = hashPassword;
    const created = await newUser.save();
    return toUserResponse(created);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // Only the account's own fields are written, and the password only as the hash of a
    // verified change. The whole DTO used to be the `$set`, so with `changePassword: false` the
    // `password` it must carry (D9) overwrote the hash as plain text and locked the account out
    // (D17, observed 2026-10-01, specs/009-fix-unprojected-records).
    const { email, name, role } = updateUserDto;
    const changes: Partial<Pick<User, 'email' | 'name' | 'role' | 'password'>> =
      {
        ...(email !== undefined && { email }),
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
      };

    if (updateUserDto?.changePassword) {
      if (updateUserDto?.password && updateUserDto?.currentPassword) {
        // The hash is excluded from queries by default, so this path opts back in.
        const user = await this.findWithPassword(id);
        const isMatch = await bcrypt.compare(
          updateUserDto.currentPassword,
          user.password,
        );

        if (!isMatch) {
          throw new NotAcceptableException('The password does not match.');
        }

        changes.password = await bcrypt.hash(
          updateUserDto.password,
          SALT_ROUNDS,
        );
      } else {
        throw new NotAcceptableException('No new password provide');
      }
    }

    // Awaited before the check: the previous implementation tested the Query object, which is
    // always truthy, so a missing account never raised NotFoundException.
    const updated = await this.userModel
      .findByIdAndUpdate(id, { $set: changes }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`user #${id} not found`);
    }

    // Projected rather than deleted. `delete doc.password` removes only the accessor on a
    // hydrated document; the value survives in the internal document and is emitted by
    // toJSON(), which is how the hash was reaching the response.
    return toUserResponse(updated);
  }

  async remove(id: string) {
    const removed = await this.userModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(`user #${id} not found`);
    }
    return { deleted: true };
  }

  async findAll(limit: number, offset: number): Promise<UserResponseDto[]> {
    // `_id` gives a fixed order, so consecutive pages never repeat or skip a record. It is
    // always indexed (constitution Principle V; specs/007-fix-list-paging-defaults, R5).
    const users = await this.userModel
      .find()
      .sort({ _id: 1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return users.map(toUserResponse);
  }

  // The `skipPass = false` branch that answered the document with its hash is gone: nothing
  // called it, and an answer path that can carry the hash is what FR-005 rules out.
  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException(`user #${id} not found`);
    }

    return toUserResponse(user);
  }

  /**
   * Plain lookup used on every authenticated request to resolve the caller's current role.
   * Returns null rather than throwing: an absent account is an authentication failure, not a
   * 404, and the strategy decides how to surface it.
   */
  async findById(id: string) {
    return await this.userModel.findById(id).exec();
  }

  /** Credential verification at sign-in. The only other caller that needs the hash. */
  async findByEmail(email: string) {
    return await this.userModel.findOne({ email }).select('+password').exec();
  }

  private async findWithPassword(id: string) {
    const user = await this.userModel.findById(id).select('+password').exec();

    if (!user) {
      throw new NotFoundException(`user #${id} not found`);
    }

    return user;
  }

  /** Sign-in's own result (src/auth). Answers to callers go through `toUserResponse`. */
  skipPassword(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...obj } = user.toJSON();
    return obj;
  }
}
