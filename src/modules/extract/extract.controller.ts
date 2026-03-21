import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  Query,
  DefaultValuePipe,
  NotFoundException,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ExtractService } from './extract.service';
import { ExtractDocumentDto } from './dto/extract-document.dto';
import { fileValidationOptions } from '../validation/file-upload.constants';
import { SessionService } from '../session/session.service';
import { JobService } from '../job/job.service';
import { Response } from 'express';

@Controller('extract')
export class ExtractController {
  constructor(
    private readonly extractService: ExtractService,
    private readonly sessionService: SessionService,
    private readonly jobService: JobService,
    @InjectQueue('extractionQueue') private readonly extractionQueue: Queue,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', fileValidationOptions))
  async extract(
    @UploadedFile() file: Express.Multer.File,
    @Body() extractDocumentDto: ExtractDocumentDto,
    @Query('mode', new DefaultValuePipe('sync')) mode: 'sync' | 'async',
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('File is required. Should be passed as "file" field in form-data.');
    }

    let sessionId = extractDocumentDto?.sessionId;
    let session;
    if (sessionId) {
      session = await this.sessionService.findSessionById(sessionId);
      if (!session) {
        throw new NotFoundException(`Session with ID ${sessionId} not found`);
      }
    } else {
      session = await this.sessionService.createSession();
      sessionId = session.id;
    }

    if (mode === 'async') {
      const jobEntity = await this.jobService.createJob(sessionId);
      
      const fileData = {
        originalname: file.originalname,
        mimetype: file.mimetype,
        bufferBase64: file.buffer.toString('base64'),
      };

      await this.extractionQueue.add('extractDocument', {
        jobId: jobEntity.id,
        sessionId: sessionId,
        fileData,
      }, { jobId: jobEntity.id });

      res.status(HttpStatus.ACCEPTED); // Explicit HTTP 202
      return {
        jobId: jobEntity.id,
        sessionId: sessionId,
        status: 'QUEUED',
        pollUrl: `/api/jobs/${jobEntity.id}`,
        estimatedWaitMs: 6000,
      };
    } else {
      // Sync processing
      const outcome = await this.extractService.extractDocument(file, sessionId);
      const extraction = outcome.extraction;
      
      if (outcome.isDuplicate) {
        res.setHeader('X-Deduplicated', 'true');
      }

      if (extraction.status === 'FAILED') {
        let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        if (extraction.errorCode === 'LLM_JSON_PARSE_FAIL') statusCode = HttpStatus.UNPROCESSABLE_ENTITY; // 422
        else if (extraction.errorCode === 'LLM_API_ERROR' && extraction.errorMessage?.includes('429')) statusCode = HttpStatus.TOO_MANY_REQUESTS; // 429
        else if (extraction.errorCode === 'TIMEOUT') statusCode = HttpStatus.GATEWAY_TIMEOUT;
        
        throw new HttpException({
          error: extraction.errorCode || 'INTERNAL_ERROR',
          message: extraction.errorMessage || 'Document extraction failed. The raw response has been stored for review.',
          extractionId: extraction.id,
          retryAfterMs: null as number | null,
        }, statusCode);
      }

      res.status(HttpStatus.OK);
      return extraction;
    }
  }
}
