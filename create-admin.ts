import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './src/users/entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserType } from './src/users/enums/user-type.enum';
import { UserStatus } from './src/users/enums/user-status.enum';

async function createDefaultAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
    
    // Check if admin user exists
    const existingAdmin = await userRepository.findOne({
      where: { loginId: 'admin' }
    });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      console.log('Login ID: admin');
      console.log('Password: admin123');
      return;
    }
    
    // Create admin user
    const adminUser = new User();
    adminUser.loginId = 'admin';
    adminUser.aliasLoginName = 'Administrator';
    adminUser.password = await bcrypt.hash('admin123', 10);
    adminUser.userType = UserType.ADMIN;
    adminUser.status = UserStatus.ACTIVE;
    adminUser.changePasswordRequired = false;
    adminUser.resetRequired = false;
    adminUser.mobileVerification = false;
    adminUser.createdAt = new Date();
    adminUser.updatedAt = new Date();
    
    await userRepository.save(adminUser);
    
    console.log('Default admin user created successfully!');
    console.log('Login credentials:');
    console.log('Login ID: admin');
    console.log('Password: admin123');
    console.log('User Type: ADMIN');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await app.close();
  }
}

createDefaultAdmin();