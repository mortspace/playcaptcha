# Sataruz Captcha Demo Website

A demo website showcasing the **sataruz-captcha** NPM package - an interactive claw machine game for human verification.

## Features

- Interactive claw machine gameplay
- 12 unique characters to grab
- Smooth animations powered by React and Motion
- Modern dark theme UI built with Tailwind CSS
- TypeScript support
- Full responsive design

## Technologies

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- sataruz-captcha (NPM package)

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Using sataruz-captcha

```tsx
import { SataruzCaptcha } from 'sataruz-captcha';
import 'sataruz-captcha/sataruz-captcha.css';

<SataruzCaptcha onVerify={() => unlock()} />
```

## Available Characters

Use the `target` prop to specify which character to grab:

- cao_yanbing, irelia, titan, frok, uriel, jormungandr
- netherworld, zhuqing, nine, samael, ratu_salju, qingluan

## NPM Package

Install the package in your own project:

```bash
npm install sataruz-captcha
```

View on NPM: https://www.npmjs.com/package/sataruz-captcha

## Deployment

Deploy to Vercel:

```bash
vercel --prod
```

Or connect your GitHub repository to Vercel for automatic deployments.

## Authors

- YoshCasaster
- mortspace
