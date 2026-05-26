import Anthropic from '@anthropic-ai/sdk'

const WEB_SEARCH_TOOL_CONFIGS = [
  {
    type: 'web_search_20260209' as const,
    name: 'web_search',
    max_uses: 8,
    allowed_callers: ['direct'] as const,
  },
  {
    type: 'web_search_20250305' as const,
    name: 'web_search',
  },
] as const

function getClaudeWebSearchModels(): string[] {
  const fromEnv =
    process.env.ANTHROPIC_MENU_IMPORT_MODEL?.trim() ||
    process.env.ANTHROPIC_CLAUDE_MODEL?.trim() ||
    process.env.MONTHLY_SALES_CLAUDE_MODEL?.trim()

  const defaults = [
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    // Legacy — some accounts still have it; try last
    'claude-sonnet-4-20250514',
  ]

  if (fromEnv) {
    return [fromEnv, ...defaults.filter((model) => model !== fromEnv)]
  }
  return defaults
}

function isClaudeModelNotFound(error: unknown): boolean {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined
  const message = error instanceof Error ? error.message : String(error)
  return (
    status === 404 ||
    /not_found_error|model:\s*claude|model not found|does not exist/i.test(message)
  )
}

function buildMenuWebSearchPrompt(
  url: string,
  categoryNames: string[],
  extractJsonSchema: string
): string {
  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${categoryNames.join(', ')}.`
      : ''

  return `You are extracting a restaurant menu from a public digital menu link.

${categoryHint}

Use web_search to open and read this exact menu URL:
${url}

This may be a JavaScript-rendered digital menu (e.g. mynu.app). Browse all visible category tabs/sections and extract EVERY menu item you can see with name, description, price, and categoryName.

Return ONLY a valid JSON array of menu items. No markdown fences, no commentary.
${extractJsonSchema}

Rules:
- Include all categories visible on the page (Breakfast, Soups, Appetizers, etc.).
- Keep prices as numbers exactly as shown on the page (usually IQD).
- Do not return an empty array if menu items are visible.
- Extract as many items as the page shows; do not stop after the first category.`
}

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
  const client = new Anthropic({ apiKey: options.apiKey })
  const prompt = buildMenuWebSearchPrompt(url, options.categoryNames, options.extractJsonSchema)
  const models = getClaudeWebSearchModels()
  let lastError: unknown

  for (const model of models) {
    for (const toolConfig of WEB_SEARCH_TOOL_CONFIGS) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 16384,
          temperature: 0,
          tools: [toolConfig as any],
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

        console.log(
          `[import-from-url] Claude web search OK (model=${model}, tool=${toolConfig.type})`
        )
        return rawText
      } catch (error) {
        lastError = error
        if (isClaudeModelNotFound(error)) {
          console.warn(
            `[import-from-url] Claude model/tool unavailable (${model}, ${toolConfig.type}), trying next...`
          )
          break // next model
        }
        console.warn(
          `[import-from-url] Claude web search failed (${model}, ${toolConfig.type}):`,
          error instanceof Error ? error.message : error
        )
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('AI web search failed for all configured Claude models.')
}

export { isClaudeModelNotFound }
