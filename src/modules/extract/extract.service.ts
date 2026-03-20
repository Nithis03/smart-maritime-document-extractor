import { Injectable, Logger, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Extraction, ExtractionStatus } from './entities/extraction.entity';
import { SessionService } from '../session/session.service';
import { LLMProvider } from '../../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../../llm/llm.module';
import { generateSha256Hash } from '../../common/utils/hash.util';
import { extractJsonFromText } from '../../common/utils/json-extractor.util';

@Injectable()
export class ExtractService {
  private readonly logger = new Logger(ExtractService.name);

  constructor(
    @InjectRepository(Extraction)
    private readonly extractionRepository: Repository<Extraction>,
    private readonly sessionService: SessionService,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LLMProvider,
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
    
    let rawLlmResponse: string;
    try {
      rawLlmResponse = await this.llmProvider.extractDocument(base64File, file.mimetype);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`LLM Extraction failed: ${errMsg}`);
      
      const failedExtraction = this.extractionRepository.create({
        sessionId: session.id,
        fileName: file.originalname,
        fileHash: fileHash,
        status: ExtractionStatus.FAILED,
        processingTimeMs: Date.now() - startTime,
      });

      return this.extractionRepository.save(failedExtraction);
    }

    // 4.5 Parse unstructured LLM Text
    const parsedData = extractJsonFromText(rawLlmResponse) || {};

    // 5. Save Successful Extraction
    const extraction = this.extractionRepository.create({
      sessionId: session.id,
      fileName: file.originalname,
      fileHash: fileHash,
      documentType: typeof parsedData.documentType === 'string' ? parsedData.documentType : null,
      applicableRole: typeof parsedData.applicableRole === 'string' ? parsedData.applicableRole : null,
      confidence: typeof parsedData.confidence === 'number' ? parsedData.confidence : null,
      holderName: typeof parsedData.holderName === 'string' ? parsedData.holderName : null,
      passportNumber: typeof parsedData.passportNumber === 'string' ? parsedData.passportNumber : null,
      sirbNumber: typeof parsedData.sirbNumber === 'string' ? parsedData.sirbNumber : null,
      fieldsJson: parsedData.fieldsJson && typeof parsedData.fieldsJson === 'object' ? (parsedData.fieldsJson as Record<string, unknown>) : null,
      validityJson: parsedData.validityJson && typeof parsedData.validityJson === 'object' ? (parsedData.validityJson as Record<string, unknown>) : null,
      medicalDataJson: parsedData.medicalDataJson && typeof parsedData.medicalDataJson === 'object' ? (parsedData.medicalDataJson as Record<string, unknown>) : null,
      flagsJson: parsedData.flagsJson && typeof parsedData.flagsJson === 'object' ? (parsedData.flagsJson as Record<string, unknown>) : null,
      rawLlmResponse: rawLlmResponse,
      status: ExtractionStatus.COMPLETE,
      processingTimeMs: Date.now() - startTime,
    });

    const savedExtraction = await this.extractionRepository.save(extraction);
    this.logger.log(`Successfully completed extraction for session: ${session.id}, file: ${file.originalname}`);
    return savedExtraction;
  }
}
