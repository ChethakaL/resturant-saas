export type IserveQualityLevel = 'standard' | 'premium' | 'luxury'
export type IserveEnhancementBackgroundMode = 'soft_bokeh' | 'full_blur' | 'clean_only'

type GenerationCategoryKey =
  | 'hot_beverages'
  | 'cold_beverages'
  | 'starters'
  | 'main_courses'
  | 'burgers'
  | 'pizza'
  | 'desserts'
  | 'breakfast'

type EnhancementColorKey =
  | 'grills_meats'
  | 'salads_vegetables'
  | 'desserts_pastries'
  | 'cold_beverages'
  | 'hot_beverages'
  | 'seafood'
  | 'rice_pasta'

type EnhancementSharpnessKey =
  | 'grills_meats'
  | 'soups_sauces'
  | 'burgers_sandwiches'
  | 'desserts_cakes'
  | 'salads'
  | 'beverages'
  | 'pizza'

type EnhancementTextureKey =
  | 'hot_coffee'
  | 'cold_drinks'
  | 'grilled_meat'
  | 'steak'
  | 'pasta'
  | 'burger'
  | 'soup'
  | 'desserts'
  | 'kunafa_baklava'
  | 'salads'
  | 'pizza'
  | 'eggs'

type LightingSpec = {
  sourceType: string
  direction: string
  temperature: string
}

const generationTemplates: Record<GenerationCategoryKey, string> = {
  hot_beverages:
    `[Drink Name], professional food photography, 15 degree angle, warm soft side lighting,
dark wooden surface, shallow depth of field with bokeh background, visible steam rising,
warm tones, cozy atmosphere, ceramic cup with saucer, artisanal presentation,
high resolution, restaurant quality, appetizing`,
  cold_beverages:
    `[Drink Name], professional food photography, eye level angle, soft backlight or side lighting,
white marble or light clean surface, shallow depth of field, condensation droplets on glass,
vibrant fresh colors, ice cubes visible, garnish on rim, straw, crystal clear glass,
fresh and energetic mood, high resolution, restaurant quality, thirst-inducing`,
  starters:
    `[Dish Name], professional food photography, 50 degree angle, bright natural soft side lighting,
white marble or light wooden surface, medium shallow depth of field, vibrant fresh colors,
fresh herb garnish, sauce detail visible, colorful ingredients, clean elegant plating,
appetizing fresh mood, high resolution, restaurant quality`,
  main_courses:
    `[Dish Name], professional food photography, 45 degree angle, dramatic soft side lighting,
dark wooden or slate surface, shallow depth of field with bokeh, rich deep colors,
glistening sauce, steam if applicable, fresh herb garnish, char marks visible on grills,
elegant restaurant plating, premium indulgent mood, high resolution, Michelin quality`,
  burgers:
    `[Burger/Sandwich Name], professional food photography, 50 degree angle, warm bright side lighting,
dark wooden surface or kraft paper, shallow depth of field, layers clearly visible,
melted cheese dripping, toasted sesame bun, fresh lettuce and tomato, sauce detail,
bold indulgent mood, high resolution, restaurant quality, crave-worthy`,
  pizza:
    `[Pizza Name], professional food photography, overhead angle for whole pizza or 45 degree
for slice, warm bright side lighting, dark wooden board surface, medium depth of field,
crispy charred crust, melted bubbling cheese, generous toppings, fresh basil leaves,
rustic warm mood, high resolution, restaurant quality, appetizing`,
  desserts:
    `[Dessert Name], professional food photography, 45 degree angle, soft bright natural lighting,
white marble or pastel surface, shallow depth of field with dreamy bokeh,
layers and texture clearly visible, sauce drizzle or dusted powder, fresh berry or mint garnish,
elegant indulgent mood, high resolution, patisserie quality, tempting`,
  breakfast:
    `[Breakfast Item], professional food photography, 50 degree angle, bright warm natural morning lighting,
white linen or light wooden surface, medium depth of field, fresh vibrant colors,
steam if applicable, coffee cup as prop in background, fresh fruit side,
warm morning mood, high resolution, restaurant quality, inviting`,
}

