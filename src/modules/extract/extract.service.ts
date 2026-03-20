import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Extraction, ExtractionStatus } from './entities/extraction.entity';
import { SessionService } from '../session/session.service';
import { GeminiService } from '../../llm/gemini.service';
import { generateSha256Hash } from '../../common/utils/hash.util';

@Injectable()
export class ExtractService {
  private readonly logger = new Logger(ExtractService.name);

  constructor(
    @InjectRepository(Extraction)
    private readonly extractionRepository: Repository<Extraction>,
    private readonly sessionService: SessionService,
    private readonly geminiService: GeminiService,
  ) {}

  async extractDocument(file: Express.Multer.File, sessionId?: string): Promise<Extraction> {
    const startTime = Date.now();

    // 1. Resolve Session
    let session;
    if (sessionId) {
      session = await this.sessionService.findSessionById(sessionId);
      if (!session) {
        throw new NotFoundException(`Session with ID ${sessionId} not found`);
      }
    } else {
      session = await this.sessionService.createSession();
      this.logger.log(`Created new session: ${session.id}`);
    }

    // 2. Hash File
    const fileHash = generateSha256Hash(file.buffer);

    // 3. Check for duplicates
    const existingExtraction = await this.extractionRepository.findOne({
      where: {
        sessionId: session.id,
        fileHash: fileHash,
      },
    });

    if (existingExtraction) {
      this.logger.log(`Returning duplicate extraction for session: ${session.id}, hash: ${fileHash}`);
      return existingExtraction;
    }

    // 4. Transform file & Call LLM
    const base64File = file.buffer.toString('base64');
    
    let llmResult;
    try {
      llmResult = await this.geminiService.extractDocumentData(base64File, file.mimetype);
    } catch (error) {
      this.logger.error(`LLM Extraction failed: ${error.message}`, error.stack);
      
      const failedExtraction = this.extractionRepository.create({
        sessionId: session.id,
        fileName: file.originalname,
        fileHash: fileHash,
        status: ExtractionStatus.FAILED,
        processingTimeMs: Date.now() - startTime,
      });

      return this.extractionRepository.save(failedExtraction);
    }

    // 5. Save Successful Extraction
    const extraction = this.extractionRepository.create({
      sessionId: session.id,
      fileName: file.originalname,
      fileHash: fileHash,
      documentType: llmResult.documentType,
      applicableRole: llmResult.applicableRole,
      confidence: llmResult.confidence,
      holderName: llmResult.holderName,
      passportNumber: llmResult.passportNumber,
      sirbNumber: llmResult.sirbNumber,
      fieldsJson: llmResult.fieldsJson,
      validityJson: llmResult.validityJson,
      medicalDataJson: llmResult.medicalDataJson,
      flagsJson: llmResult.flagsJson,
      rawLlmResponse: llmResult.rawLlmResponse,
      status: ExtractionStatus.COMPLETE,
      processingTimeMs: Date.now() - startTime,
    });

    const savedExtraction = await this.extractionRepository.save(extraction);
    this.logger.log(`Successfully completed extraction for session: ${session.id}, file: ${file.originalname}`);
    return savedExtraction;
  }
}
