/* Toy catalogue for ClawCaptcha. The art is a set of soft-3D vinyl renders
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

export const TOY_META: Record<ToyId, { label: string; labelZh: string; accent: string }> = {
  duck:    { label: 'yellow duck', labelZh: '小黄鸭',  accent: '#E8A33D' },
  bear:    { label: 'teddy bear',  labelZh: '泰迪熊',  accent: '#C98A4B' },
  panda:   { label: 'panda',       labelZh: '熊猫',    accent: '#52525B' },
  bunny:   { label: 'bunny',       labelZh: '兔子',    accent: '#E58AB0' },
  dino:    { label: 'dinosaur',    labelZh: '恐龙',    accent: '#5CA86A' },
  penguin: { label: 'penguin',     labelZh: '企鹅',    accent: '#3F4854' },
  fox:     { label: 'fox',         labelZh: '狐狸',    accent: '#DD7A3D' },
  frog:    { label: 'frog',        labelZh: '青蛙',    accent: '#69A85C' },
  whale:   { label: 'whale',       labelZh: '鲸鱼',    accent: '#5A93C9' },
  cat:     { label: 'cat',         labelZh: '猫咪',    accent: '#B08D57' },
  puppy:   { label: 'puppy',       labelZh: '小狗',    accent: '#A1785A' },
  unicorn: { label: 'unicorn',     labelZh: '独角兽',  accent: '#B287D8' },
}
