import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
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
  ) { }

  private getConfidenceScore(conf: unknown): number {
    if (typeof conf !== 'string') return 0;
    const upper = conf.toUpperCase();
    if (upper === 'HIGH') return 3;
    if (upper === 'MEDIUM') return 2;
    if (upper === 'LOW') return 1;
    return 0;
  }

  private getDetectionConfidence(data: Record<string, unknown>): unknown {
    if (!data || typeof data !== 'object') return null;
    if (!data.detection || typeof data.detection !== 'object') return null;
    return (data.detection as Record<string, unknown>).confidence;
  }

  async extractDocument(file: Express.Multer.File, sessionId?: string): Promise<{ extraction: Extraction; isDuplicate: boolean }> {
    const startTime = Date.now();

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

    const fileHash = generateSha256Hash(file.buffer);
    const existingExtraction = await this.extractionRepository.findOne({
      where: { sessionId: session.id, fileHash: fileHash },
    });

    if (existingExtraction) {
      this.logger.log(`Returning duplicate extraction for session: ${session.id}, hash: ${fileHash}`);
      return { extraction: existingExtraction, isDuplicate: true };
    }

    const base64File = file.buffer.toString('base64');
    let rawLlmResponse: string | null = null;
    let parsedData: Record<string, unknown> | null = null;
    let extractionStatus = ExtractionStatus.COMPLETE;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let isRetryable = false;

    try {
      try {
        rawLlmResponse = await this.llmProvider.extractDocument(base64File, file.mimetype);
      } catch (err) {
        errorCode = err instanceof TimeoutException || err?.name === 'TimeoutException' ? 'TIMEOUT' : 'LLM_API_ERROR';
        throw err;
      }

      try {
        const jsonString = extractJsonFromText(rawLlmResponse);
        const parsed = JSON.parse(jsonString);
        if (typeof parsed !== 'object' || parsed === null) throw new Error('Parsed response is not a valid JSON object');
        parsedData = parsed as Record<string, unknown>;
      } catch (err) {
        this.logger.warn(`Initial parse failed: ${err instanceof Error ? err.message : String(err)}. Attempting repair...`);
        try {
          rawLlmResponse = await this.llmProvider.repairDocumentJSON(rawLlmResponse);
          const repairedJsonString = extractJsonFromText(rawLlmResponse);
          const repairedParsed = JSON.parse(repairedJsonString);
          if (typeof repairedParsed !== 'object' || repairedParsed === null) throw new Error('Repaired JSON is still not a valid object');
          parsedData = repairedParsed as Record<string, unknown>;
          this.logger.log(`Repair call successfully recovered a valid JSON object.`);
        } catch (repairErr) {
          errorCode = repairErr instanceof TimeoutException || repairErr?.name === 'TimeoutException' ? 'TIMEOUT' : 'LLM_JSON_PARSE_FAIL';
          throw repairErr;
        }
      }

      const currentConfidence = this.getDetectionConfidence(parsedData);
      if (typeof currentConfidence === 'string' && currentConfidence.toUpperCase() === 'LOW') {
        this.logger.log(`Extraction returned LOW confidence. Initiating 1x retry flow with extra context...`);
        const retryContext = `File name: ${file.originalname}\nMIME type: ${file.mimetype}\nPlease carefully re-evaluate the fields, as the previous extraction yielded LOW confidence.`;

        try {
          const retryRawResponse = await this.llmProvider.extractDocument(base64File, file.mimetype, retryContext);
          const retryJsonString = extractJsonFromText(retryRawResponse);
          const retryParsed = JSON.parse(retryJsonString);

          if (typeof retryParsed === 'object' && retryParsed !== null) {
            const retryConfidence = this.getDetectionConfidence(retryParsed as Record<string, unknown>);
            const originalScore = this.getConfidenceScore(currentConfidence);
            const retryScore = this.getConfidenceScore(retryConfidence);

            if (retryScore > originalScore) {
              this.logger.log(`Retry succeeded with higher confidence: ${retryConfidence}. Swapping result.`);
              parsedData = retryParsed as Record<string, unknown>;
              rawLlmResponse = retryRawResponse;
            } else {
              this.logger.log(`Retry yielded confidence '${retryConfidence}' which is not higher. Keeping original.`);
            }
          }
        } catch (retryError) {
          this.logger.warn(`LOW confidence retry failed. Falling back to original result: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
        }
      }

    } catch (globalError) {
      extractionStatus = ExtractionStatus.FAILED;
      errorMessage = globalError instanceof Error ? globalError.message : String(globalError);
      isRetryable = errorCode === 'TIMEOUT' || errorCode === 'LLM_JSON_PARSE_FAIL' || errorCode === 'LLM_API_ERROR';
      if (!errorCode) errorCode = 'INTERNAL_ERROR';
      this.logger.error(`Extraction flow failed: [${errorCode}] ${errorMessage}`);
    }

    const extraction = this.extractionRepository.create({
      sessionId: session.id,
      fileName: file.originalname,
      fileHash: fileHash,

      documentType: typeof (parsedData?.detection as any)?.documentType === 'string' ? (parsedData?.detection as any).documentType : null,
      applicableRole: typeof (parsedData?.detection as any)?.applicableRole === 'string' ? (parsedData?.detection as any).applicableRole : null,
      confidence: typeof (parsedData?.detection as any)?.confidence === 'string'
        ? (parsedData?.detection as any).confidence
        : null,
      holderName: typeof (parsedData?.holder as any)?.fullName === 'string' ? (parsedData?.holder as any).fullName : null,
      passportNumber: typeof (parsedData?.holder as any)?.passportNumber === 'string' ? (parsedData?.holder as any).passportNumber : null,
      sirbNumber: typeof (parsedData?.holder as any)?.sirbNumber === 'string' ? (parsedData?.holder as any).sirbNumber : null,

      fieldsJson: parsedData?.fields ? (parsedData.fields as any) : null,
      validityJson: parsedData?.validity && typeof parsedData.validity === 'object' ? (parsedData.validity as Record<string, unknown>) : null,
      medicalDataJson: parsedData?.medicalData && typeof parsedData.medicalData === 'object' ? (parsedData.medicalData as Record<string, unknown>) : null,
      flagsJson: parsedData?.flags ? (parsedData.flags as any) : null,

      rawLlmResponse: rawLlmResponse || '', // Store raw safely as empty string if it fails inherently before fetch completes
      status: extractionStatus,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      isRetryable: isRetryable,
      processingTimeMs: Date.now() - startTime,
    });

    const savedExtraction = await this.extractionRepository.save(extraction);

    if (extractionStatus === ExtractionStatus.COMPLETE) {
      this.logger.log(`Successfully completed extraction for session: ${session.id}, file: ${file.originalname}`);
    } else {
      this.logger.warn(`Saved FAILED extraction record for session: ${session.id}, file: ${file.originalname}`);
    }

    return { extraction: savedExtraction, isDuplicate: false };
  }
}
