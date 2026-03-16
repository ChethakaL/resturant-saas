export const IRAQ_CITIES = [
  'Baghdad',
  'Basra',
  'Erbil',
  'Mosul',
  'Najaf',
  'Karbala',
  'Sulaymaniyah',
  'Duhok',
  'Kirkuk',
  'Nasiriyah',
  'Amarah',
  'Diwaniyah',
  'Kut',
  'Ramadi',
  'Fallujah',
  'Samarra',
  'Tikrit',
  'Baqubah',
  'Zakho',
  'Halabja',
] as const

export type IraqCity = (typeof IRAQ_CITIES)[number]
