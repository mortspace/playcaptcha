/* Toy catalogue for SataruzCaptcha. The art is a set of soft-3D vinyl renders
 * (PNG with transparent background), served from `assetBase` + `<id>.png`.
 * `accent` tints the toy's name in the challenge line. */

export type ToyId =
  | 'cao_yanbing'
  | 'irelia'
  | 'titan'
  | 'frok'
  | 'uriel'
  | 'jormungandr'
  | 'netherworld'
  | 'zhuqing'
  | 'nine'
  | 'samael'
  | 'ratu_salju'
  | 'qingluan'

export const TOY_META: Record<ToyId, { label: string; accent: string }> = {
  cao_yanbing: { label: 'Cao Yanbing', accent: '#C4A055' },
  irelia: { label: 'Irelia', accent: '#7B68EE' },
  titan: { label: 'Titan', accent: '#A9A9A9' },
  frok: { label: 'Frok', accent: '#32CD32' },
  uriel: { label: 'Uriel', accent: '#FF6347' },
  jormungandr: { label: 'Jormungandr', accent: '#228B22' },
  netherworld: { label: 'Netherworld', accent: '#2F4F4F' },
  zhuqing: { label: 'Zhuqing', accent: '#FFD700' },
  nine: { label: '9', accent: '#4169E1' },
  samael: { label: 'Samael', accent: '#DC143C' },
  ratu_salju: { label: 'Ratu Salju', accent: '#B0E0E6' },
  qingluan: { label: 'Qingluan', accent: '#FF69B4' },
}
