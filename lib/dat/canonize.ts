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
import { validateSealedBlockSequence } from './validateSealedBlock';

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
  let existingManifest: DatManifest | null = null;

  if (incremental) {
    existingManifest = loadExistingManifest(outputDir);
    if (existingManifest) {
      const lastFile = Object.values(existingManifest.files).sort(
        (a, b) => b.range[1] - a.range[1],
      )[0];
      startBlock = lastFile.range[1] + 1;
      prevChainTip = existingManifest.chain_tip_hash;
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

  if (blocks.length > 0) {
    try {
      validateSealedBlockSequence(blocks, startBlock);
    } catch (e) {
      errors.push({
        block_number: blocks[0]?.block_number,
        stage: 'hash',
        message: e instanceof Error ? e.message : String(e),
        retryable: false,
      });
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
  }

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
  const newManifestEntries: Record<string, DatManifestEntry> = {};
  let chainTip = prevChainTip;
  const writeState = incremental
    ? resolveIncrementalWriteState(outputDir, existingManifest)
    : {
        fileIndex: 0,
        fileRecords: [] as DatBlockRecord[],
        fileStartBlock: blocks[0].block_number,
        appendToExistingFile: false,
        existingFilename: null as string | null,
      };
  let fileIndex = writeState.fileIndex;
  let fileRecords = writeState.fileRecords;
  let fileStartBlock = writeState.fileStartBlock || blocks[0].block_number;
  if (writeState.appendToExistingFile && fileRecords.length > 0) {
    chainTip = fileRecords[fileRecords.length - 1].block_hash;
  }

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

      const isAppend = writeState.appendToExistingFile && writeState.existingFilename === filename;
      newManifestEntries[filename] = {
        range: [fileStartBlock, fileEndBlock],
        sha256: fileHash,
        block_count: fileRecords.length,
      };
      if (!isAppend || !datFiles.includes(filename)) {
        datFiles.push(filename);
      }

      fileIndex++;
      fileStartBlock = isLastBlock ? 0 : (blocks[i + 1]?.block_number ?? 0);
      fileRecords = [];
      writeState.appendToExistingFile = false;
      writeState.existingFilename = null;
    }
  }

  const priorBlockCount = existingManifest?.total_blocks ?? 0;
  const mergedFiles = {
    ...(existingManifest?.files ?? {}),
    ...newManifestEntries,
  };
  const totalBlocks = priorBlockCount + blocks.length;

  const manifestObj: DatManifest = {
    version: DAT_VERSION,
    generated_at: new Date().toISOString(),
    total_blocks: totalBlocks,
    total_mic: totalBlocks * MIC_PER_BLOCK,
    chain_tip_hash: chainTip,
    files: mergedFiles,
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
      const entry = newManifestEntries[filename];
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
    substrate_commit_ready: isSubstrateCommitReady(args.errors),
  };
}

function isSubstrateCommitReady(errors: CanonizationError[]): boolean {
  return errors.length === 0;
}

function loadExistingManifest(outputDir: string): DatManifest | null {
  const manifestPath = join(outputDir, 'MANIFEST.json');
  if (!existsSync(manifestPath)) return null;

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as DatManifest;
  } catch {
    return null;
  }
}

interface IncrementalWriteState {
  fileIndex: number;
  fileRecords: DatBlockRecord[];
  fileStartBlock: number;
  appendToExistingFile: boolean;
  existingFilename: string | null;
}

function resolveIncrementalWriteState(
  outputDir: string,
  existingManifest: DatManifest | null,
): IncrementalWriteState {
  if (!existingManifest || Object.keys(existingManifest.files).length === 0) {
    return {
      fileIndex: 0,
      fileRecords: [],
      fileStartBlock: 0,
      appendToExistingFile: false,
      existingFilename: null,
    };
  }

  const sorted = Object.entries(existingManifest.files).sort((a, b) => a[1].range[0] - b[1].range[0]);
  const [lastFilename, lastEntry] = sorted[sorted.length - 1];
  const lastFileIndex = sorted.length - 1;

  if (lastEntry.block_count < BLOCKS_PER_DAT_FILE) {
    const filepath = join(outputDir, lastFilename);
    if (!existsSync(filepath)) {
      return {
        fileIndex: lastFileIndex,
        fileRecords: [],
        fileStartBlock: lastEntry.range[0],
        appendToExistingFile: false,
        existingFilename: null,
      };
    }

    const content = readFileSync(filepath, 'utf8');
    const fileRecords = content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as DatBlockRecord);

    return {
      fileIndex: lastFileIndex,
      fileRecords,
      fileStartBlock: lastEntry.range[0],
      appendToExistingFile: true,
      existingFilename: lastFilename,
    };
  }

  return {
    fileIndex: sorted.length,
    fileRecords: [],
    fileStartBlock: 0,
    appendToExistingFile: false,
    existingFilename: null,
  };
}
