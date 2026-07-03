# Sataruz Captcha - Demo Website Deployment Guide

## Project Structure

```
/vercel/share/v0-project/
├── src/                      # Main NPM package source
│   ├── SataruzCaptcha.tsx    # Component
│   ├── sataruz-captcha.css   # Styles
│   ├── toys.ts               # Character definitions (12 characters)
│   └── index.ts              # Exports
├── assets/
│   ├── sataruz/              # 12 character PNG files
│   └── sataruz-captcha.svg   # Logo
├── dist/                     # Built package (npm publish ready)
├── package.json              # NPM package config
└── demo/                     # Next.js demo website
    ├── app/
    │   ├── layout.tsx        # Root layout
    │   ├── page.tsx          # Demo page with SataruzCaptcha integration
    │   └── globals.css       # Tailwind CSS
    ├── public/
    │   ├── sataruz/          # Character assets (copied from main project)
    │   └── sataruz-captcha.svg
    └── package.json          # Demo app config
```

## NPM Package Status

✓ **sataruz-captcha** v0.1.0 published to NPM
- Package: https://www.npmjs.com/package/sataruz-captcha
- Author: YoshCasaster & mortspace
- Description: Playing-Captcha - Interactive claw machine verification

### Package Contents

- `dist/index.js` - Main component
- `dist/index.d.ts` - TypeScript definitions
- `dist/sataruz-captcha.css` - Styles
- `assets/sataruz/` - 12 character images
- `assets/sataruz-captcha.svg` - Logo

### Available Characters (ToyId)

1. cao_yanbing
2. irelia
3. titan
4. frok
5. uriel
6. jormungandr
7. netherworld
8. zhuqing
9. nine
10. samael
11. ratu_salju
12. qingluan

## Demo Website

### Features

- Interactive character selection
- Live captcha gameplay
- Installation/usage code examples
- Feature cards
- Modern dark theme with Tailwind CSS

### How to Run Locally

```bash
cd demo
npm run dev
# Open http://localhost:3000
```

### How to Deploy to Vercel

Option 1: Using Vercel CLI

```bash
cd demo
npm install -g vercel
vercel
# Follow prompts
```

Option 2: Using GitHub

1. Push the demo folder to GitHub
2. Go to https://vercel.com/new
3. Import the repository
4. Select `demo` as the root directory
5. Deploy

### Environment Setup

The demo uses:
- Next.js 16 with Turbopack
- React 19
- Tailwind CSS v4
- sataruz-captcha (from NPM)

## Features Tested

✓ Component loads correctly
✓ All 12 characters display
✓ Character selection works
✓ Responsive design
✓ CSS imports properly
✓ Asset paths resolve correctly
✓ TypeScript compilation passes

## Screenshots

The demo website shows:

1. **Hero Section**: Logo, title, and call-to-action
2. **Try it Now**: Live captcha component with random character
3. **Character Selection**: 12 character buttons for testing
4. **Installation Guide**: Code examples for developers
5. **Features**: Interactive, Lightweight, Customizable
6. **Footer**: Credits and NPM link

## Integration Example

```tsx
import { SataruzCaptcha, type ToyId } from 'sataruz-captcha'
import 'sataruz-captcha/sataruz-captcha.css'

export default function LoginPage() {
  return (
    <div>
      <h1>Login</h1>
      
      {/* Random character each time */}
      <SataruzCaptcha onVerify={() => submitForm()} />
      
      {/* Or specify a character */}
      <SataruzCaptcha target="irelia" onVerify={() => submitForm()} />
    </div>
  )
}
```

## Next Steps

1. **Deploy Demo**: Use `vercel` CLI or GitHub integration
2. **Promote Package**: Share NPM link and demo URL
3. **Monitor**: Check downloads and feedback
4. **Update**: Version bump and new releases as needed

## Support

- NPM Package: https://www.npmjs.com/package/sataruz-captcha
- GitHub: https://github.com/YoshCasaster/playcaptcha-edit
- Authors: YoshCasaster & mortspace

---

**Demo Website Built**: July 3, 2026
**Package Version**: 0.1.0
**Status**: ✓ Ready for Production
