import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Extraction } from '../../extract/entities/extraction.entity';
import { Job } from '../../job/entities/job.entity';
import { Validation } from '../../validation/entities/validation.entity';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  detectedRole: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @OneToMany(() => Extraction, (extraction: Extraction) => extraction.session)
  extractions: Extraction[];

  @OneToMany(() => Job, (job: Job) => job.session)
  jobs: Job[];

  @OneToMany(() => Validation, (validation: Validation) => validation.session)
  validations: Validation[];
}
