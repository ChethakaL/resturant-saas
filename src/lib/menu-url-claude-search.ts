import Anthropic from '@anthropic-ai/sdk'

/**
 * Uses Anthropic's built-in web_search tool (same approach as cantara-next digital presence).
 * Works for JavaScript-rendered menu sites where server fetch / Gemini URL Context fail.
 */
export async function extractMenuTextWithClaudeWebSearch(
  url: string,
  options: {
    apiKey: string
    categoryNames: string[]
    extractJsonSchema: string
  }
): Promise<string> {
  const categoryHint =
    options.categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${options.categoryNames.join(', ')}.`
      : ''

  const prompt = `You are extracting a restaurant menu from a public digital menu link.

${categoryHint}

Use web_search to open and read this exact menu URL:
${url}

This may be a JavaScript-rendered digital menu (e.g. mynu.app). Browse all visible category tabs/sections and extract EVERY menu item you can see with name, description, price, and categoryName.

Return ONLY a valid JSON array of menu items. No markdown fences, no commentary.
${options.extractJsonSchema}

Rules:
- Include all categories visible on the page (Breakfast, Soups, Appetizers, etc.).
- Keep prices as numbers exactly as shown on the page (usually IQD).
- Do not return an empty array if menu items are visible.
- Extract as many items as the page shows; do not stop after the first category.`

  const client = new Anthropic({ apiKey: options.apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    temperature: 0,
    tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlocks = response.content.filter((block) => block.type === 'text')
  const rawText = textBlocks
    .map((block) => ('text' in block ? block.text : ''))
    .join('\n')
    .trim()

  if (!rawText) {
    throw new Error('AI web search returned an empty response for this menu URL.')
  }

  return rawText
}
