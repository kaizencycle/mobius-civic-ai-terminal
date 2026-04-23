import { NextResponse } from 'next/server';
import { buildGlobeAssetCacheKey, getCachedGlobeAsset, setCachedGlobeAsset } from '@/lib/globe/assetCache';
import { nanoBananaGenerate, stableAssetId } from '@/lib/globe/renderProviders/nanoBanana';
import { promptForKind } from '@/lib/globe/renderPrompts';
import type { GlobeRenderAssetRequest, GlobeRenderAssetResponse } from '@/lib/globe/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: GlobeRenderAssetRequest;
  try {
    body = (await request.json()) as GlobeRenderAssetRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        assetId: '',
        provider: 'nano-banana',
        cached: false,
        error: 'Invalid JSON body',
      } satisfies GlobeRenderAssetResponse,
      { status: 400 },
    );
  }

  if (!body?.kind || !body?.title) {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        assetId: '',
        provider: 'nano-banana',
        cached: false,
        error: 'kind and title are required',
      } satisfies GlobeRenderAssetResponse,
      { status: 400 },
    );
  }

  const prompt = promptForKind(body.kind, {
    title: body.title,
    domain: body.domain,
    cycle: body.cycle,
    severity: body.severity,
    metadata: body.metadata,
    customPrompt: body.prompt,
  });

  const cacheKey = buildGlobeAssetCacheKey({
    kind: body.kind,
    cycle: body.cycle,
    signalId: body.signalId,
    title: body.title,
    severity: body.severity,
    prompt,
  });

  const cached = await getCachedGlobeAsset(cacheKey);
  if (cached?.imageUrl) {
    const res: GlobeRenderAssetResponse = {
      ok: true,
      status: 'completed',
      assetId: cached.assetId,
      imageUrl: cached.imageUrl,
      provider: 'nano-banana',
      cached: true,
      diagnostics: {
        provider: 'nano-banana',
        cached: true,
        createdAt: cached.createdAt,
        sourceSignalId: body.signalId,
        cycle: body.cycle,
      },
    };
    return NextResponse.json(res);
  }

  const assetId = stableAssetId([cacheKey, body.kind]);

  const gen = await nanoBananaGenerate({
    prompt,
    referenceImageUrls: body.referenceImageUrls,
    asyncMode: false,
  });

  if (!gen.ok) {
    const res: GlobeRenderAssetResponse = {
      ok: false,
      status: 'failed',
      assetId,
      provider: 'nano-banana',
      cached: false,
      error: gen.error,
      diagnostics: {
        provider: 'nano-banana',
        cached: false,
        createdAt: new Date().toISOString(),
        sourceSignalId: body.signalId,
        cycle: body.cycle,
        failureReason: gen.error,
      },
    };
    return NextResponse.json(res, { status: 502 });
  }

  const createdAt = new Date().toISOString();
  await setCachedGlobeAsset(cacheKey, {
    assetId,
    imageUrl: gen.imageUrl,
    kind: body.kind,
    createdAt,
    cacheKey,
  });

  const res: GlobeRenderAssetResponse = {
    ok: true,
    status: 'completed',
    assetId,
    imageUrl: gen.imageUrl,
    provider: 'nano-banana',
    cached: false,
    diagnostics: {
      provider: 'nano-banana',
      cached: false,
      createdAt,
      sourceSignalId: body.signalId,
      cycle: body.cycle,
    },
  };
  return NextResponse.json(res);
}
