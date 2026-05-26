/**
 * OPT-06 (C-323): OG image for social sharing.
 * Uses next/og ImageResponse (included in Next.js 15, no extra dep).
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET() {
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
          fontFamily: 'monospace',
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
              fontFamily: 'monospace',
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
              fontFamily: 'monospace',
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
                fontFamily: 'monospace',
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
            fontFamily: 'monospace',
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
    },
  );
}
