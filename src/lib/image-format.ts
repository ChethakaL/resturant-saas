export type ImageOrientation = 'landscape' | 'portrait' | 'square'
export const imageOrientationOptions: {
  value: ImageOrientation
  label: string
  aspect: string
  description: string
}[] = [
  {
    value: 'landscape',
    label: 'Landscape',
    aspect: '16:9',
    description: 'Wide horizontal composition for hero shots or banners.',
  },
  {
    value: 'portrait',
    label: 'Portrait',
    aspect: '9:16',
    description: 'Tall composition that works well for stories or cards.',
  },
  {
    value: 'square',
    label: 'Square',
    aspect: '1:1',
    description: 'Balanced crop for grids and catalog cards.',
  },
]

export const imageOrientationPrompts: Record<ImageOrientation, string> = {
  landscape: 'Horizontal (16:9). CLOSE-UP: the dish must fill the frame—plate and food occupy most of the image, little empty table.',
  portrait: 'Vertical (9:16). CLOSE-UP: the dish must fill the frame—plate and food occupy most of the image.',
  square: 'Square (1:1). CLOSE-UP: the dish must fill the frame—plate and food occupy most of the image.',
}

export const imageOrientationAspectRatios: Record<ImageOrientation, number> = {
  landscape: 16 / 9,
  portrait: 9 / 16,
  square: 1,
}

export type ImageSizePreset = 'small' | 'medium' | 'large'
export const imageSizeOptions: {
  value: ImageSizePreset
  label: string
  pixels: number
  description: string
}[] = [
  {
    value: 'small',
    label: 'Small',
    pixels: 800,
    description: 'Long edge ~800px for thumbnails or cards.',
  },
  {
    value: 'medium',
    label: 'Medium',
    pixels: 1200,
    description: 'Medium resolution around 1200px for menus.',
  },
  {
    value: 'large',
    label: 'Large',
    pixels: 1600,
    description: 'High-resolution ~1600px for hero placements.',
  },
]

export const imageSizePrompts: Record<ImageSizePreset, string> = {
  small: 'Target a finished image where the longest side is around 800 pixels.',
  medium: 'Target a finished image where the longest side is around 1200 pixels.',
  large: 'Target a finished image where the longest side is around 1600 pixels.',
}
