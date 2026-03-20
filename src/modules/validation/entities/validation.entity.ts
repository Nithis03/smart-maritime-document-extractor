import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Extraction } from '../../extract/entities/extraction.entity';

@Entity('validations')
export class Validation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'extraction_id', type: 'uuid' })
  extractionId: string;

  @ManyToOne(() => Extraction, (extraction: Extraction) => extraction.validations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'extraction_id' })
  extraction: Extraction;

  @Column({ type: 'jsonb' })
  resultJson: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