const categoryKeywords: Array<{ key: GenerationCategoryKey; keywords: string[] }> = [
  { key: 'pizza', keywords: ['pizza', 'margherita', 'pepperoni', 'calzone'] },
  { key: 'burgers', keywords: ['burger', 'sandwich', 'wrap', 'hot dog', 'panini'] },
  { key: 'desserts', keywords: ['dessert', 'cake', 'cheesecake', 'ice cream', 'kunafa', 'baklava', 'pastry', 'sweet'] },
  { key: 'breakfast', keywords: ['breakfast', 'brunch', 'eggs', 'benedict', 'pancake', 'ful', 'medames'] },
  { key: 'hot_beverages', keywords: ['coffee', 'tea', 'chai', 'espresso', 'cappuccino', 'latte', 'americano', 'mocha', 'hot chocolate'] },
  { key: 'cold_beverages', keywords: ['juice', 'smoothie', 'milkshake', 'iced', 'soda', 'soft drink', 'cold drink', 'mocktail'] },
  { key: 'starters', keywords: ['starter', 'appetizer', 'salad', 'soup', 'mezze', 'dip', 'spring roll', 'bruschetta', 'hummus'] },
  { key: 'main_courses', keywords: ['main', 'course', 'grill', 'grilled', 'pasta', 'rice', 'kebab', 'steak', 'seafood', 'chicken', 'fish', 'fillet'] },
]

const lightingByCategory: Record<GenerationCategoryKey, LightingSpec> = {
  hot_beverages: {
    sourceType: 'soft natural light',
    direction: 'left side',
    temperature: 'warm golden',
  },
  cold_beverages: {
    sourceType: 'soft natural light',
    direction: 'from behind',
    temperature: 'cool neutral',
  },
  starters: {
    sourceType: 'soft natural light',
    direction: 'left side',
    temperature: 'neutral white light',
  },
  main_courses: {
    sourceType: 'soft studio light',
    direction: 'left side',
    temperature: 'warm golden',
  },
  burgers: {
    sourceType: 'soft studio light',
    direction: 'left side',
    temperature: 'warm golden',
  },
  pizza: {
    sourceType: 'soft studio light',
    direction: 'left side',
    temperature: 'warm golden',
  },
  desserts: {
    sourceType: 'soft natural light',
    direction: 'left side',
    temperature: 'warm golden',
  },
  breakfast: {
    sourceType: 'soft natural light',
    direction: 'left side',
    temperature: 'warm golden',
  },
}

const colorByKey: Record<EnhancementColorKey, string> = {
  grills_meats: 'Deepen the brown and red tones. Enhance the char color.',
  salads_vegetables: 'Enhance the green freshness. Make the colors look crisp and natural.',
  desserts_pastries: 'Boost the golden and caramel tones. Enhance the richness of the chocolate.',
  cold_beverages: 'Saturate the liquid color. Enhance the clarity of the ice.',
  hot_beverages: 'Deepen the brown coffee tones. Enhance the golden crema color.',
  seafood: 'Enhance the natural pink and white tones. Keep colors accurate and fresh.',
  rice_pasta: 'Enhance the golden and cream tones. Make the sauce look glossy.',
}

const sharpnessByKey: Record<EnhancementSharpnessKey, string> = {
  grills_meats: 'Sharpen the meat texture and char marks on the surface.',
  soups_sauces: 'Sharpen the rim of the bowl and the herb garnish on top.',
  burgers_sandwiches: 'Sharpen the bun texture and the ingredient layers.',
  desserts_cakes: 'Sharpen the surface texture and the garnish detail.',
  salads: 'Sharpen the leaf edges and the ingredient textures.',
  beverages: 'Sharpen the glass rim and the foam or liquid surface detail.',
  pizza: 'Sharpen the crust edges and the topping textures.',
}

