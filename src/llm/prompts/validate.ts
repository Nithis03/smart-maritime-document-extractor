export const VALIDATE_PROMPT_VERSION = '1.0.0';

export function buildValidatePrompt(extractionsData: string): string {
  return `You are an expert maritime document compliance auditor with deep knowledge of STCW, MARINA, IMO, and international seafarer certification standards.

A seafarer has uploaded multiple documents to their session. I am providing you the extracted data for each document in JSON format.

Your task is to perform a comprehensive cross-document compliance assessment:

1. BUILD A UNIFIED HOLDER PROFILE
   - Consolidate the holder's full name, date of birth, and nationality from all documents.
   - If there are discrepancies (e.g., name spelled differently across documents), note them.

2. CONSISTENCY CHECKS
   - Compare holder name across all documents — are they consistent?
   - Compare nationality, date of birth, passport number, SIRB number across overlapping docs.
   - Cross-reference issuing authorities with document types.
   - Flag any mismatch as inconsistent with a clear explanation.

3. MISSING DOCUMENTS
   - Based on the seafarer's detected role (DECK or ENGINE), identify any STCW-required documents that are missing from the session.
   - Common required documents: COC, SIRB, Passport, PEME, Drug Test, Basic Safety Training (COP_BT), PSCRB (COP_PSCRB), Advanced Firefighting (COP_AFF), MEFA/MECA, SSO, Yellow Fever.

4. EXPIRING DOCUMENTS
   - Identify any documents expiring within 90 days from today's date.
   - Include documents that are already expired.

5. MEDICAL FLAGS
   - Identify any medical concerns from PEME, Drug Test, or other medical documents.
   - Flag fitness restrictions, positive drug tests, or special medical conditions.

6. OVERALL STATUS
   - APPROVED: All required documents present, consistent, valid, no critical flags.
   - CONDITIONAL: Minor issues found (expiring soon, minor inconsistencies) but generally acceptable.
   - REJECTED: Critical issues (expired required certs, failed drug test, major inconsistencies, missing required documents).

7. OVERALL SCORE
   - Assign a numeric score from 0-100 representing the overall compliance health of this seafarer's document set.

Return ONLY a valid JSON object with NO markdown, NO code fences, NO preamble. Match this exact schema:

{
  "holderProfile": {
    "fullName": "string",
    "dateOfBirth": "string or null",
    "nationality": "string or null",
    "passportNumber": "string or null",
    "sirbNumber": "string or null",
    "detectedRole": "DECK | ENGINE | BOTH | N/A"
  },
  "consistencyChecks": [
    { "field": "string", "isConsistent": true, "documents": ["DOC_TYPE_A", "DOC_TYPE_B"], "details": "string" }
  ],
  "missingDocuments": [
    { "documentType": "string", "reason": "string", "severity": "CRITICAL | HIGH | MEDIUM" }
  ],
  "expiringDocuments": [
    { "documentType": "string", "expiryDate": "string", "daysRemaining": 0, "isExpired": true }
  ],
  "medicalFlags": [
    { "source": "PEME | DRUG_TEST | YELLOW_FEVER", "flag": "string", "severity": "CRITICAL | HIGH | MEDIUM | LOW" }
  ],
  "overallStatus": "APPROVED | CONDITIONAL | REJECTED",
  "overallScore": 0,
  "summary": "Two to three sentence summary of the compliance assessment.",
  "recommendations": ["string"]
}

Here is the document extraction data:
${extractionsData}`;
}
