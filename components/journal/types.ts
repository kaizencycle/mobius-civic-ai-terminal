import type { JournalDisplayEntry } from '@/lib/journal/types';

/** Normalized row for readability feed (C-314). */
export type JournalFeedCardEntry = {
  id: string;
  agent: string;
  cycle: string;
  lane: 'HOT' | 'CANON' | 'SHAPE';
  title: string;
  summary: string;
  timestamp: string;
  gi_at_time?: number | null;
  event_type?: string;
  tags?: string[];
  raw: JournalDisplayEntry;
};
