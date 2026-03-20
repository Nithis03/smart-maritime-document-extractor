import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExtractService } from './extract.service';
import { ExtractDocumentDto } from './dto/extract-document.dto';
import { fileValidationOptions } from '../validation/file-upload.constants';

@Controller('extract')
export class ExtractController {
  constructor(private readonly extractService: ExtractService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', fileValidationOptions))
  async extract(
    @UploadedFile() file: Express.Multer.File,
    @Body() extractDocumentDto: ExtractDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required. Should be passed as "file" field in form-data.');
    }

    return this.extractService.extractDocument(file, extractDocumentDto.sessionId);
  }
}
