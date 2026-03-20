import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Session } from '../../session/entities/session.entity';

export enum ExtractionStatus {
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

@Entity('extractions')
export class Extraction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => Session, (session: Session) => session.extractions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ type: 'varchar' })
  fileName: string;

  @Column({ type: 'varchar' })
  fileHash: string;

  @Column({ type: 'varchar', nullable: true })
  documentType: string;

  @Column({ type: 'varchar', nullable: true })
  applicableRole: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  confidence: number;

  @Column({ type: 'varchar', nullable: true })
  holderName: string;

  @Column({ type: 'varchar', nullable: true })
  passportNumber: string;

  @Column({ type: 'varchar', nullable: true })
  sirbNumber: string;

  @Column({ type: 'jsonb', nullable: true })
  fieldsJson: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  validityJson: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  medicalDataJson: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  flagsJson: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  rawLlmResponse: string;

  @Column({ type: 'enum', enum: ExtractionStatus, default: ExtractionStatus.COMPLETE })
  status: ExtractionStatus;

  @Column({ type: 'boolean', default: false })
  isRetryable: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'int', nullable: true })
  processingTimeMs: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
