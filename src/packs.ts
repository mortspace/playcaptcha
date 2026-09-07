import { TOY_META } from './toys.ts'

export interface PackItem {
  id: string
  w: number
}

export interface CaptchaPack {
  id: string
  label: string
  assetBase: string
  items: PackItem[]
  meta: Record<string, { label: string; accent: string }>
  actionSkin?: 'pokeball'
}

export const CUTE_PACK: CaptchaPack = {
  id: 'cute',
  label: 'Cuties',
  assetBase: '/assets/toys/',
  items: [
    { id: 'duck', w: 96 }, { id: 'bear', w: 92 }, { id: 'panda', w: 86 },
    { id: 'bunny', w: 80 }, { id: 'dino', w: 92 }, { id: 'penguin', w: 84 },
    { id: 'fox', w: 80 }, { id: 'frog', w: 80 }, { id: 'whale', w: 90 },
    { id: 'cat', w: 78 }, { id: 'puppy', w: 84 }, { id: 'unicorn', w: 82 },
  ],
  meta: TOY_META,
}
