import { IsOptional, IsUUID, IsUrl } from 'class-validator';

export class ExtractDocumentDto {
  @IsOptional()
  @IsUUID('4', { message: 'If provided, sessionId must be a valid UUID v4' })
  sessionId?: string;

  @IsOptional()
  @IsUrl({}, { message: 'If provided, webhookUrl must be a valid URL' })
  webhookUrl?: string;
}

