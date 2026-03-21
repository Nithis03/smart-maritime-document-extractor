import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Session } from './session.entity';

@Entity('validations')
export class Validation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_VALIDATION_SESSION')
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => Session, (session: Session) => session.validations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ type: 'jsonb' })
  resultJson: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
