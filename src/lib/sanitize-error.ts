/**
 * Sanitize error messages before sending to clients.
 * Never expose AI model names (Gemini, OpenAI, Claude, etc.) — use generic "AI" wording.
 */
export function sanitizeErrorForClient(message: string): string {
  if (!message || typeof message !== 'string') return 'An error occurred'
  let out = message
  // Replace model/provider names with generic AI wording
  const replacements: [RegExp | string, string][] = [
    [/\bGemini\b/gi, 'AI'],
    [/\bOpenAI\b/gi, 'AI'],
    [/\bClaude\b/gi, 'AI'],
    [/\bAnthropic\b/gi, 'AI'],
    [/\bGoogle AI\b/gi, 'AI'],
    [/issue with (?:the )?AI/gi, 'error with AI mode'],
    [/AI (?:API )?error/gi, 'AI service error'],
    [/error with (?:the )?AI/gi, 'error with AI mode'],
  ]
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement)
  }
  // If the message still looks like it's about a specific model, genericize further
  if (/\b(gemini|openai|claude|anthropic)\b/i.test(out)) {
    return 'An error occurred with AI mode. Please try again.'
  }
  return out
}
