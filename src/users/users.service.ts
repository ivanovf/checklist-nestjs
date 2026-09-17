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

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(createUserDto: CreateUserDto) {
    const newUser = new this.userModel(createUserDto);
    const hashPassword = await bcrypt.hash(newUser.password, SALT_ROUNDS);

    newUser.password = hashPassword;
    const created = await newUser.save();
    return this.skipPassword(created);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
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

        updateUserDto.password = await bcrypt.hash(
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
      .findByIdAndUpdate(id, { $set: updateUserDto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`user #${id} not found`);
    }

    // Projected rather than deleted. `delete doc.password` removes only the accessor on a
    // hydrated document; the value survives in the internal document and is emitted by
    // toJSON(), which is how the hash was reaching the response.
    return this.skipPassword(updated);
  }

  async remove(id: string) {
    const removed = await this.userModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(`user #${id} not found`);
    }
    return { deleted: true };
  }

  async findAll(limit: number, offset: number) {
    const users = await this.userModel.find().limit(limit).skip(offset).exec();

    return users.map((user) => this.skipPassword(user));
  }

  async findOne(id: string, skipPass = true) {
    const user = skipPass
      ? await this.userModel.findById(id).exec()
      : await this.findWithPassword(id);

    if (!user) {
      throw new NotFoundException(`user #${id} not found`);
    }

    return skipPass ? this.skipPassword(user) : user;
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

  skipPassword(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...obj } = user.toJSON();
    return obj;
  }
}
