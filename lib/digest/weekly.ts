export type WeeklyDigest = {
  week: string;
  cycle_range: string;
  gi_status: 'stable' | 'guarded' | 'stressed';
  global_risk: 'low' | 'guarded' | 'elevated';
  macro: {
    inflation: string;
    rates: string;
    liquidity: string;
    summary: string;
  };
  geopolitics: {
    middle_east: string;
    asia_pacific: string;
    europe: string;
    summary: string;
  };
  technology: {
    ai: string;
    semiconductors: string;
    cyber: string;
    summary: string;
  };
  climate: {
    extreme_weather: string;
    energy_grid: string;
    summary: string;
  };
  risk_dashboard: {
    financial: 'low' | 'medium' | 'high';
    geopolitical: 'low' | 'medium' | 'high';
    cyber: 'low' | 'medium' | 'high';
    energy: 'low' | 'medium' | 'high';
    civil: 'low' | 'medium' | 'high';
  };
  weekly_changes: string[];
  summary: string;
};

export function buildWeeklyDigest(): WeeklyDigest {
  return {
    week: '2026-W13',
    cycle_range: 'C-257-C-258',
    gi_status: 'stable',
    global_risk: 'guarded',
    macro: {
      inflation: 'elevated',
      rates: 'high',
      liquidity: 'tight',
      summary:
        'Financial conditions remain restrictive, but broad system stability remains intact.',
    },
    geopolitics: {
      middle_east: 'elevated',
      asia_pacific: 'guarded',
      europe: 'stable',
      summary:
        'Middle East tensions remain the most immediate external risk driver.',
    },
    technology: {
      ai: 'accelerating',
      semiconductors: 'strategic',
      cyber: 'elevated',
      summary:
        'AI and compute remain strategic growth vectors while cyber risk stays elevated.',
    },
    climate: {
      extreme_weather: 'increasing',
      energy_grid: 'stable',
      summary:
        'Environmental pressure is rising but not yet producing system-wide grid stress.',
    },
    risk_dashboard: {
      financial: 'medium',
      geopolitical: 'medium',
      cyber: 'high',
      energy: 'medium',
      civil: 'low',
    },
    weekly_changes: [
      'Mobius Terminal identity spine advanced',
      'GI became more visible and interactive',
      'EPICON public memory surface expanded',
      'Global risk remained concentrated in geopolitics and cyber',
    ],
    summary:
      'The global system remains guarded but stable. Geopolitical and cyber risks remain the primary watch areas while AI and infrastructure continue to accelerate.',
  };
}
