import { IsOptional, IsUUID } from 'class-validator';

export class ExtractDocumentDto {
  @IsOptional()
  @IsUUID('4', { message: 'If provided, sessionId must be a valid UUID v4' })
  sessionId?: string;
}
