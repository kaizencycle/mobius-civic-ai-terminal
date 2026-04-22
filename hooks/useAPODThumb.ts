'use client';

import { useEffect, useState } from 'react';

export function useAPODThumb(signalLabel: string | null) {
  const title = (signalLabel ?? '').replace(/^APOD:\s*/i, '').trim();
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!title) return;
    let active = true;
    fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data || typeof data.url !== 'string') return;
        setThumb(data.url);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [title]);

  return { title, thumb };
}
