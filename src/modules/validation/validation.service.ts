import { Injectable, BadRequestException, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Validation } from './entities/validation.entity';
import { SessionService } from '../session/session.service';
import { LLM_PROVIDER } from '../../llm/llm.module';
import { LLMProvider } from '../../llm/llm-provider.interface';
import { extractJsonFromText } from '../../common/utils/json-extractor.util';
import { Extraction } from '../extract/entities/extraction.entity';

interface HolderProfile {
  fullName: string;
  dateOfBirth: string | null;
  nationality: string | null;
  passportNumber: string | null;
  sirbNumber: string | null;
  detectedRole: string;
}

interface ConsistencyCheck {
  field: string;
  isConsistent: boolean;
  documents: string[];
  details: string;
}

interface MissingDocument {
  documentType: string;
  reason: string;
  severity: string;
}

interface ExpiringDocument {
  documentType: string;
  expiryDate: string;
  daysRemaining: number;
  isExpired: boolean;
}

interface MedicalFlag {
  source: string;
  flag: string;
  severity: string;
}

export interface ValidationResult {
  sessionId: string;
  holderProfile: HolderProfile;
  consistencyChecks: ConsistencyCheck[];
  missingDocuments: MissingDocument[];
  expiringDocuments: ExpiringDocument[];
  medicalFlags: MedicalFlag[];
  overallStatus: string;
  overallScore: number;
  summary: string;
  recommendations: string[];
  validatedAt: string;
}

export interface SessionDocument {
  id: string;
  fileName: string;
  documentType: string | null;
  applicableRole: string | null;
  holderName: string | null;
  confidence: string | null;
  isExpired: boolean;
  flagCount: number;
  criticalFlagCount: number;
  createdAt: Date;
}

export interface SessionSummary {
  sessionId: string;
  documentCount: number;
  detectedRole: string;
  overallHealth: string;
  documents: SessionDocument[];
  pendingJobs: string[];
}

export interface ExpiringAlertResult {
  id: string;
  fileName: string;
  documentType: string | null;
  holderName: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

interface FlagItem {
  severity?: string;
}

interface ValidityData {
  isExpired?: boolean;
  daysUntilExpiry?: number | null;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    @InjectRepository(Validation)
    private readonly validationRepository: Repository<Validation>,
    @InjectRepository(Extraction)
    private readonly extractionRepository: Repository<Extraction>,
    private readonly sessionService: SessionService,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LLMProvider,
  ) { }

  async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    const session = await this.sessionService.findSessionByIdWithExtractions(sessionId);
    if (!session) throw new BadRequestException('SESSION_NOT_FOUND');

    const extractions = session.extractions || [];

    const documents: SessionDocument[] = extractions.map(ex => {
      const flags = Array.isArray(ex.flagsJson) ? ex.flagsJson as FlagItem[] : [];
      const validity = (ex.validityJson || {}) as ValidityData;

      return {
        id: ex.id,
        fileName: ex.fileName,
        documentType: ex.documentType,
        applicableRole: ex.applicableRole,
        holderName: ex.holderName,
        confidence: ex.confidence,
        isExpired: validity.isExpired === true,
        flagCount: flags.length,
        criticalFlagCount: flags.filter(f => f.severity === 'CRITICAL').length,
        createdAt: ex.createdAt,
      };
    });

