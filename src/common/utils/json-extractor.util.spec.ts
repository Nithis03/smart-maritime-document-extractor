import { extractJsonFromText } from './json-extractor.util';
import { BadRequestException } from '@nestjs/common';

describe('extractJsonFromText', () => {
  it('should extract valid JSON cleanly when there is no surrounding text', () => {
    const rawText = '{"key":"value"}';
    const result = extractJsonFromText(rawText);
    expect(result).toBe('{"key":"value"}');
  });

  it('should extract JSON from markdown code fences', () => {
    const rawText = 'Here is the response:\n```json\n{\n  "status": "success"\n}\n```\nHave a nice day!';
    const result = extractJsonFromText(rawText);
    expect(result).toBe('{\n  "status": "success"\n}');
  });

  it('should handle complex nested JSON with multiple braces', () => {
    const rawText = 'Prefix text { "data": { "nested": "value", "array": [1, 2, 3] } } Suffix text';
    const result = extractJsonFromText(rawText);
    expect(result).toBe('{ "data": { "nested": "value", "array": [1, 2, 3] } }');
  });

  it('should extract JSON even if it starts with an array bracket (if adapted, but currently expects curly braces)', () => {
    const rawText = 'Prefix { "array": [1, 2, 3] } Suffix';
    const result = extractJsonFromText(rawText);
    expect(result).toBe('{ "array": [1, 2, 3] }');
  });

  it('should throw BadRequestException when payload is empty', () => {
    expect(() => extractJsonFromText('')).toThrow(BadRequestException);
    expect(() => extractJsonFromText(null as unknown as string)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when no opening brace is found', () => {
    const rawText = 'This is just a normal string without any JSON objects inside.';
    expect(() => extractJsonFromText(rawText)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when no closing brace is found', () => {
    const rawText = 'This string has an opening { brace but no closing one.';
    expect(() => extractJsonFromText(rawText)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when closing brace appears before opening brace', () => {
    const rawText = 'This string has a closing } brace before the opening { brace.';
    expect(() => extractJsonFromText(rawText)).toThrow(BadRequestException);
  });
});