const textureByKey: Record<EnhancementTextureKey, string> = {
  hot_coffee: 'Enhance steam visibility. Make the foam texture look rich and velvety.',
  cold_drinks: 'Enhance condensation droplets on the glass. Make ice cubes look crisp and clear.',
  grilled_meat: 'Enhance the char marks. Make the meat surface look juicy and glistening.',
  steak: 'If cut visible, enhance the interior pink color. Sharpen the outer crust texture.',
  pasta: 'Make the sauce look glossy and coating the pasta evenly.',
  burger: 'Enhance the melted cheese appearance. Make the bun look toasted and golden.',
  soup: 'Enhance steam visibility. Make the cream swirl or garnish look defined.',
  desserts: 'Make the sauce or glaze look glossy and rich. Enhance the garnish sharpness.',
  kunafa_baklava: 'Make the syrup look glistening. Enhance the pistachio color and texture.',
  salads: 'Make the dressing look like it is freshly applied. Enhance leaf freshness.',
  pizza: 'Make the cheese look melted and bubbling. Enhance the crust char texture.',
  eggs: 'Enhance the yolk color to a rich golden orange. If runny, make the texture visible.',
}

const outputQualityPhraseByLevel: Record<IserveQualityLevel, string> = {
  standard: 'Final result: professional restaurant food photography, high resolution, appetizing.',
  premium: 'Final result: premium restaurant food photography, magazine-ready, high resolution.',
  luxury: 'Final result: Michelin-quality food photography, fine dining standard, editorial quality.',
}

const backgroundPhraseByMode: Record<IserveEnhancementBackgroundMode, string> = {
  soft_bokeh: 'Soften the background with a subtle bokeh effect, keep it recognizable',
  full_blur: 'Blur the background completely. Keep only the food sharp and in focus.',
  clean_only: 'Clean up the background. Remove distracting objects. Do not blur.',
}

function normalizeText(value?: string | null) {
  return (value ?? '').trim().toLowerCase()
}

function pickGenerationCategory(itemName?: string, category?: string, description?: string): GenerationCategoryKey {
  const haystack = normalizeText(`${itemName ?? ''} ${category ?? ''} ${description ?? ''}`)
  for (const entry of categoryKeywords) {
    if (entry.keywords.some((keyword) => haystack.includes(keyword))) {
      return entry.key
    }
  }
  return 'main_courses'
}

function pickColorKey(categoryKey: GenerationCategoryKey, haystack: string): EnhancementColorKey {
  if (haystack.includes('seafood') || haystack.includes('sea bass') || haystack.includes('fish') || haystack.includes('shrimp') || haystack.includes('salmon')) {
    return 'seafood'
  }
  if (categoryKey === 'hot_beverages') return 'hot_beverages'
  if (categoryKey === 'cold_beverages') return 'cold_beverages'
  if (categoryKey === 'desserts') return 'desserts_pastries'
  if (categoryKey === 'starters' && (haystack.includes('salad') || haystack.includes('vegetable'))) return 'salads_vegetables'
  if (haystack.includes('pasta') || haystack.includes('rice')) return 'rice_pasta'
  return 'grills_meats'
}

function pickSharpnessKey(categoryKey: GenerationCategoryKey, haystack: string): EnhancementSharpnessKey {
  if (categoryKey === 'cold_beverages' || categoryKey === 'hot_beverages') return 'beverages'
  if (categoryKey === 'pizza' || haystack.includes('pizza')) return 'pizza'
  if (categoryKey === 'burgers' || haystack.includes('burger') || haystack.includes('sandwich') || haystack.includes('wrap')) return 'burgers_sandwiches'
  if (categoryKey === 'desserts') return 'desserts_cakes'
  if (categoryKey === 'starters' && (haystack.includes('soup') || haystack.includes('sauce'))) return 'soups_sauces'
  if (categoryKey === 'starters' && haystack.includes('salad')) return 'salads'
  return 'grills_meats'
}

