export const mockQueryResult = {
  id: 'query-c256-001',
  query: 'ZEUS give me a volatility report on BTC and comparing it to Oil',
  title: 'BTC vs Oil volatility snapshot',
  summary:
    'BTC remains high-beta and sentiment-sensitive, while oil is currently driven more directly by geopolitical supply risk. Correlation is unstable and regime-dependent.',
  sources: ['Coinbase', 'Macro feed', 'Energy feed'],
  tags: ['btc', 'oil', 'volatility', 'macro'],
  confidence: 0.74,
  agents_used: ['ECHO', 'ZEUS', 'ATLAS'],
  created_at: '2026-03-20T12:00:00Z',
} as const;