    const roleCounts: Record<string, number> = {};
    for (const doc of documents) {
      const role = doc.applicableRole || 'N/A';
      if (role !== 'N/A' && role !== 'BOTH') {
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      }
    }
    const detectedRole = Object.keys(roleCounts).length > 0
      ? Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0][0]
      : 'N/A';

    const hasCriticalFlags = documents.some(d => d.criticalFlagCount > 0);
    const hasExpiredDocs = documents.some(d => d.isExpired);
    const hasWarningFlags = documents.some(d => d.flagCount > 0);
    const hasExpiringSoon = extractions.some(ex => {
      const validity = (ex.validityJson || {}) as ValidityData;
      return typeof validity.daysUntilExpiry === 'number' && validity.daysUntilExpiry <= 90 && validity.daysUntilExpiry > 0;
    });

    let overallHealth = 'OK';
    if (hasCriticalFlags || hasExpiredDocs) {
      overallHealth = 'CRITICAL';
    } else if (hasWarningFlags || hasExpiringSoon) {
      overallHealth = 'WARN';
    }

    const pendingJobs: string[] = [];

    return {
      sessionId,
      documentCount: documents.length,
      detectedRole,
      overallHealth,
      documents,
      pendingJobs,
    };
  }

  async getExpiringDocuments(sessionId: string, withinDays: number): Promise<ExpiringAlertResult[]> {
    const sessionExists = await this.sessionService.findSessionByIdWithExtractions(sessionId);
    if (!sessionExists) throw new BadRequestException('SESSION_NOT_FOUND');

    const expiring = await this.extractionRepository
      .createQueryBuilder('ex')
      .where('ex.session_id = :sessionId', { sessionId })
      .andWhere('ex.status = :status', { status: 'COMPLETE' })
      .andWhere(
        `((ex."validityJson"->>'isExpired')::boolean = true OR (ex."validityJson"->>'daysUntilExpiry')::int <= :withinDays)`,
        { withinDays }
      )
      .orderBy(`(ex."validityJson"->>'daysUntilExpiry')::int`, 'ASC', 'NULLS LAST')
      .getMany();

    return expiring.map(ex => {
      const validity = (ex.validityJson || {}) as ValidityData;
      return {
        id: ex.id,
        fileName: ex.fileName,
        documentType: ex.documentType,
        holderName: ex.holderName,
        isExpired: validity.isExpired === true,
        daysUntilExpiry: validity.daysUntilExpiry ?? null,
      };
    });
  }

  async validateSessionData(sessionId: string): Promise<ValidationResult> {
    const session = await this.sessionService.findSessionByIdWithExtractions(sessionId);
    if (!session) throw new BadRequestException('SESSION_NOT_FOUND');

    if (!session.extractions || session.extractions.length < 2) {
      throw new BadRequestException('INSUFFICIENT_DOCUMENTS');
    }

    const extractionsPayload = session.extractions.map(ex => ({
      documentType: ex.documentType,
      fileName: ex.fileName,
      applicableRole: ex.applicableRole,
      holderName: ex.holderName,
      passportNumber: ex.passportNumber,
      sirbNumber: ex.sirbNumber,
      confidence: ex.confidence,
      fields: ex.fieldsJson,
      validity: ex.validityJson,
      medicalData: ex.medicalDataJson,
      flags: ex.flagsJson,
    }));

    const jsonDocData = JSON.stringify(extractionsPayload, null, 2);
    const validatedAt = new Date();

    let rawLlmResponse = '';
    let parsedData: Record<string, unknown> | null = null;

    try {
      rawLlmResponse = await this.llmProvider.validateSession(jsonDocData);

      try {
        const jsonString = extractJsonFromText(rawLlmResponse);
        parsedData = JSON.parse(jsonString) as Record<string, unknown>;
      } catch {
        this.logger.warn(`Initial parse failed for validation. Attempting repair...`);
        rawLlmResponse = await this.llmProvider.repairDocumentJSON(rawLlmResponse);
        const jsonString = extractJsonFromText(rawLlmResponse);
        parsedData = JSON.parse(jsonString) as Record<string, unknown>;
      }

      const result: ValidationResult = {
        sessionId,
        holderProfile: (parsedData.holderProfile || {}) as HolderProfile,
        consistencyChecks: (Array.isArray(parsedData.consistencyChecks) ? parsedData.consistencyChecks : []) as ConsistencyCheck[],
        missingDocuments: (Array.isArray(parsedData.missingDocuments) ? parsedData.missingDocuments : []) as MissingDocument[],
        expiringDocuments: (Array.isArray(parsedData.expiringDocuments) ? parsedData.expiringDocuments : []) as ExpiringDocument[],
        medicalFlags: (Array.isArray(parsedData.medicalFlags) ? parsedData.medicalFlags : []) as MedicalFlag[],
        overallStatus: typeof parsedData.overallStatus === 'string' ? parsedData.overallStatus : 'CONDITIONAL',
        overallScore: typeof parsedData.overallScore === 'number' ? parsedData.overallScore : 0,
        summary: typeof parsedData.summary === 'string' ? parsedData.summary : '',
        recommendations: (Array.isArray(parsedData.recommendations) ? parsedData.recommendations : []) as string[],
        validatedAt: validatedAt.toISOString(),
      };

      const validationRecord = this.validationRepository.create({
        sessionId,
        resultJson: result as unknown as Record<string, unknown>,
        validatedAt,
      });
      await this.validationRepository.save(validationRecord);

      return result;

    } catch (error) {
      this.logger.error(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('LLM_JSON_PARSE_FAIL');
    }
  }

  async getSessionReport(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.sessionService.findSessionByIdWithExtractions(sessionId);
    if (!session) throw new BadRequestException('SESSION_NOT_FOUND');

    const latestValidation = await this.validationRepository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    const extractions = session.extractions || [];
    const completeExtractions = extractions.filter(ex => ex.status === 'COMPLETE');
    const failedExtractions = extractions.filter(ex => ex.status === 'FAILED');

    const documentInventory = completeExtractions.map(ex => {
      const flags = Array.isArray(ex.flagsJson) ? ex.flagsJson as FlagItem[] : [];
      const validity = (ex.validityJson || {}) as ValidityData;

      return {
        documentType: ex.documentType,
        fileName: ex.fileName,
        holderName: ex.holderName,
        applicableRole: ex.applicableRole,
        confidence: ex.confidence,
        isExpired: validity.isExpired === true,
        daysUntilExpiry: validity.daysUntilExpiry ?? null,
        flagCount: flags.length,
        criticalFlags: flags.filter(f => f.severity === 'CRITICAL').map(f => (f as Record<string, unknown>).message || 'Unknown'),
        extractedAt: ex.createdAt,
      };
    });

    const roleCounts: Record<string, number> = {};
    for (const doc of documentInventory) {
      const role = doc.applicableRole || 'N/A';
      if (role !== 'N/A' && role !== 'BOTH') {
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      }
    }
    const detectedRole = Object.keys(roleCounts).length > 0
      ? Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0][0]
      : 'N/A';

    const holderNames = [...new Set(completeExtractions.map(e => e.holderName).filter(Boolean))];
    const passportNumbers = [...new Set(completeExtractions.map(e => e.passportNumber).filter(Boolean))];
    const sirbNumbers = [...new Set(completeExtractions.map(e => e.sirbNumber).filter(Boolean))];

    const documentTypes = completeExtractions.map(e => e.documentType).filter(Boolean);
    const expiredDocs = documentInventory.filter(d => d.isExpired);
    const expiringSoonDocs = documentInventory.filter(d =>
      typeof d.daysUntilExpiry === 'number' && d.daysUntilExpiry > 0 && d.daysUntilExpiry <= 90
    );

    const hasCriticalIssues = expiredDocs.length > 0 || documentInventory.some(d => d.criticalFlags.length > 0);
    const hasWarnings = expiringSoonDocs.length > 0 || documentInventory.some(d => d.flagCount > 0);

    let hireReadiness = 'READY';
    if (hasCriticalIssues) hireReadiness = 'NOT_READY';
    else if (hasWarnings) hireReadiness = 'CONDITIONAL';

    const validationResult = latestValidation?.resultJson || null;

    return {
      reportType: 'SEAFARER_COMPLIANCE_REPORT',
      generatedAt: new Date().toISOString(),
      sessionId,

      seafarerProfile: {
        names: holderNames,
        passportNumbers,
        sirbNumbers,
        detectedRole,
      },

      documentSummary: {
        totalUploaded: extractions.length,
        successfulExtractions: completeExtractions.length,
        failedExtractions: failedExtractions.length,
        documentTypes,
      },

      documentInventory,

      complianceSnapshot: {
        expiredDocuments: expiredDocs.map(d => ({
          documentType: d.documentType,
          fileName: d.fileName,
        })),
        expiringSoon: expiringSoonDocs.map(d => ({
          documentType: d.documentType,
          fileName: d.fileName,
          daysRemaining: d.daysUntilExpiry,
        })),
      },

      crossDocumentValidation: validationResult,

      decision: {
        hireReadiness,
        reason: hasCriticalIssues
          ? 'Critical compliance issues detected. Review expired documents and critical flags before proceeding.'
          : hasWarnings
            ? 'Minor issues detected. Documents are expiring soon or have warnings that should be addressed.'
            : 'All documents are valid and consistent. Seafarer is ready for deployment.',
      },
    };
  }
}