function pickTextureKey(categoryKey: GenerationCategoryKey, haystack: string): EnhancementTextureKey {
  if (haystack.includes('kunafa') || haystack.includes('baklava')) return 'kunafa_baklava'
  if (haystack.includes('egg') || haystack.includes('benedict')) return 'eggs'
  if (haystack.includes('steak')) return 'steak'
  if (haystack.includes('pasta') || haystack.includes('carbonara')) return 'pasta'
  if (haystack.includes('burger')) return 'burger'
  if (haystack.includes('soup')) return 'soup'
  if (haystack.includes('salad')) return 'salads'
  if (haystack.includes('pizza')) return 'pizza'
  if (categoryKey === 'hot_beverages') return 'hot_coffee'
  if (categoryKey === 'cold_beverages') return 'cold_drinks'
  if (categoryKey === 'desserts') return 'desserts'
  return 'grilled_meat'
}

function replaceTemplateLabel(template: string, itemName: string, categoryKey: GenerationCategoryKey) {
  const labelMap: Record<GenerationCategoryKey, string> = {
    hot_beverages: '[Drink Name]',
    cold_beverages: '[Drink Name]',
    starters: '[Dish Name]',
    main_courses: '[Dish Name]',
    burgers: '[Burger/Sandwich Name]',
    pizza: '[Pizza Name]',
    desserts: '[Dessert Name]',
    breakfast: '[Breakfast Item]',
  }

  return template.replace(labelMap[categoryKey], itemName.trim() || 'Dish')
}

export function buildIserveGenerationPrompt(input: {
  itemName?: string
  category?: string
  description?: string
  notes?: string
}) {
  const itemName = input.itemName?.trim() || 'Dish'
  const categoryKey = pickGenerationCategory(input.itemName, input.category, input.description)
  const basePrompt = replaceTemplateLabel(generationTemplates[categoryKey], itemName, categoryKey)
  const notes = input.notes?.trim()
  const prompt = notes ? `${basePrompt}\n\nOptional notes: ${notes}` : basePrompt
  return {
    prompt,
    categoryKey,
  }
}

export function buildIserveEnhancementPrompt(input: {
  itemName?: string
  category?: string
  description?: string
  backgroundMode: IserveEnhancementBackgroundMode
  qualityLevel: IserveQualityLevel
  notes?: string
}) {
  const itemName = input.itemName?.trim() || 'the dish'
  const categoryKey = pickGenerationCategory(input.itemName, input.category, input.description)
  const haystack = normalizeText(`${input.itemName ?? ''} ${input.category ?? ''} ${input.description ?? ''}`)
  const lighting = lightingByCategory[categoryKey]
  const colorKey = pickColorKey(categoryKey, haystack)
  const sharpnessKey = pickSharpnessKey(categoryKey, haystack)
  const textureKey = pickTextureKey(categoryKey, haystack)

  const basePrompt = [
    `Enhance this photo of ${itemName}. Keep the dish exactly as is. Do not alter the food, ingredients, or plating.`,
    `Improve the lighting: ${lighting.sourceType} from the ${lighting.direction}, ${lighting.temperature} tone, reduce harsh shadows.`,
    backgroundPhraseByMode[input.backgroundMode],
    colorByKey[colorKey],
    `${sharpnessByKey[sharpnessKey]} Keep the background soft.`,
    textureByKey[textureKey],
    outputQualityPhraseByLevel[input.qualityLevel],
  ].join('\n')
  const notes = input.notes?.trim()
  const prompt = notes ? `${basePrompt}\n\nOptional notes: ${notes}` : basePrompt

  return {
    prompt,
    categoryKey,
    lighting,
  }
}

export type AutoModePromptCard = {
  id: string
  title: string
  description: string
  prompt: string
}

const autoEnhancementPresetDefs = [
  {
    id: 'enhance-clean-menu',
    title: 'Clean Menu Upgrade',
    description: 'Keeps the real dish the same and gives the photo a clean restaurant-menu finish.',
    backgroundMode: 'clean_only' as const,
    qualityLevel: 'premium' as const,
    notes: undefined,
  },
  {
    id: 'enhance-focus-food',
    title: 'Focus On The Food',
    description: 'Softens the background and keeps attention on the food without changing the dish.',
    backgroundMode: 'soft_bokeh' as const,
    qualityLevel: 'premium' as const,
    notes: undefined,
  },
  {
    id: 'enhance-rich-premium',
    title: 'Richer Premium Look',
    description: 'Adds a richer, more premium feel while preserving the actual food and plating.',
    backgroundMode: 'soft_bokeh' as const,
    qualityLevel: 'premium' as const,
    notes: 'Add a slight warmth to the tones. Improve contrast for a richer, deeper look.',
  },
  {
    id: 'enhance-clean-luxury',
    title: 'Luxury Editorial Finish',
    description: 'Best when you want the uploaded food photo to feel more high-end and polished.',
    backgroundMode: 'clean_only' as const,
    qualityLevel: 'luxury' as const,
    notes: undefined,
  },
]

