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

function getClaudeModels(): string[] {
  const fromEnv =
    process.env.ANTHROPIC_MENU_IMPORT_MODEL?.trim() ||
    process.env.ANTHROPIC_CLAUDE_MODEL?.trim() ||
    process.env.MONTHLY_SALES_CLAUDE_MODEL?.trim()

  const defaults = [
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
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

/** Claude web_search often returns prose explaining it cannot read JS SPAs — not a real menu. */
export function isClaudeWebSearchRefusal(text: string): boolean {
  if (!text.trim()) return true
  return /unable to retrieve|cannot access|can't access|not accessible|javascript-rendered|client-side|dynamic javascript|cannot fabricate|i'm sorry|i am sorry|no indexable content|headless browser|puppeteer|playwright/i.test(
    text
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

Extract EVERY menu item from the page with name, description, price, and categoryName.

Return ONLY a valid JSON array. No markdown fences, no commentary, no apology text.
${extractJsonSchema}

Rules:
- Browse all category sections (Breakfast, Soups, Appetizers, etc.).
- Keep prices as numbers exactly as shown (usually IQD).
- Do not return an empty array if menu items are visible.
- If you truly cannot access the page, return the single-item array: [{"name":"__INACCESSIBLE__","description":"","price":0,"categoryName":""}]`
}

function buildMenuParsePrompt(
  pageText: string,
  categoryNames: string[],
  extractJsonSchema: string
): string {
  const categoryHint =
    categoryNames.length > 0
      ? `Available categories (map to closest when possible): ${categoryNames.join(', ')}.`
      : ''

  return `You are extracting a restaurant menu from page text that was already fetched from a digital menu website.

${categoryHint}

Extract EVERY menu item with full menu-item form data.
Return ONLY a valid JSON array. No markdown fences, no commentary.
${extractJsonSchema}

Page text:
"""
${pageText.slice(0, 75000)}
"""
`
}

async function callClaudeText(
  client: Anthropic,
  model: string,
  prompt: string,
  maxTokens = 16384
): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('\n')
    .trim()
}

/**
 * Parse already-fetched menu page text (e.g. from Tavily) — no web_search tool.
 * This is what works for mynu.app and other JS-rendered menus in production.
 */
export async function extractMenuTextWithClaudeFromPageText(
  pageText: string,
  options: {
    apiKey: string
    categoryNames: string[]
    extractJsonSchema: string
  }
): Promise<string> {
  const client = new Anthropic({ apiKey: options.apiKey })
  const prompt = buildMenuParsePrompt(pageText, options.categoryNames, options.extractJsonSchema)
  const models = getClaudeModels()
  let lastError: unknown

  for (const model of models) {
    try {
      const rawText = await callClaudeText(client, model, prompt)
      if (!rawText || isClaudeWebSearchRefusal(rawText)) {
        throw new Error('Claude returned no usable menu JSON from page text.')
      }
      console.log(`[import-from-url] Claude page-text parse OK (model=${model})`)
      return rawText
    } catch (error) {
      lastError = error
      if (isClaudeModelNotFound(error)) {
        console.warn(`[import-from-url] Claude parse model unavailable (${model}), trying next...`)
        continue
      }
      console.warn(
        `[import-from-url] Claude page-text parse failed (${model}):`,
        error instanceof Error ? error.message : error
      )
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Claude could not parse menu page text.')
}

/**
 * Web search — only useful for static HTML menus. JS apps (mynu.app) will refuse.
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
  const models = getClaudeModels()
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

        const rawText = response.content
          .filter((block) => block.type === 'text')
          .map((block) => ('text' in block ? block.text : ''))
          .join('\n')
          .trim()

        if (!rawText || isClaudeWebSearchRefusal(rawText)) {
          throw new Error('Claude web search could not read this JavaScript menu URL.')
        }

        if (/__INACCESSIBLE__/.test(rawText)) {
          throw new Error('Claude web search could not access this menu URL.')
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
          break
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
    : new Error('Claude web search failed for all configured models.')
}

export { isClaudeModelNotFound }
