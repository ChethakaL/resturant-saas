/**
 * Sanitize error messages before sending to clients.
 * Strip provider, model, and internal service names — plain language only.
 */
export function sanitizeErrorForClient(message: string): string {
  if (!message || typeof message !== 'string') return 'An error occurred'
  if (/503|Service Unavailable|high demand|try again later|overload/i.test(message)) {
    return 'Please wait a minute and try again.'
  }
  let out = message
  const replacements: [RegExp | string, string][] = [
    [/\bTavily\b/gi, ''],
    [/TAVILY_API_KEY/gi, ''],
    [/\bGemini\b/gi, ''],
    [/\bOpenAI\b/gi, ''],
    [/\bClaude\b/gi, ''],
    [/\bAnthropic\b/gi, ''],
    [/\bGoogle AI\b/gi, ''],
    [/\bGoogleGenerativeAI\b/gi, ''],
    [/URL [Cc]ontext/g, 'menu link'],
    [/fast pass/gi, ''],
    [/web search/gi, 'menu import'],
    [/generativelanguage\.googleapis\.com[^\s]*/gi, ''],
    [/models\/gemini[^\s]*/gi, ''],
    [/\bgemini[\d.-]*\w*/gi, ''],
    [/\bAI (?:API )?key\b/gi, 'service'],
    [/\bAPI key\b/gi, 'service'],
    [/\bAI\b/gi, ''],
    [/\s{2,}/g, ' '],
  ]
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement)
  }
  out = out.trim()
  if (!out || /\b(gemini|openai|claude|anthropic|tavily)\b/i.test(out)) {
    return 'Something went wrong. Please try again.'
  }
  return out
}
