/**
 * Safely extracts a JSON string from a larger block of text.
 * Especially useful when dealing with LLM responses that might include markdown like ```json ... ```
 * 
 * @param text The raw response text
 * @returns The parsed JSON object or null if parsing fails
 */
export function extractJsonFromText(text: string): Record<string, unknown> | null {
  try {
    // Basic clean to remove markdown formatting if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '');
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/```$/, '');
    }

    return JSON.parse(cleaned.trim());
  } catch (error) {
    // If straightforward parsing fails, try to find a JSON block via regex
    try {
      const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch {
      // Continue to return null below
    }
  }

  return null;
}
