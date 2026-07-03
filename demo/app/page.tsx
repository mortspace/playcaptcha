'use client';

import { SataruzCaptcha, type ToyId } from 'sataruz-captcha';
import 'sataruz-captcha/sataruz-captcha.css';
import Image from 'next/image';
import { useState } from 'react';

const CHARACTERS: ToyId[] = [
  'cao_yanbing',
  'irelia',
  'titan',
  'frok',
  'uriel',
  'jormungandr',
  'netherworld',
  'zhuqing',
  'nine',
  'samael',
  'ratu_salju',
  'qingluan',
];

export default function Home() {
  const [verified, setVerified] = useState(false);
  const [selectedChar, setSelectedChar] = useState<ToyId | undefined>();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center gap-4">
            <Image
              src="/sataruz-captcha.svg"
              alt="Sataruz Captcha"
              width={48}
              height={48}
              className="h-12 w-12"
            />
            <div>
              <h1 className="text-3xl font-bold text-white">Sataruz Captcha</h1>
              <p className="text-slate-400">Interactive Claw Machine Verification</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Demo Section */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Try it Now</h2>
              <p className="text-slate-300">
                {selectedChar
                  ? `Grab the ${selectedChar.replace(/_/g, ' ')} to verify!`
                  : 'A random character will be selected each time you load.'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 backdrop-blur">
              <SataruzCaptcha
                target={selectedChar}
                onVerify={() => {
                  setVerified(true);
                  setTimeout(() => setVerified(false), 3000);
                }}
              />

              {verified && (
                <div className="mt-6 rounded-lg bg-green-900/20 border border-green-700 px-4 py-3 text-green-200 text-center font-medium animate-pulse">
                  ✓ Verification successful! You're human.
                </div>
              )}
            </div>
          </section>

          {/* Character Selection & Info */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Characters</h2>
              <p className="text-slate-300">
                Select a specific character or leave blank for random selection.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setSelectedChar(undefined)}
                className={`w-full rounded-lg px-4 py-3 font-medium transition-all ${
                  selectedChar === undefined
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                Random Character
              </button>

              <div className="grid grid-cols-2 gap-2">
                {CHARACTERS.map((char) => (
                  <button
                    key={char}
                    onClick={() => setSelectedChar(char)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-all capitalize ${
                      selectedChar === char
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {char.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-slate-700/50 border border-slate-600 p-6 space-y-4">
              <h3 className="font-semibold text-white">Installation</h3>
              <pre className="bg-slate-900 rounded p-4 overflow-x-auto text-sm text-slate-300 border border-slate-600">
                <code>npm install sataruz-captcha</code>
              </pre>

              <h3 className="font-semibold text-white">Usage</h3>
              <pre className="bg-slate-900 rounded p-4 overflow-x-auto text-xs text-slate-300 border border-slate-600 leading-relaxed">
                <code>{`import { SataruzCaptcha } from 'sataruz-captcha'
import 'sataruz-captcha/sataruz-captcha.css'

<SataruzCaptcha 
  onVerify={() => unlock()} 
/>`}</code>
              </pre>
            </div>
          </section>
        </div>

        {/* Feature Section */}
        <section className="mt-20 grid gap-8 md:grid-cols-3">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
            <div className="mb-3 text-2xl">🎮</div>
            <h3 className="font-semibold text-white mb-2">Interactive</h3>
            <p className="text-sm text-slate-400">
              Smooth, engaging claw machine gameplay powered by React and Motion.
            </p>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
            <div className="mb-3 text-2xl">⚡</div>
            <h3 className="font-semibold text-white mb-2">Lightweight</h3>
            <p className="text-sm text-slate-400">
              No physics engine complexity, just damped springs and smooth animations.
            </p>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
            <div className="mb-3 text-2xl">🔧</div>
            <h3 className="font-semibold text-white mb-2">Customizable</h3>
            <p className="text-sm text-slate-400">
              Easy to integrate with your own authentication and styling.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-700 bg-slate-900/50 mt-20 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-slate-400 text-sm">
          <p>
            Built with <span className="text-red-500">♥</span> by YoshCasaster & mortspace
          </p>
          <p className="mt-2">
            <a
              href="https://www.npmjs.com/package/sataruz-captcha"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              View on NPM
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
