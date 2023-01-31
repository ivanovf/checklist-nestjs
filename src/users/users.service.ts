import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(createUserDto: CreateUserDto) {
    const newUser = new this.userModel(createUserDto);
    const hashPassword = await bcrypt.hash(newUser.password, 10);

    newUser.password = hashPassword;
    const created = await newUser.save();
    return this.skipPassword(created);
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    const updated = this.userModel
      .findByIdAndUpdate(id, { $set: updateUserDto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(id);
    }
    return updated;
  }

  remove(id: string) {
    const removed = this.userModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(id);
    }
    return { deleted: true };
  }

  async findAll(limit: number, offset: number) {
    const users = await this.userModel.find().limit(limit).skip(offset).exec();
    const filtered = [];

    for (let i = 0; i < users.length; i++) {
      filtered.push(this.skipPassword(users[i]));
    }

    return filtered;
  }

  findOne(id: string) {
    const user = this.userModel.findById(id);

    if (!user) {
      throw new NotFoundException(`user #${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string) {
    return await this.userModel.findOne({ email });
  }

  skipPassword(user: User) {
    const { password, ...obj } = user.toJSON();
    password;
    return obj;
  }
}