const readyToUseExamplesByCategory: Record<GenerationCategoryKey, AutoModePromptCard[]> = {
  hot_beverages: [
    {
      id: 'espresso',
      title: 'Espresso',
      description: 'Best when you want a compact, warm coffee shot with crema in focus.',
      prompt: 'Espresso shot, professional food photography, 15 degree angle, warm soft side lighting, dark slate surface, shallow depth of field, thick golden crema on top, small ceramic cup, minimal elegant presentation, high resolution, appetizing',
    },
    {
      id: 'cappuccino',
      title: 'Cappuccino',
      description: 'Good for a cozy coffee look with foam, latte art, and cup details.',
      prompt: 'Cappuccino, professional food photography, 20 degree angle, warm side lighting, dark wood surface, shallow bokeh background, thick foam with latte art, dusted cocoa powder, ceramic cup with saucer, cozy atmosphere, high resolution, restaurant quality',
    },
    {
      id: 'arabic-coffee',
      title: 'Arabic Coffee',
      description: 'Use this for a more traditional and elegant coffee presentation.',
      prompt: 'Arabic coffee in dallah pot with small cup, professional food photography, 30 degree angle, warm golden side lighting, dark marble surface with cardamom pods as props, shallow bokeh, rich golden liquid, traditional elegant presentation, high resolution, appetizing',
    },
  ],
  cold_beverages: [
    {
      id: 'fresh-orange-juice',
      title: 'Fresh Orange Juice',
      description: 'Bright and fresh, with condensation and fruit color clearly visible.',
      prompt: 'Fresh squeezed orange juice, professional food photography, eye level angle, bright soft side lighting, white marble surface, shallow depth of field, vibrant orange color, pulp visible, condensation on glass, orange slice on rim, fresh energetic mood, high resolution, appetizing',
    },
    {
      id: 'iced-coffee',
      title: 'Iced Coffee',
      description: 'Best for layered drinks with ice, condensation, and a clean café feel.',
      prompt: 'Iced latte coffee, professional food photography, eye level angle, soft side backlight, light gray surface, shallow depth of field, layered brown and white, ice cubes, condensation droplets, wide glass with straw, minimal elegant presentation, high resolution, refreshing',
    },
    {
      id: 'mango-smoothie',
      title: 'Mango Smoothie',
      description: 'Good for thick colorful drinks with garnish and a tropical fresh mood.',
      prompt: 'Mango smoothie, professional food photography, eye level angle, bright natural side lighting, white surface, shallow bokeh, vibrant golden yellow color, creamy thick texture, garnished with mango slice on rim, straw, tropical fresh mood, high resolution, appetizing',
    },
  ],
  starters: [
    {
      id: 'caesar-salad',
      title: 'Caesar Salad',
      description: 'Fresh and clean with herbs, dressing, and crisp ingredients showing clearly.',
      prompt: 'Caesar salad, professional food photography, 50 degree angle, bright natural side lighting, white marble surface, medium shallow depth of field, crisp romaine lettuce, golden croutons, parmesan shavings, creamy dressing drizzle, fresh vibrant colors, high resolution, appetizing',
    },
    {
      id: 'hummus',
      title: 'Hummus',
      description: 'Good for dips with garnish, texture, and warm rustic serving details.',
      prompt: 'Hummus with olive oil drizzle, professional food photography, 60 degree angle, soft natural lighting, rustic wooden surface, shallow depth of field, creamy smooth texture, olive oil pool in center, paprika dusting, fresh herbs, pita bread on side, high resolution, appetizing',
    },
    {
      id: 'spring-rolls',
      title: 'Spring Rolls',
      description: 'Best for crispy items where texture and filling need to stand out.',
      prompt: 'Crispy spring rolls, professional food photography, 45 degree angle, bright side lighting, dark slate surface, shallow depth of field, golden crispy texture, cracked open roll showing filling, dipping sauce in small bowl, fresh herbs, high resolution, restaurant quality',
    },
  ],
  main_courses: [
    {
      id: 'grilled-steak',
      title: 'Grilled Steak',
      description: 'Rich and premium, with char marks, juicy texture, and fine plating.',
      prompt: 'Grilled ribeye steak, professional food photography, 45 degree angle, dramatic soft side lighting, dark slate surface, shallow depth of field, perfect char marks, juicy medium-rare interior visible, herb butter melting on top, fresh rosemary garnish, restaurant elegant plating, high resolution, Michelin quality',
    },
    {
      id: 'pasta',
      title: 'Pasta',
      description: 'Ideal when you want glossy sauce, steam, and elegant pasta texture.',
      prompt: 'Spaghetti carbonara, professional food photography, 45 degree angle, soft warm side lighting, dark wooden surface, shallow depth of field, creamy glossy sauce coating pasta, crispy pancetta, fresh parsley, parmesan shavings, twirled elegantly, steam visible, high resolution, appetizing',
    },
    {
      id: 'mixed-kebab',
      title: 'Mixed Kebab',
      description: 'Best for grilled platters with color, char, and a hearty restaurant look.',
      prompt: 'Mixed grilled kebab platter, professional food photography, 45 degree angle, warm dramatic side lighting, dark wooden surface, shallow depth of field, char marks on skewers, juicy meat, colorful grilled peppers and onions, fresh parsley, yogurt dip on side, high resolution, appetizing',
    },
  ],
  burgers: [
    {
      id: 'beef-burger',
      title: 'Beef Burger',
      description: 'Use this when the layers, melted cheese, and sauce need to feel bold and crave-worthy.',
      prompt: 'Gourmet beef burger, professional food photography, 50 degree angle, warm bright side lighting, dark wooden surface, shallow depth of field, juicy beef patty, melted cheddar cheese, toasted sesame bun, fresh lettuce tomato pickles, sauce dripping, indulgent bold mood, high resolution, restaurant quality',
    },
    {
      id: 'club-sandwich',
      title: 'Club Sandwich',
      description: 'Good for stacked sandwiches where layers and clean presentation matter.',
      prompt: 'Club sandwich, professional food photography, 45 degree angle, bright natural side lighting, white marble surface, shallow depth of field, three layers of toasted bread, turkey bacon lettuce tomato, toothpick through center, fries on side, fresh presentation, high resolution, appetizing',
    },
    {
      id: 'wrap',
      title: 'Wrap',
      description: 'Best for wraps with a visible cross-section and fresh colorful filling.',
      prompt: 'Grilled chicken wrap, professional food photography, 45 degree angle, bright side lighting, light wooden surface, cross-section cut showing filling, colorful vegetables and chicken visible, slightly unwrapped, fresh and vibrant, high resolution, restaurant quality',
    },
  ],
  pizza: [
    {
      id: 'margherita',
      title: 'Margherita',
      description: 'Whole-pizza look with basil, cheese, and crust char clearly visible.',
      prompt: 'Margherita pizza, professional food photography, overhead angle, warm bright lighting, dark wooden board, medium depth of field, thin crispy crust with char marks, melted mozzarella, fresh basil leaves, San Marzano tomato sauce, rustic Italian mood, high resolution, appetizing',
    },
    {
      id: 'pepperoni-slice',
      title: 'Pepperoni Slice',
      description: 'Single-slice view when you want thickness, cheese pull, and indulgent detail.',
      prompt: 'Pepperoni pizza slice, professional food photography, 45 degree angle, warm side lighting, dark wooden surface, shallow depth of field, melted cheese pull visible, crispy edges, curled pepperoni, thick satisfying slice, bold indulgent mood, high resolution, restaurant quality',
    },
  ],
  desserts: [
    {
      id: 'chocolate-cake',
      title: 'Chocolate Cake',
      description: 'Best for rich desserts with sauce, garnish, and a tempting plated look.',
      prompt: 'Chocolate lava cake, professional food photography, 45 degree angle, soft bright side lighting, white marble surface, shallow depth of field, warm chocolate oozing from center, powdered sugar dusting, vanilla ice cream scoop on side, mint leaf garnish, indulgent tempting mood, high resolution, patisserie quality',
    },
    {
      id: 'cheesecake',
      title: 'Cheesecake',
      description: 'Clean and elegant dessert style with texture and topping clearly visible.',
      prompt: 'New York cheesecake slice, professional food photography, 45 degree angle, soft natural side lighting, white marble surface, shallow bokeh, creamy smooth texture, strawberry compote on top, graham cracker crust visible, elegant minimal plating, high resolution, patisserie quality',
    },
    {
      id: 'kunafa',
      title: 'Kunafa',
      description: 'Warm Middle Eastern dessert look with syrup, pistachio, and cheese pull.',
      prompt: 'Kunafa bil jibn, professional food photography, 45 degree angle, warm golden side lighting, dark wooden or copper tray surface, shallow depth of field, golden crispy shredded pastry, melted white cheese pull, rose water syrup glistening, crushed pistachio garnish, rich traditional mood, high resolution, appetizing',
    },
  ],
  breakfast: [
    {
      id: 'eggs-benedict',
      title: 'Eggs Benedict',
      description: 'Great for brunch dishes where yolk, sauce, and steam need to show clearly.',
      prompt: 'Eggs Benedict, professional food photography, 45 degree angle, bright warm natural lighting, white marble surface, medium shallow depth of field, runny poached egg cut open, hollandaise sauce drizzle, Canadian bacon on English muffin, fresh chives, steam visible, high resolution, brunch quality',
    },
    {
      id: 'pancakes',
      title: 'Pancakes',
      description: 'Best for warm breakfast shots with height, syrup pour, and inviting softness.',
      prompt: 'Fluffy pancake stack, professional food photography, 45 degree angle, bright soft morning lighting, white marble surface, shallow depth of field, three tall fluffy pancakes, maple syrup pouring from above, butter melting, fresh berries on top, powdered sugar, warm inviting mood, high resolution',
    },
    {
      id: 'ful-medames',
      title: 'Ful Medames',
      description: 'Good for rustic breakfast dishes with garnish and a traditional warm feel.',
      prompt: 'Ful medames in clay bowl, professional food photography, 50 degree angle, warm morning side lighting, rustic wooden surface, medium depth of field, olive oil drizzle, chopped tomatoes and parsley on top, lemon wedge on side, pita bread, traditional warm mood, high resolution, appetizing',
    },
  ],
}

export function getAutoModePromptCards(input: {
  itemName?: string
  category?: string
  description?: string
  mode?: 'generate' | 'enhance'
}) {
  if (input.mode === 'enhance') {
    return {
      categoryKey: pickGenerationCategory(input.itemName, input.category, input.description),
      cards: autoEnhancementPresetDefs.map((preset) => ({
        id: preset.id,
        title: preset.title,
        description: preset.description,
        prompt: buildIserveEnhancementPrompt({
          itemName: input.itemName,
          category: input.category,
          description: input.description,
          backgroundMode: preset.backgroundMode,
          qualityLevel: preset.qualityLevel,
          notes: preset.notes,
        }).prompt,
      })),
    }
  }

  const categoryKey = pickGenerationCategory(input.itemName, input.category, input.description)
  const masterTemplateCard: AutoModePromptCard = {
    id: 'master-template',
    title: 'iServe Master Template',
    description: 'The official category template from the document, adapted to this menu item.',
    prompt: buildIserveGenerationPrompt(input).prompt,
  }

  return {
    categoryKey,
    cards: [masterTemplateCard, ...readyToUseExamplesByCategory[categoryKey]],
  }
}
