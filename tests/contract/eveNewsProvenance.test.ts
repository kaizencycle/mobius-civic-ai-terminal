// C-386: EVE news provenance → ECHO integrity shard routing (Z-N4 witness).
// Run: tsx tests/contract/eveNewsProvenance.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rateEvent } from '../../lib/echo/integrity-engine.ts';
import { transformBatch } from '../../lib/echo/transform.ts';
import type { EpiconItem } from '../../lib/terminal/types.ts';
import {
  buildExternalSynthesisFromItems,
  countExternalIndependentNewsRoots,
  countIndependentNewsRoots,
  dedupeLiveNewsItems,
  eveItemsToRawEvents,
  eveStoryKeyFromItem,
  maxGlobalTension,
  stableEveNewsItemId,
  type EveNewsItem,
} from '../../lib/eve/global-news.ts';

function sampleItem(overrides: Partial<EveNewsItem>): EveNewsItem {
  return {
    id: 'eve-test-1',
    title: 'Test headline',
    summary: 'Test summary body for integrity routing.',
    url: 'https://example.com',
    source: 'Test',
    region: 'Global',
    timestamp: new Date().toISOString(),
    category: 'geopolitical',
    severity: 'medium',
    eve_tag: 'Test tag',
    source_type: 'wikipedia_current_events',
    root_id: 'wiki:2026-07-28:test-headline',
    ...overrides,
  };
}

const stubEpicon = (id: string): EpiconItem =>
  ({
    id,
    title: 'stub',
    summary: 'stub',
    status: 'pending',
    category: 'ethics',
    confidenceTier: 2,
    ownerAgent: 'ECHO',
    sources: ['EVE / Test'],
    timestamp: new Date().toISOString(),
    trace: [],
    feedSource: 'test',
  }) as EpiconItem;

describe('EVE news provenance (C-386)', () => {
  it('countIndependentNewsRoots dedupes same source_type:root_id', () => {
    const a = sampleItem({ root_id: 'r1' });
    const b = sampleItem({ id: 'eve-test-2', root_id: 'r1' });
    const c = sampleItem({ id: 'eve-test-3', source_type: 'gdelt_article', root_id: 'r1' });
    assert.equal(countIndependentNewsRoots([a, b, c]), 2);
  });

  it('countExternalIndependentNewsRoots excludes internal and mock lanes', () => {
    const internal = sampleItem({ source_type: 'eve_internal_substrate', root_id: 'i1' });
    const mock = sampleItem({ source_type: 'mock_fallback', root_id: 'm1' });
    assert.equal(countExternalIndependentNewsRoots([internal, mock]), 0);
  });

  it('dedupeLiveNewsItems keeps same headline across Wikipedia and GDELT', () => {
    const title = 'Ceasefire talks resume';
    const kept = dedupeLiveNewsItems([
      sampleItem({ title, source_type: 'wikipedia_current_events', root_id: 'w1' }),
      sampleItem({
        id: 'eve-test-gdelt',
        title,
        source_type: 'gdelt_article',
        root_id: 'gdelt:example.com:ceasefire',
      }),
    ]);
    assert.equal(kept.length, 2);
    assert.equal(countExternalIndependentNewsRoots(kept), 2);
  });

  it('stableEveNewsItemId is stable for the same GDELT root across list positions', () => {
    const rootId = 'gdelt:reuters.com:ceasefire talks resume';
    assert.equal(stableEveNewsItemId(rootId), stableEveNewsItemId(rootId));
    assert.doesNotMatch(stableEveNewsItemId(rootId), /-\d+-/);
  });

  it('transformBatch dedupes same headline from Wikipedia and GDELT lanes', () => {
    const title = 'Ceasefire talks resume at international summit';
    const raw = eveItemsToRawEvents([
      sampleItem({
        title,
        summary: title,
        source_type: 'wikipedia_current_events',
        root_id: `wiki:2026-07-28:${title.slice(0, 20)}`,
        source: 'Wikipedia Current Events',
      }),
      sampleItem({
        id: stableEveNewsItemId('gdelt:reuters.com:ceasefire talks resume'),
        title,
        source_type: 'gdelt_article',
        root_id: 'gdelt:reuters.com:ceasefire talks resume at international summit',
        source: 'GDELT / reuters.com',
      }),
    ]);
    const result = transformBatch(raw);
    assert.equal(result.epicon.length, 1);
    assert.equal(result.duplicateSuppressedCount, 1);
  });

  it('transformBatch dedupes EVE rows with different categories but same story key', () => {
    const fullBullet =
      'International leaders announce a ceasefire framework after weeks of negotiations in the capital region with humanitarian corridors opening.';
    const truncatedTitle = `${fullBullet.slice(0, 117)}...`;
    const wikiItem = sampleItem({
      title: truncatedTitle,
      summary: fullBullet,
      category: 'geopolitical',
      source_type: 'wikipedia_current_events',
      root_id: `wiki:2026-07-28:${fullBullet.slice(0, 30)}`,
    });
    const gdeltItem = sampleItem({
      id: stableEveNewsItemId('gdelt:apnews.com:ceasefire framework'),
      title: fullBullet,
      summary: 'Global pattern via apnews.com.',
      category: 'governance',
      source_type: 'gdelt_article',
      root_id: 'gdelt:apnews.com:international leaders announce ceasefire',
      source: 'GDELT / apnews.com',
    });
    assert.equal(eveStoryKeyFromItem(wikiItem), eveStoryKeyFromItem(gdeltItem));
    const result = transformBatch(eveItemsToRawEvents([wikiItem, gdeltItem]));
    assert.equal(result.epicon.length, 1);
  });

  it('maxGlobalTension preserves internal elevated when external lane is empty', () => {
    assert.equal(maxGlobalTension('elevated', 'low'), 'elevated');
    assert.equal(maxGlobalTension('moderate', 'low'), 'moderate');
    assert.equal(maxGlobalTension('high', 'elevated'), 'high');
  });

  it('buildExternalSynthesisFromItems recomputes tension from served items only', () => {
    const highGeo = () =>
      sampleItem({
        id: `eve-high-${Math.random()}`,
        severity: 'high',
        category: 'geopolitical',
      });
    const full = buildExternalSynthesisFromItems([highGeo(), highGeo(), highGeo()]);
    const trimmed = buildExternalSynthesisFromItems([sampleItem({ severity: 'low', category: 'market' })]);
    assert.equal(full.global_tension, 'high');
    assert.equal(trimmed.global_tension, 'low');
  });

  it('eveItemsToRawEvents preserves ethics and civic-risk categories (Z-N4)', () => {
    const ethics = eveItemsToRawEvents([sampleItem({ category: 'ethics' })])[0]!;
    const civic = eveItemsToRawEvents([sampleItem({ category: 'civic-risk' })])[0]!;

    assert.equal(ethics.category, 'ethics');
    assert.equal(civic.category, 'civic-risk');
    assert.equal(ethics.metadata.source_type, 'wikipedia_current_events');
    assert.ok(typeof ethics.metadata.root_id === 'string');

    const ethicsRating = rateEvent(ethics, stubEpicon('ep-ethics'));
    const civicRating = rateEvent(civic, stubEpicon('ep-civic'));

    assert.equal(ethicsRating.shardType, 'stewardship');
    assert.equal(civicRating.shardType, 'guardian');
  });
});
