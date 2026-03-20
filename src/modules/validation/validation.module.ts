import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Validation } from './entities/validation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Validation])],
  exports: [TypeOrmModule],
})
export class ValidationModule {}
