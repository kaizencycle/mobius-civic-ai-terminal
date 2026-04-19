/**
 * Terminal mesh / content-addressed read client (Phase 1–2 hybrid).
 *
 * When `NEXT_PUBLIC_MESH_ENABLED` is true and `NEXT_PUBLIC_MESH_GATEWAY_URL` is set,
 * `resolveIpfs` reads via the Kubo (or compatible) HTTP gateway (`/ipfs/<cid>`).
 * All normal Terminal JSON routes use the **API origin** (same as today).
 *
 * Phase 2 (libp2p mesh node) can extend this module to hit a mesh HTTP API or
 * WebSocket without changing call sites if they use `MeshClient.fetchApi`.
 */

export type MeshContentTransport = 'mesh' | 'unavailable';

export type MeshApiTransport = 'api';

export type IpfsResolveResult = {
  ok: boolean;
  /** Raw body when `ok` */
  body?: string;
  transport: MeshContentTransport;
  status?: number;
  error?: string;
};

export type MeshFetchApiResult = {
  response: Response;
  transport: MeshApiTransport;
};

export type MeshClientConfig = {
  /** Read from env in browser / Node */
  meshEnabled: boolean;
  /** Base URL of IPFS HTTP gateway (no trailing slash), e.g. http://127.0.0.1:8080 */
  meshGatewayBase: string | null;
  /** Terminal public origin for `/api/*` (defaults to relative "" in browser) */
  apiBase: string;
  /** Abort timeout for mesh gateway reads (ms) */
  meshTimeoutMs: number;
  /** Abort timeout for API reads (ms) */
  apiTimeoutMs: number;
};

function readBoolEnv(value: string | undefined, defaultWhenUnset: boolean): boolean {
  if (value === undefined || value === '') return defaultWhenUnset;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return defaultWhenUnset;
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function meshClientConfigFromEnv(): MeshClientConfig {
  const meshFlag = readBoolEnv(process.env.NEXT_PUBLIC_MESH_ENABLED, false);
  const gw = process.env.NEXT_PUBLIC_MESH_GATEWAY_URL?.trim();
  const meshEnabled = meshFlag && Boolean(gw && gw.length > 0);
  const apiBase = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  const meshTimeout = Number(process.env.NEXT_PUBLIC_MESH_TIMEOUT_MS ?? '8000');
  const apiTimeout = Number(process.env.NEXT_PUBLIC_MESH_API_TIMEOUT_MS ?? '12000');
  return {
    meshEnabled,
    meshGatewayBase: gw && gw.length > 0 ? trimSlash(gw) : null,
    apiBase,
    meshTimeoutMs: Number.isFinite(meshTimeout) ? meshTimeout : 8000,
    apiTimeoutMs: Number.isFinite(apiTimeout) ? apiTimeout : 12000,
  };
}

/** Loose CID / path check for gateway addressing */
export function looksLikeIpfsPath(resource: string): boolean {
  const s = resource.trim();
  if (s.startsWith('/ipfs/')) return true;
  if (s.startsWith('ipfs/')) return true;
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|bafy[a-z0-9]{50,})$/i.test(s)) return true;
  return false;
}

export class MeshClient {
  readonly config: MeshClientConfig;

  constructor(config?: Partial<MeshClientConfig>) {
    const base = meshClientConfigFromEnv();
    this.config = { ...base, ...config };
  }

  get isMeshReadsEnabled(): boolean {
    return this.config.meshEnabled && this.config.meshGatewayBase !== null;
  }

  /**
   * Resolve IPFS content by CID or `/ipfs/...` path via HTTP gateway.
   * Does not fabricate payloads — returns `ok: false` when mesh reads are off or fetch fails.
   */
  async resolveIpfs(cidOrPath: string): Promise<IpfsResolveResult> {
    if (!this.isMeshReadsEnabled || !this.config.meshGatewayBase) {
      return { ok: false, transport: 'unavailable', error: 'mesh_reads_disabled' };
    }

    const path = (() => {
      const t = cidOrPath.trim();
      if (t.startsWith('/ipfs/')) return t;
      if (t.startsWith('ipfs/')) return `/${t}`;
      return `/ipfs/${t}`;
    })();

    const url = `${this.config.meshGatewayBase}${path}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(this.config.meshTimeoutMs),
      });
      if (!res.ok) {
        return {
          ok: false,
          transport: 'mesh',
          status: res.status,
          error: `gateway_http_${res.status}`,
        };
      }
      const body = await res.text();
      return { ok: true, body, transport: 'mesh', status: res.status };
    } catch (e) {
      return {
        ok: false,
        transport: 'mesh',
        error: e instanceof Error ? e.message : 'mesh_fetch_failed',
      };
    }
  }

  /**
   * Fetch a Terminal JSON API path (e.g. `/api/terminal/snapshot-lite`).
   * Always uses the API origin — mesh does not replace `/api/*` until a mirror exists.
   */
  async fetchApi(path: string, init?: RequestInit): Promise<MeshFetchApiResult> {
    const p = path.startsWith('/') ? path : `/${path}`;
    const base = this.config.apiBase;
    const url = base ? `${base}${p}` : p;
    const response = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(this.config.apiTimeoutMs),
      cache: init?.cache ?? 'no-store',
    });
    return { response, transport: 'api' };
  }

  /**
   * Hybrid read: if `resource` looks like IPFS and mesh is on, use gateway; otherwise `fetchApi`.
   */
  async fetchHybrid(resource: string, init?: RequestInit): Promise<
    | { kind: 'ipfs'; result: IpfsResolveResult }
    | { kind: 'api'; result: MeshFetchApiResult }
  > {
    if (this.isMeshReadsEnabled && looksLikeIpfsPath(resource)) {
      const cidPart = resource.trim().replace(/^\/?ipfs\//i, '');
      return { kind: 'ipfs', result: await this.resolveIpfs(cidPart) };
    }
    return { kind: 'api', result: await this.fetchApi(resource, init) };
  }
}
