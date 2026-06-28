/**
 * Core canonization engine — fetch → hash → write .dat → CPC anchors.
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { postHashAnchor } from '@/lib/cpc/hashAnchor';
import { fetchAllSealedBlocks } from '@/lib/vault/fetchAllSealedBlocks';
import {
  BLOCKS_PER_DAT_FILE,
  DAT_VERSION,
  GENESIS_HASH,
  MIC_PER_BLOCK,
  buildDatRecord,
  datFileName,
  hashDatFile,
} from './hashDatRecord';
import type {
  CanonizationError,
  CanonizationResult,
  DatBlockRecord,
  DatManifest,
  DatManifestEntry,
} from './types';

export interface CanonizeOptions {
  outputDir?: string;
  incremental?: boolean;
  dryRun?: boolean;
  skipCpcAnchors?: boolean;
  verbose?: boolean;
  forceApi?: boolean;
}

export async function canonizeReserveBlocks(
  opts: CanonizeOptions = {},
): Promise<CanonizationResult> {
  const {
    outputDir = './canon/reserve-blocks',
    incremental = false,
    dryRun = false,
    skipCpcAnchors = false,
    verbose = true,
    forceApi = false,
  } = opts;

  const errors: CanonizationError[] = [];
  const log = (msg: string) => verbose && console.log(`[canonize] ${msg}`);

  log('Starting C-357 Reserve Block canonization');

  if (!dryRun) {
    mkdirSync(outputDir, { recursive: true });
  }

  let startBlock = 1;
  let prevChainTip = GENESIS_HASH;

  if (incremental) {
    const existing = getExistingChainState(outputDir);
    if (existing) {
      startBlock = existing.last_block_number + 1;
      prevChainTip = existing.chain_tip_hash;
      log(`Incremental: from block ${startBlock}`);
    }
  }

  const { blocks, total_found, source, gaps, errors: fetchErrors } =
    await fetchAllSealedBlocks({ fromBlock: startBlock, verbose, forceApi });

  for (const e of fetchErrors) {
    errors.push({ stage: 'fetch', message: e, retryable: true });
  }

  if (gaps.length > 0) {
    errors.push({
      stage: 'fetch',
      message: `${gaps.length} gaps in block sequence`,
      retryable: false,
    });
  }

  log(`Fetched ${total_found} blocks via ${source}`);

  if (blocks.length === 0) {
    return makeResult({
      blocks: [],
      datFiles: [],
      manifestHash: '',
      chainTip: prevChainTip,
      cpcAnchored: 0,
      cpcIdempotent: 0,
      errors,
      completedAt: new Date().toISOString(),
    });
  }

  const datFiles: string[] = [];
  const manifest: Record<string, DatManifestEntry> = {};
  let chainTip = prevChainTip;
  let fileIndex = incremental ? getNextFileIndex(outputDir) : 0;
  let fileRecords: DatBlockRecord[] = [];
  let fileStartBlock = blocks[0].block_number;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    let record: DatBlockRecord;
    try {
      record = buildDatRecord(block, chainTip);
    } catch (e) {
      errors.push({
        block_number: block.block_number,
        stage: 'hash',
        message: e instanceof Error ? e.message : String(e),
        retryable: false,
      });
      continue;
    }

    fileRecords.push(record);
    chainTip = record.block_hash;

    const isLastBlock = i === blocks.length - 1;
    const fileFull = fileRecords.length === BLOCKS_PER_DAT_FILE;

    if (fileFull || isLastBlock) {
      const filename = datFileName(fileIndex);
      const filepath = join(outputDir, filename);
      const content = `${fileRecords.map((r) => JSON.stringify(r)).join('\n')}\n`;
      const fileHash = hashDatFile(content);
      const fileEndBlock = fileRecords[fileRecords.length - 1].block_number;

      if (!dryRun) {
        try {
          writeFileSync(filepath, content, 'utf8');
          log(`✓ ${filename}: blocks ${fileStartBlock}–${fileEndBlock}`);
        } catch (e) {
          errors.push({
            dat_file: filename,
            stage: 'write',
            message: e instanceof Error ? e.message : String(e),
            retryable: true,
          });
        }
      } else {
        log(`[dry-run] Would write ${filename}: blocks ${fileStartBlock}–${fileEndBlock}`);
      }

      manifest[filename] = {
        range: [fileStartBlock, fileEndBlock],
        sha256: fileHash,
        block_count: fileRecords.length,
      };
      datFiles.push(filename);

      fileIndex++;
      fileStartBlock = isLastBlock ? 0 : (blocks[i + 1]?.block_number ?? 0);
      fileRecords = [];
    }
  }

  const manifestObj: DatManifest = {
    version: DAT_VERSION,
    generated_at: new Date().toISOString(),
    total_blocks: blocks.length,
    total_mic: blocks.length * MIC_PER_BLOCK,
    chain_tip_hash: chainTip,
    files: manifest,
  };
  const manifestContent = JSON.stringify(manifestObj, null, 2);
  const manifestHash = hashDatFile(manifestContent);
  const manifestPath = join(outputDir, 'MANIFEST.json');

  if (!dryRun) {
    try {
      writeFileSync(manifestPath, manifestContent, 'utf8');
      log(`✓ MANIFEST.json | chain tip: ${chainTip.slice(7, 23)}...`);
    } catch (e) {
      errors.push({
        stage: 'write',
        message: e instanceof Error ? e.message : String(e),
        retryable: true,
      });
    }
  }

  let cpcAnchored = 0;
  let cpcIdempotent = 0;

  if (!skipCpcAnchors && !dryRun) {
    log(`Posting ${datFiles.length} hash anchors to CPC...`);
    const lastFile = datFiles[datFiles.length - 1];

    for (const filename of datFiles) {
      const entry = manifest[filename];
      const result = await postHashAnchor({
        dat_file: filename,
        file_hash: entry.sha256,
        block_range_start: entry.range[0],
        block_range_end: entry.range[1],
        block_count: entry.block_count,
        chain_tip_hash: chainTip,
        manifest_hash: filename === lastFile ? manifestHash : undefined,
        version: DAT_VERSION,
        canonized_at: new Date().toISOString(),
      });

      if (result.success) {
        if (result.action === 'anchored') cpcAnchored++;
        if (result.action === 'idempotent') cpcIdempotent++;
      } else {
        errors.push({
          dat_file: filename,
          stage: 'cpc_anchor',
          message: result.error ?? 'unknown error',
          retryable: true,
        });
      }
    }
  }

  return makeResult({
    blocks,
    datFiles,
    manifestHash,
    chainTip,
    cpcAnchored,
    cpcIdempotent,
    errors,
    completedAt: new Date().toISOString(),
  });
}

function makeResult(args: {
  blocks: { block_number: number }[];
  datFiles: string[];
  manifestHash: string;
  chainTip: string;
  cpcAnchored: number;
  cpcIdempotent: number;
  errors: CanonizationError[];
  completedAt: string;
}): CanonizationResult {
  return {
    epicon_cycle: 'C-357',
    total_blocks_processed: args.blocks.length,
    total_mic_canonized: args.blocks.length * MIC_PER_BLOCK,
    dat_files_written: args.datFiles,
    manifest_hash: args.manifestHash,
    chain_tip_hash: args.chainTip,
    cpc_anchors_posted: args.cpcAnchored,
    cpc_anchors_idempotent: args.cpcIdempotent,
    errors: args.errors,
    completed_at: args.completedAt,
    substrate_commit_ready: args.errors.filter((e) => e.stage === 'write').length === 0,
  };
}

function getExistingChainState(outputDir: string): {
  last_block_number: number;
  chain_tip_hash: string;
} | null {
  const manifestPath = join(outputDir, 'MANIFEST.json');
  if (!existsSync(manifestPath)) return null;

  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as DatManifest;
    const files = Object.values(m.files);
    if (files.length === 0) return null;
    const lastFile = files.sort((a, b) => b.range[1] - a.range[1])[0];
    return {
      last_block_number: lastFile.range[1],
      chain_tip_hash: m.chain_tip_hash,
    };
  } catch {
    return null;
  }
}

function getNextFileIndex(outputDir: string): number {
  const manifestPath = join(outputDir, 'MANIFEST.json');
  if (!existsSync(manifestPath)) return 0;

  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as DatManifest;
    return Object.keys(m.files).length;
  } catch {
    return 0;
  }
}
