/**
 * Central config for the image generation/enhancement model used by dish photo APIs.
 * Default: gemini-2.5-flash-image (broadly available). For best photorealism and grounding,
 * set IMAGE_GENERATION_MODEL=imagen-3.0-generate-002 (Imagen 3) if your Google AI key has access.
 */
const IMAGE_MODEL_ENV = process.env.IMAGE_GENERATION_MODEL?.trim()
export const IMAGE_GENERATION_MODEL_ID =
  IMAGE_MODEL_ENV && IMAGE_MODEL_ENV.length > 0
    ? IMAGE_MODEL_ENV
    : 'gemini-2.5-flash-image'

export function getImageModelGenerateContentUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GENERATION_MODEL_ID}:generateContent?key=${apiKey}`
}

/** Prompt fragment: dish must sit on a visible surface with correct camera angle and contact shadow (no floating). */
export const DISH_GROUNDING_PROMPT = `
SCENE AND CAMERA (CRITICAL): The dish must be clearly placed ON A VISIBLE HORIZONTAL SURFACE (e.g. table, counter, or plate on a table). The surface must be visible in the frame around the plate. Use a slight high angle (about 30–45 degrees) looking DOWN at the table so the surface is clearly seen. Never shoot from below or from mid-air; the food must never look like it is floating in the sky or in empty space.
DISTANCE: Medium close-up so the dish and the surface it sits on fill the frame together. The food should look like it is on a table in front of the camera.
GROUNDING (MANDATORY): The plate or bowl must have a soft, dark CONTACT SHADOW directly underneath it, touching the surface, so it is obvious the dish is resting on the table. The dish must look firmly placed and grounded—never hovering or floating. Photorealistic food photography with the dish clearly resting on a real surface.
`.trim()

/** Prompt fragment: close-up so dish fills frame—no small dish in middle of empty space. */
export const DISH_SCALE_PROMPT = `
FRAMING (CRITICAL): Close-up so the plate and food FILL the frame. The dish should occupy about 80-90% of the image—very little empty table. Do NOT draw the dish small in the center with lots of empty space around it. A pizza = large pizza that nearly fills the image. Never draw a mini or small pizza. Fill the frame with the dish.
`.trim()
