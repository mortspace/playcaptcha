/* Toy catalogue for SataruzCaptcha. The art is a set of soft-3D vinyl renders
 * (PNG with transparent background), served from `assetBase` + `<id>.png`.
 * `accent` tints the toy's name in the challenge line. */

export type ToyId =
  | 'duck'
  | 'bear'
  | 'panda'
  | 'bunny'
  | 'dino'
  | 'penguin'
  | 'fox'
  | 'frog'
  | 'whale'
  | 'cat'
  | 'puppy'
  | 'unicorn'

export const TOY_META: Record<ToyId, { label: string; accent: string }> = {
  duck: { label: 'yellow duck', accent: '#E8A33D' },
  bear: { label: 'teddy bear', accent: '#C98A4B' },
  panda: { label: 'panda', accent: '#52525B' },
  bunny: { label: 'bunny', accent: '#E58AB0' },
  dino: { label: 'dinosaur', accent: '#5CA86A' },
  penguin: { label: 'penguin', accent: '#3F4854' },
  fox: { label: 'fox', accent: '#DD7A3D' },
  frog: { label: 'frog', accent: '#69A85C' },
  whale: { label: 'whale', accent: '#5A93C9' },
  cat: { label: 'cat', accent: '#B08D57' },
  puppy: { label: 'puppy', accent: '#A1785A' },
  unicorn: { label: 'unicorn', accent: '#B287D8' },
}
