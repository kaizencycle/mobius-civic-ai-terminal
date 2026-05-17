/** First sentence / line for journal entry titles (C-314 readability). */
export function deriveTitleFromSummary(summary?: string): string {
  if (!summary?.trim()) return 'Journal entry';
  const firstSentence = summary.split(/[.!?]/u)[0]?.trim() ?? summary.trim();
  if (firstSentence.length > 60) return `${firstSentence.slice(0, 57)}…`;
  return firstSentence.length > 0 ? firstSentence : 'Journal entry';
}
