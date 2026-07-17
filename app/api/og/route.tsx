/**
 * OPT-06 (C-323): OG image for social sharing.
 * C-375: Bundle JetBrains Mono for ⌘ glyph (edge has no system monospace with ⌘).
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const FONT_FAMILY = 'JetBrains Mono';

async function loadOgFont(): Promise<ArrayBuffer> {
  const fontUrl = new URL('./fonts/JetBrainsMono-Regular.ttf', import.meta.url);
  const res = await fetch(fontUrl, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`OG font load failed: ${res.status}`);
  }
  return res.arrayBuffer();
}

export async function GET() {
  const fontData = await loadOgFont();

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#020617',
          fontFamily: FONT_FAMILY,
          padding: 60,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              border: '1px solid rgba(34,211,238,0.6)',
              background: 'rgba(34,211,238,0.1)',
              color: '#67e8f9',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 20,
              fontFamily: FONT_FAMILY,
            }}
          >
            ⌘
          </div>
          <div
            style={{
              color: '#f1f5f9',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '0.08em',
              fontFamily: FONT_FAMILY,
            }}
          >
            MOBIUS CIVIC TERMINAL
          </div>
        </div>

        <div
          style={{
            color: '#94a3b8',
            fontSize: 20,
            textAlign: 'center',
            maxWidth: 700,
            lineHeight: 1.5,
            marginBottom: 40,
            fontFamily: FONT_FAMILY,
          }}
        >
          Bloomberg-style civic command console — Global Integrity, EPICON ledger,
          multi-agent consensus, and real-time signals.
        </div>

        <div
          style={{
            display: 'flex',
            gap: 20,
          }}
        >
          {[
            { label: 'GI', color: '#6ee7b7' },
            { label: 'EPICON', color: '#c4b5fd' },
            { label: 'SENTINEL', color: '#7dd3fc' },
            { label: 'LEDGER', color: '#fde68a' },
          ].map(({ label, color }) => (
            <div
              key={label}
              style={{
                border: `1px solid ${color}40`,
                background: `${color}15`,
                color,
                padding: '6px 16px',
                borderRadius: 4,
                fontSize: 13,
                fontFamily: FONT_FAMILY,
                letterSpacing: '0.12em',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 28,
            color: '#334155',
            fontSize: 13,
            fontFamily: FONT_FAMILY,
            letterSpacing: '0.08em',
          }}
        >
          mobius-civic-ai-terminal.vercel.app · CC0 public domain
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: FONT_FAMILY,
          data: fontData,
          style: 'normal',
          weight: 400,
        },
      ],
    },
  );
}
