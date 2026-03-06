/**
 * Uses Gemini (vision) to analyze a dish photo and return specific issues + fix
 * instructions. The image model then uses this to correct floating, angle, distance, etc.
 */
const ANALYSIS_PROMPT = `You are a food photography expert. Look at this image and decide: is this the right size for a real dish?

Think step by step:
1. What is the main dish (e.g. pizza, burger)?
2. Are there any other objects in the frame (e.g. a small bowl, container, plate)?
3. Compare sizes: Is the main dish realistically sized? A real restaurant pizza should be MUCH bigger than a small bowl or container. If the pizza looks similar in size to or only slightly bigger than a small container, that is WRONG—the food is too small. The main dish should be a lot bigger than any small object in the scene.
4. Also check: Is the dish floating or elevated? Is the angle wrong?

Answer in two short parts, no bullet points, plain paragraphs:

1. ISSUES: In 1–3 sentences, say what is wrong. Be specific about size: e.g. "The pizza is too small; it should be a lot bigger than the small bowl in the frame" or "The main dish is not realistically sized for a restaurant portion." Also mention floating/elevation/angle if relevant.

2. FIX INSTRUCTIONS: In 1–2 sentences, tell the image model exactly what to do. If size is wrong: say "Make the main dish (pizza/burger) MUCH BIGGER—it must be a lot bigger than any small container in the scene. Realistic restaurant portion size." If floating: say "Place the plate firmly on the table; no gap."

Keep the total response under 180 words. Write in English. Output only the two paragraphs (ISSUES: ... FIX INSTRUCTIONS: ...), no other text.`

export type AnalyzeDishImageResult = {
  issues: string
  fixInstructions: string
  raw: string
}

function parseAnalysisResponse(raw: string): AnalyzeDishImageResult {
  const text = raw.trim()
  const issuesMatch = text.match(/(?:ISSUES?:\s*)([\s\S]*?)(?=FIX\s*INSTRUCTIONS:|$)/i)
  const fixMatch = text.match(/(?:FIX\s*INSTRUCTIONS?:\s*)([\s\S]*?)$/im)
  const issues = issuesMatch?.[1]?.trim() ?? text.slice(0, 200)
  const fixInstructions = fixMatch?.[1]?.trim() ?? ''
  return { issues, fixInstructions, raw: text }
}

/**
 * Sends the dish image to Gemini (text model with vision), gets back issues and fix
 * instructions. Returned text is meant to be appended to the enhancement prompt.
 */
export async function analyzeDishImageForFixes(imageData: string): Promise<AnalyzeDishImageResult | null> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) return null

  const base64Data = (imageData.includes(',') ? imageData.split(',')[1] : imageData)?.trim() ?? ''
  const mimeType = imageData.includes(',')
    ? imageData.split(',')[0].split(':')[1]?.split(';')[0]?.trim()
    : 'image/jpeg'
  const geminiMime = mimeType?.startsWith('image/') ? mimeType : 'image/jpeg'
  if (!base64Data || base64Data.length < 100) return null

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: geminiMime, data: base64Data } },
      { text: ANALYSIS_PROMPT },
    ])
    const response = result.response
    const text = response.text?.()?.trim()
    if (!text) return null
    console.log('[analyze-dish-image] analysis length=%d', text.length)
    return parseAnalysisResponse(text)
  } catch (err) {
    console.warn('[analyze-dish-image] analysis failed', err)
    return null
  }
}

/**
 * Format the analysis so the image model can use it in the prompt.
 */
export function formatAnalysisForPrompt(analysis: AnalyzeDishImageResult): string {
  return [
    'ANALYSIS OF THIS PHOTO (you must fix these):',
    analysis.issues,
    'FIX INSTRUCTIONS (apply in your output):',
    analysis.fixInstructions,
    'Apply these fixes so the dish rests on the surface, is not floating or elevated, and has correct distance/angle.',
  ].join('\n')
}

/** Returns true if the analysis indicates the dish is still floating / elevated / not on surface (so we should run a correction pass). */
export function analysisSaysStillFloating(analysis: AnalyzeDishImageResult | null): boolean {
  if (!analysis?.issues) return false
  const t = (analysis.issues + ' ' + analysis.raw).toLowerCase()
  return (
    t.includes('float') ||
    t.includes('elevat') ||
    t.includes('hover') ||
    t.includes('not resting') ||
    t.includes('gap') ||
    t.includes('above the table') ||
    t.includes('off the table') ||
    t.includes('detached')
  )
}

/** Returns true if the analysis says the food is too small or not realistic size (so we should run a scale correction). */
export function analysisSaysTooSmall(analysis: AnalyzeDishImageResult | null): boolean {
  if (!analysis?.issues) return false
  const t = (analysis.issues + ' ' + analysis.raw + ' ' + (analysis.fixInstructions ?? '')).toLowerCase()
  return (
    t.includes('too small') ||
    t.includes('miniature') ||
    t.includes('tiny') ||
    t.includes('undersized') ||
    t.includes('small scale') ||
    t.includes('unrealistically small') ||
    t.includes('not realistic') ||
    t.includes('bigger than') || // e.g. "pizza should be bigger than the bowl"
    t.includes('much bigger') ||
    t.includes('personal-sized') ||
    t.includes('similar in size') ||
    t.includes('slightly bigger')
  )
}
