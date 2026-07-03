# Asset Replacement Guide for sataruz-captcha

## Overview
This project has been successfully rebranded from `playcaptcha` to `sataruz-captcha`. All code references have been updated. This document outlines the asset files that still need to be replaced with your custom versions.

## Rebranding Changes Completed ✓

### Code Changes
- [x] Package name: `playcaptcha` → `sataruz-captcha`
- [x] Component name: `ClawCaptcha` → `SataruzCaptcha`
- [x] Component file: `ClawCaptcha.tsx` → `SataruzCaptcha.tsx`
- [x] CSS file: `clawcaptcha.css` → `sataruz-captcha.css`
- [x] tsup.config.ts updated with new file references
- [x] index.ts exports updated
- [x] README.md updated with new component usage
- [x] All internal comments updated
- [x] package.json metadata updated with author: "YoshCasaster & mortspace"

## Assets Requiring Replacement

### 1. Logo File
**Location:** `assets/sataruz-captcha.svg`  
**Current Status:** Old logo renamed (ready for replacement)  
**What to do:** Replace with your new **sataruz-captcha** logo SVG

**Referenced in:**
- Component modal dialog (`src/SataruzCaptcha.tsx` line 941)
- Documentation

### 2. Toy Images (12 total)
**Location:** `assets/toys/`  
**Current Files:**
- `bear.png` - Teddy bear
- `bunny.png` - Bunny  
- `cat.png` - Cat
- `dino.png` - Dinosaur
- `duck.png` - Yellow duck
- `fox.png` - Fox
- `frog.png` - Frog
- `panda.png` - Panda
- `penguin.png` - Penguin
- `puppy.png` - Puppy
- `unicorn.png` - Unicorn
- `whale.png` - Whale

**What to do:** Replace each PNG with your custom toy artwork. You can modify the toy IDs in `src/toys.ts` if you want different toy types.

### Customizing Toy Options

If you want to use different toys, edit `src/toys.ts`:

```typescript
export type ToyId = 
  | 'duck'
  | 'bear'
  // ... modify IDs as needed
  
export const TOY_META: Record<ToyId, { label: string; accent: string }> = {
  duck: { label: 'yellow duck', accent: '#E8A33D' },
  // ... update labels and accent colors
}
```

And in `src/SataruzCaptcha.tsx`, update the `TOY_SET` array (around line 39):

```typescript
const TOY_SET: Array<{ toy: ToyId; w: number }> = [
  { toy: 'duck', w: 96 },
  // ... adjust widths as needed
]
```

## File Structure
```
sataruz-captcha/
├── src/
│   ├── SataruzCaptcha.tsx     ✓ Updated
│   ├── sataruz-captcha.css    ✓ Updated
│   ├── toys.ts                ✓ Updated
│   ├── clawArt.ts             (No changes needed)
│   └── index.ts               ✓ Updated
├── assets/
│   ├── sataruz-captcha.svg    ← REPLACE WITH YOUR LOGO
│   └── toys/
│       ├── bear.png           ← REPLACE WITH YOUR TOYS
│       ├── bunny.png
│       ├── cat.png
│       ├── dino.png
│       ├── duck.png
│       ├── fox.png
│       ├── frog.png
│       ├── panda.png
│       ├── penguin.png
│       ├── puppy.png
│       ├── unicorn.png
│       └── whale.png
├── package.json               ✓ Updated
└── README.md                  ✓ Updated
```

## Next Steps for NPM Publishing

1. **Replace Assets:** Upload your custom logo and toy images
2. **Build the project:**
   ```bash
   npm run build
   ```
3. **Test locally:** Verify the component works with your assets
4. **Publish to NPM:**
   ```bash
   npm publish
   ```

## Version Info
- **Package:** sataruz-captcha
- **Version:** 0.1.0
- **Authors:** YoshCasaster & mortspace
- **Description:** Playing-Captcha

## Notes
- All CSS class names starting with `.clawcap-` remain unchanged (CSS is implementation-agnostic)
- The component is production-ready once assets are replaced
- All dependencies are specified in package.json
- The component requires React 18+ and motion@12.0.0
