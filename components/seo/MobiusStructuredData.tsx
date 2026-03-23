// ============================================================================
// Mobius Terminal — Schema.org JSON-LD Structured Data
// Serves SEO (crawlers), GEO (generative engines), and AEO (answer engines)
// CC0 Public Domain
// ============================================================================

export function MobiusStructuredData() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      // ── Organization ──────────────────────────────────────────────
      {
        '@type': 'Organization',
        '@id': 'https://mobius-civic-ai-terminal.vercel.app/#org',
        name: 'Mobius Substrate',
        url: 'https://mobius-civic-ai-terminal.vercel.app',
        description:
          'Mobius Substrate is civic AI governance infrastructure focused on integrity, verifiable memory, and democratic accountability. Released under CC0 public domain.',
        founder: {
          '@type': 'Person',
          name: 'Michael Judan',
          url: 'https://michaeljudan.substack.com',
          sameAs: [
            'https://github.com/kaizencycle',
            'https://michaeljudan.substack.com',
          ],
        },
        sameAs: [
          'https://github.com/kaizencycle/Mobius-Substrate',
          'https://github.com/kaizencycle/mobius-civic-ai-terminal',
          'https://michaeljudan.substack.com',
        ],
      },

      // ── SoftwareApplication (the Terminal) ────────────────────────
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://mobius-civic-ai-terminal.vercel.app/#app',
        name: 'Mobius Civic AI Terminal',
        alternateName: 'Mobius Terminal',
        description:
          'A Bloomberg-style civic command console for monitoring Global Integrity (GI), EPICON ledger events, agent status, tripwire anomalies, and micro sub-agent signals from public APIs. Part of the Mobius Substrate governance infrastructure.',
        url: 'https://mobius-civic-ai-terminal.vercel.app/terminal',
        applicationCategory: 'GovernanceTool',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        author: {
          '@id': 'https://mobius-civic-ai-terminal.vercel.app/#org',
        },
        license: 'https://creativecommons.org/publicdomain/zero/1.0/',
        codeRepository: 'https://github.com/kaizencycle/mobius-civic-ai-terminal',
        programmingLanguage: ['TypeScript', 'React', 'Next.js'],
        softwareVersion: '0.1.0',
        datePublished: '2026-03-05',
        dateModified: new Date().toISOString().split('T')[0],
      },

      // ── Dataset (micro-agent signals) ─────────────────────────────
      {
        '@type': 'Dataset',
        '@id': 'https://mobius-civic-ai-terminal.vercel.app/#signals',
        name: 'Mobius Micro-Agent Civic Signals',
        description:
          'Real-time civic integrity signals from four micro sub-agents polling nine free public APIs: Open-Meteo weather, USGS earthquakes, Federal Register, data.gov, Hacker News, Wikipedia recent changes, GitHub API, npm registry, and terminal self-ping. Updated every 5-15 minutes. Normalized to 0-1 scale where 1 equals healthy.',
        url: 'https://mobius-civic-ai-terminal.vercel.app/api/signals/micro',
        license: 'https://creativecommons.org/publicdomain/zero/1.0/',
        creator: {
          '@id': 'https://mobius-civic-ai-terminal.vercel.app/#org',
        },
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: 'https://mobius-civic-ai-terminal.vercel.app/api/signals/micro',
        },
        temporalCoverage: '2026-03-20/..',
        measurementTechnique: 'Automated polling of public APIs with normalization to 0-1 integrity scale',
        variableMeasured: [
          {
            '@type': 'PropertyValue',
            name: 'Global Integrity (GI)',
            description: 'Weighted composite of signal quality, freshness, tripwire stability, and active agent health',
            minValue: 0,
            maxValue: 1,
            unitText: 'normalized score',
          },
          {
            '@type': 'PropertyValue',
            name: 'Composite Signal',
            description: 'Average normalized value across all micro-agent signals',
            minValue: 0,
            maxValue: 1,
            unitText: 'normalized score',
          },
        ],
      },

      // ── Dataset (Mobius Catalog) ──────────────────────────────────
      {
        '@type': 'Dataset',
        '@id': 'https://mobius-civic-ai-terminal.vercel.app/#catalog',
        name: 'Mobius Catalog',
        description:
          'Machine-readable health snapshots of the Mobius Civic AI Terminal, updated every 2 hours via GitHub Actions. Tracks codebase stats, integrity metrics, agent roster, API surface, and deployment state.',
        url: 'https://github.com/kaizencycle/mobius-civic-ai-terminal/tree/main/docs/catalog',
        license: 'https://creativecommons.org/publicdomain/zero/1.0/',
        creator: {
          '@id': 'https://mobius-civic-ai-terminal.vercel.app/#org',
        },
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: 'https://raw.githubusercontent.com/kaizencycle/mobius-civic-ai-terminal/main/docs/catalog/data.json',
        },
        temporalCoverage: '2026-03-22/..',
      },

      // ── FAQPage ───────────────────────────────────────────────────
      {
        '@type': 'FAQPage',
        '@id': 'https://mobius-civic-ai-terminal.vercel.app/#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is the Mobius Civic AI Terminal?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The Mobius Civic AI Terminal is a Bloomberg-style command console for civic AI governance. It monitors Global Integrity scores, EPICON ledger events, agent status across 8 canonical AI agents and 4 micro sub-agents, tripwire anomalies, and real-time signals from 9 public APIs. It is part of the Mobius Substrate infrastructure and released under CC0 public domain.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is Global Integrity (GI) in the Mobius system?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Global Integrity (GI) is a composite score from 0 to 1 computed from four weighted factors: signal quality (35%), data freshness (25%), tripwire stability (20%), and active system health (20%). A GI above 0.85 is green/nominal, 0.70-0.85 is yellow/stressed, and below 0.70 is red/critical. The terminal computes GI reactively from live signal engine data.',
            },
          },
          {
            '@type': 'Question',
            name: 'What are the micro sub-agents in the Mobius Terminal?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The terminal runs four micro sub-agents that poll free public APIs: GAIA monitors environmental signals from Open-Meteo weather and USGS earthquakes. HERMES-µ tracks information velocity from Hacker News and Wikipedia. THEMIS monitors governance transparency from the Federal Register and data.gov. DAEDALUS-µ checks infrastructure health from GitHub, npm, and terminal self-ping. All signals normalize to a 0-1 scale.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is EPICON in the Mobius Substrate?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'EPICON (Epistemic Constraints for Intent and Ontological Navigation) is an accountability system where every significant action is logged as a timestamped, hash-referenced ledger entry with author attribution, confidence tier, and tags. EPICON entries are verified by sentinel agents (ATLAS and ZEUS) and form the immutable record of system intent.',
            },
          },
          {
            '@type': 'Question',
            name: 'What are the canonical agents in the Mobius system?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The Mobius system has 8 canonical agents organized by DVA (Democratic Virtue Architecture) tier: Sentinels (ATLAS — primary sentinel, ZEUS — secondary sentinel), Architects (HERMES — message router, AUREA — civic architect, JADE — constitutional annotator), Stewards (DAEDALUS — systems builder, ECHO — memory layer), and Observer (EVE — constitutional eye).',
            },
          },
          {
            '@type': 'Question',
            name: 'Is the Mobius Terminal open source?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. The Mobius Civic AI Terminal and the entire Mobius Substrate are released under CC0 1.0 Universal public domain dedication. The source code is available at github.com/kaizencycle/mobius-civic-ai-terminal. This was a deliberate choice to prevent institutional capture and ensure the infrastructure outlasts any individual.',
            },
          },
        ],
      },

      // ── WebSite ───────────────────────────────────────────────────
      {
        '@type': 'WebSite',
        '@id': 'https://mobius-civic-ai-terminal.vercel.app/#website',
        name: 'Mobius Civic AI Terminal',
        url: 'https://mobius-civic-ai-terminal.vercel.app',
        publisher: {
          '@id': 'https://mobius-civic-ai-terminal.vercel.app/#org',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
