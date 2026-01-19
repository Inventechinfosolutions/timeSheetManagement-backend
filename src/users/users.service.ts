// import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import * as bcrypt from 'bcrypt';
// import { User } from '../entities/user.entity';

// @Injectable()
// export class UsersService {
//   constructor(
//     @InjectRepository(User)
//     private usersRepository: Repository<User>,
//   ) {}

//   async create(userData: Partial<User>): Promise<User> {
//     const existingUser = await this.usersRepository.findOne({
//       where: { email: userData.email },
//     });

//     if (existingUser) {
//       throw new ConflictException('User with this email already exists');
//     }

//     // Hash password before saving
//     if (userData.password) {
//       const salt = await bcrypt.genSalt(10);
//       userData.password = await bcrypt.hash(userData.password, salt);
//     }

//     const user = this.usersRepository.create(userData);
//     return await this.usersRepository.save(user);
//   }

//   async findByEmail(email: string): Promise<User | null> {
//     return await this.usersRepository
//       .createQueryBuilder('user')
//       .where('user.email = :email', { email })
//       .addSelect('user.password')
//       .getOne();
//   }

//   async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
//     return bcrypt.compare(plainPassword, hashedPassword);
//   }

//   async findById(id: string): Promise<User | null> {
//     return await this.usersRepository.findOne({
//       where: { id },
//       select: ['id', 'name', 'email', 'createdAt', 'updatedAt'],
//     });
//   }
// }

