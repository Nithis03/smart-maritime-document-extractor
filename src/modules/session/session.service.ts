import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  async createSession(): Promise<Session> {
    const session = this.sessionRepository.create();
    return this.sessionRepository.save(session);
  }

  async findSessionById(id: string): Promise<Session | null> {
    return this.sessionRepository.findOne({ where: { id } });
  }

  async findSessionByIdWithExtractions(id: string): Promise<Session | null> {
    return this.sessionRepository.findOne({ 
      where: { id },
      relations: ['extractions'],
    });
  }
}
