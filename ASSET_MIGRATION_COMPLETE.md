# Asset Migration Complete ✓

## Summary
Project `sataruz-captcha` has been fully migrated from `playcaptcha` with all assets updated.

### What Changed:

#### 1. **Asset Path Migration**
- **Old:** `assets/toys/` (duck, bear, panda, bunny, dino, penguin, fox, frog, whale, cat, puppy, unicorn)
- **New:** `assets/sataruz/` (cao_yanbing, irelia, titan, frok, uriel, jormungandr, netherworld, zhuqing, nine, samael, ratu_salju, qingluan)
- **Logo:** `assets/sataruz-captcha.svg`

#### 2. **Code Updates**
- `src/toys.ts`: Updated ToyId type and TOY_META with new 12 characters
- `src/SataruzCaptcha.tsx`: 
  - Updated TOY_SET array with new character IDs and sizing
  - Changed default assetBase from `/toys/` to `/sataruz/`
- `README.md`: Updated documentation with new asset paths and character IDs

#### 3. **Configuration**
- `package.json`: Already updated with sataruz-captcha, YoshCasaster & mortspace, "Playing-Captcha"
- `tsup.config.ts`: Already configured for sataruz-captcha.css export

### Asset Files (12 Characters)
```
assets/sataruz/
├── cao_yanbing.png
├── irelia.png
├── titan.png
├── frok.png
├── uriel.png
├── jormungandr.png
├── netherworld.png
├── zhuqing.png
├── nine.png
├── samael.png
├── ratu_salju.png
├── qingluan.png
└── sataruz-captcha.svg
```

### Character IDs (for `target` prop)
- `cao_yanbing`
- `irelia`
- `titan`
- `frok`
- `uriel`
- `jormungandr`
- `netherworld`
- `zhuqing`
- `nine`
- `samael`
- `ratu_salju`
- `qingluan`

### Default Behavior
- Component now loads characters from `/sataruz/` folder by default
- Each character needs to be present at `/sataruz/{id}.png`
- Logo expected at `/sataruz-captcha.svg`

### Next Steps
1. Build: `npm run build`
2. Test locally to verify character loading
3. Publish: `npm publish`

---
Migration completed on: June 30, 2026
