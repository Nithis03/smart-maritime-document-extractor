import { Injectable, Logger, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Extraction, ExtractionStatus } from './entities/extraction.entity';
import { SessionService } from '../session/session.service';
import { LLMProvider } from '../../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../../llm/llm.module';
import { generateSha256Hash } from '../../common/utils/hash.util';
import { extractJsonFromText } from '../../common/utils/json-extractor.util';
import { TimeoutException } from '../../common/utils/timeout.util';

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
      const isTimeout = error instanceof TimeoutException || error?.name === 'TimeoutException';
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`LLM Extraction failed: ${errMsg}`);
      
      const failedExtraction = this.extractionRepository.create({
        sessionId: session.id,
        fileName: file.originalname,
        fileHash: fileHash,
        status: ExtractionStatus.FAILED,
        isRetryable: isTimeout,
        errorMessage: errMsg,
        processingTimeMs: Date.now() - startTime,
      });

      return this.extractionRepository.save(failedExtraction);
    }

    // 4.5 Parse unstructured LLM Text with Repair Logic
    let parsedData: Record<string, unknown> | null = null;
    let finalRawResponse = rawLlmResponse;

    try {
      const jsonString = extractJsonFromText(rawLlmResponse);
      const parsed = JSON.parse(jsonString);
      if (typeof parsed === 'object' && parsed !== null) {
        parsedData = parsed;
      } else {
        throw new Error('Parsed response is not a valid JSON object');
      }
    } catch (error) {
      this.logger.warn(`Initial parse failed: ${error instanceof Error ? error.message : String(error)}. Attempting repair...`);
      
      try {
        finalRawResponse = await this.llmProvider.repairDocumentJSON(rawLlmResponse);
        const jsonString = extractJsonFromText(finalRawResponse);
        const parsed = JSON.parse(jsonString);
        if (typeof parsed === 'object' && parsed !== null) {
          parsedData = parsed;
          this.logger.log(`Repair call successfully recovered a valid JSON object.`);
        } else {
          throw new Error('Repaired JSON is still not a valid object');
        }
      } catch (repairError) {
        const isTimeout = repairError instanceof TimeoutException || repairError?.name === 'TimeoutException';
        const errMsg = repairError instanceof Error ? repairError.message : String(repairError);
        this.logger.error(`Repair failed: ${errMsg}`);
        
        // Mark extraction as FAILED, Store raw response
        const failedExtraction = this.extractionRepository.create({
          sessionId: session.id,
          fileName: file.originalname,
          fileHash: fileHash,
          status: ExtractionStatus.FAILED,
          isRetryable: isTimeout,
          errorMessage: errMsg,
          rawLlmResponse: finalRawResponse,
          processingTimeMs: Date.now() - startTime,
        });
        
        return this.extractionRepository.save(failedExtraction);
      }
    }

    if (!parsedData) {
      parsedData = {};
    }

    // 4.6 Automatic Retry for LOW Confidence
    const getConfidenceScore = (conf: unknown): number => {
      if (typeof conf !== 'string') return 0;
      const upper = conf.toUpperCase();
      if (upper === 'HIGH') return 3;
      if (upper === 'MEDIUM') return 2;
      if (upper === 'LOW') return 1;
      return 0;
    };

    const getDetectionConfidence = (data: Record<string, unknown>): unknown => {
      if (!data || typeof data !== 'object') return null;
      if (!data.detection || typeof data.detection !== 'object') return null;
      return (data.detection as Record<string, unknown>).confidence;
    };

    let currentConfidence = getDetectionConfidence(parsedData);

    if (typeof currentConfidence === 'string' && currentConfidence.toUpperCase() === 'LOW') {
      this.logger.log(`Extraction returned LOW confidence. Initiating 1x retry flow with extra context...`);
      
      const retryContext = `File name: ${file.originalname}\nMIME type: ${file.mimetype}\nPlease carefully re-evaluate the fields, as the previous extraction yielded LOW confidence.`;

      try {
        const retryRawResponse = await this.llmProvider.extractDocument(base64File, file.mimetype, retryContext);
        const retryJsonString = extractJsonFromText(retryRawResponse);
        const retryParsed = JSON.parse(retryJsonString);
        
        if (typeof retryParsed === 'object' && retryParsed !== null) {
          const retryConfidence = getDetectionConfidence(retryParsed as Record<string, unknown>);
          const originalScore = getConfidenceScore(currentConfidence);
          const retryScore = getConfidenceScore(retryConfidence);

          if (retryScore > originalScore) {
            this.logger.log(`Retry succeeded with higher confidence: ${retryConfidence}. Swapping result.`);
            parsedData = retryParsed as Record<string, unknown>;
            finalRawResponse = retryRawResponse;
            currentConfidence = retryConfidence;
          } else {
            this.logger.log(`Retry yielded confidence '${retryConfidence}' which is not higher than original. Keeping original.`);
          }
        }
      } catch (retryError) {
        this.logger.warn(`LOW confidence retry failed. Falling back to original result: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
      }
    }

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
      rawLlmResponse: finalRawResponse,
      status: ExtractionStatus.COMPLETE,
      processingTimeMs: Date.now() - startTime,
    });

    const savedExtraction = await this.extractionRepository.save(extraction);
    this.logger.log(`Successfully completed extraction for session: ${session.id}, file: ${file.originalname}`);
    return savedExtraction;
  }
}
