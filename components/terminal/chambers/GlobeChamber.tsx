'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MicroAgentSweepResult } from '@/lib/agents/micro';
import type { EpiconItem } from '@/lib/terminal/types';
import {
  buildGlobePinsFromMicro,
  GLOBE_DOMAIN_ORDER,
  type GlobePin,
  type SentimentDomainKey,
} from '@/lib/terminal/globePins';
import { computeGlobeDeltaLines } from '@/lib/globe/globeDelta';
import { cn } from '@/lib/utils';

/* eslint-disable @typescript-eslint/no-explicit-any -- Three.js loaded from CDN at runtime */

type MicroSweepResponse = MicroAgentSweepResult & { ok?: boolean };

type SentimentDomain = {
  key: SentimentDomainKey;
  label: string;
  agent: string;
  score: number | null;
  status: 'nominal' | 'stressed' | 'critical' | 'unknown';
};

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const TOPOJSON_CLIENT_CDN = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const DRAG_CLICK_THRESHOLD = 8;
const FRESH_SEC = 120;
const AGING_SEC = 900;
const STALE_SEC = 3600;

function loadThreeScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as { THREE?: any };
  if (w.THREE) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${THREE_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Three.js load failed')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = THREE_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Three.js load failed'));
    document.head.appendChild(s);
  });
}

function loadExternalScript(src: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Script load failed: ${src}`)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = 'true';
      resolve();
    };
    s.onerror = () => reject(new Error(`Script load failed: ${src}`));
    document.head.appendChild(s);
  });
}

function latLngToXYZ(THREE: any, lat: number, lng: number, r = 1.015) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function severityColor(sev: GlobePin['severity']): number {
  if (sev === 'critical') return 0xef4444;
  if (sev === 'elevated') return 0xf59e0b;
  return 0x10b981;
}

function freshnessHeadOpacity(ageSec: number): number {
  if (ageSec < FRESH_SEC) return 1;
  if (ageSec < AGING_SEC) return 1 - ((ageSec - FRESH_SEC) / (AGING_SEC - FRESH_SEC)) * 0.45;
  if (ageSec < STALE_SEC) return 0.55 - ((ageSec - AGING_SEC) / (STALE_SEC - AGING_SEC)) * 0.2;
  return 0.32;
}

function stemOpacity(ageSec: number): number {
  return Math.max(0.25, freshnessHeadOpacity(ageSec) * 0.72);
}

function giChipClass(score: number): string {
  if (score > 0.85) return 'border-emerald-500 text-emerald-400 bg-emerald-500/10';
  if (score > 0.7) return 'border-amber-500 text-amber-400 bg-amber-500/10';
  return 'border-rose-500 text-rose-400 bg-rose-500/10';
}

function giChipLabel(score: number): string {
  if (score > 0.85) return 'GREEN';
  if (score > 0.7) return 'YELLOW';
  return 'RED';
}

type GeoPosition = [number, number];
type GeoRing = GeoPosition[];
type GeoFeature = {
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
};
type GeoFeatureCollection = { features: GeoFeature[] };
type TopologyCountries = {
  type: string;
  objects: { countries: unknown };
};

function extractCoords(geometry: GeoFeature['geometry']): GeoRing[] {
  const rings: GeoRing[] = [];
  if (geometry.type === 'Polygon') {
    (geometry.coordinates as number[][][]).forEach((r) => rings.push(r as GeoRing));
  } else if (geometry.type === 'MultiPolygon') {
    (geometry.coordinates as number[][][][]).forEach((poly) => {
      poly.forEach((r) => rings.push(r as GeoRing));
    });
  }
  return rings;
}

function drawGeoFeaturePath(
  ctx: CanvasRenderingContext2D,
  feature: GeoFeature,
  width: number,
  height: number,
) {
  const coords = extractCoords(feature.geometry);
  for (const ring of coords) {
    if (ring.length < 3) continue;
    const [lng0, lat0] = ring[0];
    ctx.moveTo(((lng0 + 180) / 360) * width, ((90 - lat0) / 180) * height);
    for (const [lng, lat] of ring.slice(1)) {
      ctx.lineTo(((lng + 180) / 360) * width, ((90 - lat) / 180) * height);
    }
    ctx.closePath();
  }
}

function createGlobeTexture(THREE: any, countries: GeoFeatureCollection) {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#030d1f';
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  for (const feature of countries.features) {
    drawGeoFeaturePath(ctx, feature, width, height);
  }
  ctx.fillStyle = '#0a1f3d';
  ctx.fill();
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function addGraticule(globeGroup: any, THREE: any) {
  const material = new THREE.LineBasicMaterial({
    color: 0x0a1f3d,
    transparent: true,
    opacity: 0.25,
  });
  const R = 1.002;

  for (let lat = -60; lat <= 60; lat += 30) {
    const points: unknown[] = [];
    for (let lng = -180; lng <= 180; lng += 2) {
      points.push(latLngToXYZ(THREE, lat, lng, R));
    }
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let lng = -180; lng < 180; lng += 30) {
    const points: unknown[] = [];
    for (let lat = -90; lat <= 90; lat += 2) {
      points.push(latLngToXYZ(THREE, lat, lng, R));
    }
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }
}

type GlobeSceneState = {
  THREE: any;
  scene: any;
  camera: any;
  renderer: any;
  globeGroup: any;
  pinMeshes: any[];
  pulseMeshes: any[];
  pins: GlobePin[];
  animationId: number;
  raycaster: any;
  mouse: any;
  isDragging: boolean;
  dragDistance: number;
  prevMouse: { x: number; y: number };
  autoRotate: boolean;
  autoRotateTimer: number | null;
  targetRotX: number;
  targetRotY: number;
  onMove: (e: MouseEvent) => void;
  onDown: (e: MouseEvent) => void;
  onUp: (e: MouseEvent) => void;
  resize: () => void;
  t: number;
};

async function addCountryGeographyLayers(THREE: any, globeGroup: any, globe: any) {
  try {
    await loadExternalScript(TOPOJSON_CLIENT_CDN);
    const res = await fetch(WORLD_ATLAS_URL);
    if (!res.ok) throw new Error(`world atlas fetch failed: ${res.status}`);
    const topology = (await res.json()) as TopologyCountries;

    const topo = window as unknown as {
      topojson?: { feature: (topologyData: TopologyCountries, objectData: unknown) => GeoFeatureCollection };
    };
    if (!topo.topojson?.feature) throw new Error('topojson client unavailable');

    const countries = topo.topojson.feature(topology, topology.objects.countries);
    const texture = createGlobeTexture(THREE, countries);
    if (texture) {
      globe.material.map = texture;
      globe.material.color = new THREE.Color('#030d1f');
      globe.material.needsUpdate = true;
    }

    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0x1e3a5f,
      transparent: true,
      opacity: 0.5,
    });

    for (const feature of countries.features) {
      const coords = extractCoords(feature.geometry);
      for (const ring of coords) {
        const points = ring.map(([lng, lat]) => latLngToXYZ(THREE, lat, lng, 1.001));
        if (points.length < 2) continue;
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, borderMaterial);
        globeGroup.add(line);
      }
    }

    addGraticule(globeGroup, THREE);
  } catch (err) {
    console.error('[globe] country geography failed:', err);
  }
}

function rotateGlobeTargetToLatLng(THREE: any, lat: number, lng: number) {
  return {
    y: THREE.MathUtils.degToRad(-(lng + 90)),
    x: THREE.MathUtils.degToRad(lat * 0.65),
  };
}

export default function GlobeChamber({
  micro,
  echoEpicon,
  domains,
  cycleId,
  clockLabel,
  giScore,
  miiScore,
}: {
  micro: MicroSweepResponse | null;
  echoEpicon: EpiconItem[];
  domains: SentimentDomain[];
  cycleId: string;
  clockLabel: string;
  giScore: number;
  miiScore: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<GlobePin | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<SentimentDomainKey | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webglReady, setWebglReady] = useState(false);
  const [incidentAsset, setIncidentAsset] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; url: string; cached: boolean }
    | { status: 'unavailable'; message: string }
  >({ status: 'idle' });
  const [heroBusy, setHeroBusy] = useState(false);
  const prevPinsRef = useRef<GlobePin[]>([]);
  const [deltaLines, setDeltaLines] = useState<string[]>([]);

  const pins = useMemo(
    () => buildGlobePinsFromMicro(micro, echoEpicon),
    [micro, echoEpicon],
  );

  useEffect(() => {
    setDeltaLines(computeGlobeDeltaLines(prevPinsRef.current, pins, giScore));
    prevPinsRef.current = pins;
  }, [pins, giScore]);

  const domainByKey = useMemo(
    () => Object.fromEntries(domains.map((d) => [d.key, d])) as Record<string, SentimentDomain>,
    [domains],
  );

  const sceneRef = useRef<GlobeSceneState | null>(null);

  const pinsKey = useMemo(
    () =>
      pins
        .map(
          (p) =>
            `${p.id}:${p.lat.toFixed(2)}:${p.lng.toFixed(2)}:${p.severity}:${p.confidence.toFixed(2)}:${p.provisional}:${p.updatedAt}`,
        )
        .join('|'),
    [pins],
  );

  useEffect(() => {
    if (!selected) {
      setIncidentAsset({ status: 'idle' });
      return;
    }
    if (selected.severity === 'nominal') {
      setIncidentAsset({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setIncidentAsset({ status: 'loading' });
    void (async () => {
      try {
        const res = await fetch('/api/globe/render-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'incident_card',
            title: selected.title,
            domain: selected.domainKey,
            signalId: selected.id,
            cycle: cycleId,
            severity: selected.severity,
            metadata: {
              region: selected.meta.region ?? selected.meta.place,
              cluster: selected.clusterLabel,
            },
          }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          imageUrl?: string;
          cached?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (j.ok && j.imageUrl) {
          setIncidentAsset({ status: 'ready', url: j.imageUrl, cached: Boolean(j.cached) });
        } else {
          setIncidentAsset({
            status: 'unavailable',
            message: j.error ?? 'Visual asset unavailable',
          });
        }
      } catch {
        if (!cancelled) {
          setIncidentAsset({ status: 'unavailable', message: 'Provider offline' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.severity, cycleId, selected?.title, selected?.domainKey]);

  const requestCycleHero = useCallback(async () => {
    setHeroBusy(true);
    try {
      const elevated = pins.filter((p) => p.severity !== 'nominal').length;
      const res = await fetch('/api/globe/render-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'cycle_hero',
          title: `${cycleId} world state`,
          cycle: cycleId,
          severity: giScore > 0.85 ? 'nominal' : giScore > 0.7 ? 'elevated' : 'critical',
          metadata: {
            giBand: giScore > 0.85 ? 'nominal' : giScore > 0.7 ? 'watch' : 'stressed',
            highlights: [
              `${pins.length} globe pins`,
              elevated ? `${elevated} non-nominal` : 'all nominal pins',
              `GI ${giScore.toFixed(2)}`,
            ],
          },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; imageUrl?: string; error?: string };
      if (j.ok && j.imageUrl) {
        window.open(j.imageUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.alert(j.error ?? 'Cycle hero render failed');
      }
    } finally {
      setHeroBusy(false);
    }
  }, [pins, cycleId, giScore]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;

    async function boot() {
      try {
        await loadThreeScript();
      } catch {
        if (!disposed) setLoadError('Globe requires WebGL and Three.js');
        return;
      }
      if (disposed) return;

      const el = containerRef.current;
      if (!el) return;

      const w = window as unknown as { THREE: any };
      const THREE = w.THREE;
      if (!THREE) {
        setLoadError('Three.js unavailable');
        return;
      }

      const width = el.clientWidth || 800;
      const height = el.clientHeight || 520;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.z = 2.8;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x020408, 1);
      el.appendChild(renderer.domElement);

      const globeGroup = new THREE.Group();
      scene.add(globeGroup);

      const globeGeo = new THREE.SphereGeometry(1, 64, 64);
      const globeMat = new THREE.MeshPhongMaterial({
        color: 0x0a1628,
        emissive: 0x040d1a,
        specular: 0x1e3a5f,
        shininess: 8,
        transparent: true,
        opacity: 0.95,
      });
      const globe = new THREE.Mesh(globeGeo, globeMat);
      globeGroup.add(globe);

      const wireGeo = new THREE.SphereGeometry(1.001, 24, 24);
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x0f2744,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
      globeGroup.add(new THREE.Mesh(wireGeo, wireMat));

      const atmGeo = new THREE.SphereGeometry(1.08, 64, 64);
      const atmMat = new THREE.MeshPhongMaterial({
        color: 0x0a3060,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      });
      globeGroup.add(new THREE.Mesh(atmGeo, atmMat));

      scene.add(new THREE.AmbientLight(0x112244, 0.6));
      const sun = new THREE.DirectionalLight(0x4488cc, 0.8);
      sun.position.set(5, 3, 5);
      scene.add(sun);
      const rim = new THREE.DirectionalLight(0x001133, 0.4);
      rim.position.set(-5, -3, -5);
      scene.add(rim);

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let isDragging = false;
      let dragDistance = 0;
      let prevMouse = { x: 0, y: 0 };
      let autoRotate = true;
      let autoRotateTimer: number | null = null;
      let targetRotX = 0;
      let targetRotY = 0;
      let t = 0;

      const state: GlobeSceneState = {
        THREE,
        scene,
        camera,
        renderer,
        globeGroup,
        pinMeshes: [],
        pulseMeshes: [],
        pins: [],
        animationId: 0,
        raycaster,
        mouse,
        isDragging,
        dragDistance,
        prevMouse,
        autoRotate,
        autoRotateTimer,
        targetRotX,
        targetRotY,
        onMove: (_e: MouseEvent) => {},
        onDown: (_e: MouseEvent) => {},
        onUp: (_e: MouseEvent) => {},
        resize: () => {},
        t,
      };
      sceneRef.current = state;

      state.onDown = (e: MouseEvent) => {
        state.isDragging = true;
        state.dragDistance = 0;
        state.autoRotate = false;
        if (state.autoRotateTimer != null) window.clearTimeout(state.autoRotateTimer);
        state.prevMouse = { x: e.clientX, y: e.clientY };
      };

      state.onMove = (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        if (state.isDragging) {
          const dx = e.clientX - state.prevMouse.x;
          const dy = e.clientY - state.prevMouse.y;
          state.dragDistance += Math.abs(dx) + Math.abs(dy);
          globeGroup.rotation.y += dx * 0.005;
          globeGroup.rotation.x += dy * 0.005;
          state.targetRotY = globeGroup.rotation.y;
          state.targetRotX = globeGroup.rotation.x;
          state.prevMouse = { x: e.clientX, y: e.clientY };
        }

        state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        const heads = state.pinMeshes.filter((m) => m.userData.kind === 'head');
        const hits = state.raycaster.intersectObjects(heads);
        if (hits.length > 0) {
          const sig = hits[0].object.userData.pin as GlobePin;
          setTooltip({
            x: e.clientX + 14,
            y: e.clientY - 10,
            text: `${sig.source} · conf ${(sig.confidence * 100).toFixed(0)}% · ${sig.ageSec < 60 ? `${sig.ageSec}s` : `${Math.floor(sig.ageSec / 60)}m`} fresh`,
          });
          renderer.domElement.style.cursor = 'pointer';
        } else {
          setTooltip(null);
          renderer.domElement.style.cursor = 'grab';
        }
      };

      state.onUp = (e: MouseEvent) => {
        if (!state.isDragging) return;
        state.isDragging = false;

        const rect = renderer.domElement.getBoundingClientRect();
        if (state.dragDistance < DRAG_CLICK_THRESHOLD) {
          state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          state.raycaster.setFromCamera(state.mouse, state.camera);
          const heads = state.pinMeshes.filter((m) => m.userData.kind === 'head');
          const hits = state.raycaster.intersectObjects(heads);
          if (hits.length > 0) {
            setSelected(hits[0].object.userData.pin as GlobePin);
          }
        }

        const tid = window.setTimeout(() => {
          state.autoRotate = true;
          state.autoRotateTimer = null;
        }, 4000);
        state.autoRotateTimer = tid;
      };

      state.resize = () => {
        if (!containerRef.current) return;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        if (cw < 2 || ch < 2) return;
        state.camera.aspect = cw / ch;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(cw, ch);
      };

      renderer.domElement.addEventListener('mousedown', state.onDown);
      renderer.domElement.addEventListener('mousemove', state.onMove);
      renderer.domElement.addEventListener('mouseup', state.onUp);
      window.addEventListener('resize', state.resize);

      function animate() {
        state.animationId = requestAnimationFrame(animate);
        state.t += 0.016;

        if (state.autoRotate) {
          state.targetRotY += 0.0008;
        }
        const lerp = 0.08;
        globeGroup.rotation.y += (state.targetRotY - globeGroup.rotation.y) * lerp;
        globeGroup.rotation.x += (state.targetRotX - globeGroup.rotation.x) * lerp;

        for (const ring of state.pulseMeshes) {
          const ud = ring.userData as { phase: number; speed: number; baseOpacity: number };
          const s = 1 + Math.sin(state.t * ud.speed * 40 + ud.phase) * 0.4;
          ring.scale.setScalar(s);
          const mat = ring.material as { opacity?: number };
          if (typeof mat.opacity === 'number') {
            const swing = Math.sin(state.t * ud.speed * 40 + ud.phase) * 0.22;
            mat.opacity = Math.max(0.12, Math.min(0.92, ud.baseOpacity + swing));
          }
        }

        renderer.render(scene, camera);
      }
      animate();
      void addCountryGeographyLayers(THREE, globeGroup, globe);
      setWebglReady(true);
    }

    void boot();

    return () => {
      disposed = true;
      setWebglReady(false);
      const st = sceneRef.current;
      if (st) {
        cancelAnimationFrame(st.animationId);
        if (st.autoRotateTimer != null) window.clearTimeout(st.autoRotateTimer);
        st.renderer.domElement.removeEventListener('mousedown', st.onDown);
        st.renderer.domElement.removeEventListener('mousemove', st.onMove);
        st.renderer.domElement.removeEventListener('mouseup', st.onUp);
        window.removeEventListener('resize', st.resize);
        st.renderer.dispose();
        if (st.renderer.domElement.parentElement) {
          st.renderer.domElement.parentElement.removeChild(st.renderer.domElement);
        }
      }
      sceneRef.current = null;
    };
  }, []);

  const focusDomain = useCallback(
    (key: SentimentDomainKey) => {
      const match = pins.find((p) => p.domainKey === key);
      if (!match) return;
      setSelectedDomain(key);
      setSelected(match);
      const st = sceneRef.current;
      if (!st) return;
      st.autoRotate = false;
      if (st.autoRotateTimer != null) window.clearTimeout(st.autoRotateTimer);
      const t = rotateGlobeTargetToLatLng(st.THREE, match.lat, match.lng);
      st.targetRotY = t.y;
      st.targetRotX = t.x;
      window.setTimeout(() => {
        if (!sceneRef.current) return;
        sceneRef.current.autoRotate = true;
      }, 5000);
    },
    [pins],
  );

  const rebuildPins = useCallback(() => {
    const st = sceneRef.current;
    if (!st) return;

    for (const m of st.pinMeshes) {
      st.globeGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as { dispose?: () => void };
      mat?.dispose?.();
    }
    for (const m of st.pulseMeshes) {
      st.globeGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as { dispose?: () => void };
      mat?.dispose?.();
    }
    st.pinMeshes = [];
    st.pulseMeshes = [];
    st.pins = pins;

    const THREE = st.THREE;
    const group = st.globeGroup;

    for (const sig of pins) {
      const pos = latLngToXYZ(THREE, sig.lat, sig.lng);
      const color = severityColor(sig.severity);
      const headOp = freshnessHeadOpacity(sig.ageSec);
      const stemOp = stemOpacity(sig.ageSec);

      const stemGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.06, 6);
      const stemMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: stemOp,
      });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.copy(pos.clone().multiplyScalar(0.97));
      stem.lookAt(0, 0, 0);
      stem.rotateX(Math.PI / 2);
      group.add(stem);
      st.pinMeshes.push(stem);

      const headGeo = new THREE.SphereGeometry(0.018, 8, 8);
      const headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: headOp });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.copy(pos.clone().multiplyScalar(1.04));
      head.userData = { pin: sig, kind: 'head' };
      group.add(head);
      st.pinMeshes.push(head);

      if (sig.provisional) {
        const dashGeo = new THREE.RingGeometry(0.032, 0.036, 32);
        const dashMat = new THREE.MeshBasicMaterial({
          color: 0x64748b,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        });
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.copy(pos.clone().multiplyScalar(1.04));
        dash.lookAt(pos.clone().multiplyScalar(2));
        group.add(dash);
        st.pinMeshes.push(dash);
      }

      if (sig.pulse) {
        const ringGeo = new THREE.RingGeometry(0.02, 0.028, 16);
        const baseOp = 0.35 + sig.confidence * 0.45;
        const ringMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: baseOp,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos.clone().multiplyScalar(1.04));
        ring.lookAt(pos.clone().multiplyScalar(2));
        ring.userData = {
          phase: Math.random() * Math.PI * 2,
          speed: 0.02 + Math.random() * 0.01,
          baseOpacity: baseOp,
        };
        group.add(ring);
        st.pulseMeshes.push(ring);
      }
    }

    requestAnimationFrame(() => sceneRef.current?.resize());
  }, [pins]);

  useEffect(() => {
    if (!webglReady || !sceneRef.current) return;
    const id = requestAnimationFrame(rebuildPins);
    return () => cancelAnimationFrame(id);
  }, [webglReady, pinsKey, rebuildPins]);

  const formatAge = (sec: number) => {
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  };

  return (
    <div className="relative -mx-0.5 overflow-hidden border-y border-slate-800 bg-[#020408] font-mono text-slate-200 sm:mx-0 sm:rounded-lg sm:border">
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes globeInsp { from { opacity: 0; transform: translateY(-50%) translateX(8px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }`,
        }}
      />
      <div ref={containerRef} className="relative h-[min(72vh,640px)] w-full" />

      <div className="pointer-events-none absolute left-3 top-12 z-10 max-w-[14rem] rounded border border-white/[0.06] bg-[#020408]/85 px-2.5 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">World state delta</div>
        {deltaLines.map((line) => (
          <div key={line} className="text-[9px] leading-snug text-slate-400">
            {line}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-end bg-gradient-to-b from-[#020408]/95 to-transparent px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={cn(
              'pointer-events-none rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] sm:px-3 sm:py-1 sm:text-[11px]',
              giChipClass(giScore),
            )}
          >
            GI {giScore.toFixed(2)} · {giChipLabel(giScore)}
          </div>
          <button
            type="button"
            onClick={() => void requestCycleHero()}
            disabled={heroBusy}
            className="pointer-events-auto rounded border border-slate-600/80 bg-slate-900/90 px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40"
          >
            {heroBusy ? 'Rendering…' : 'Render cycle hero'}
          </button>
          <div className="text-[9px] tracking-[0.1em] text-slate-600 sm:text-[10px]">
            {cycleId} · {clockLabel}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-[0.12em] text-slate-600">
        Drag to rotate · Click pins to inspect
      </div>

      <div className="flex overflow-x-auto border-t border-white/[0.06] bg-[#020408]/90 [-webkit-overflow-scrolling:touch]">
        {GLOBE_DOMAIN_ORDER.map((key) => {
          const d = domainByKey[key];
          const score = d?.score;
          const label = d?.label ?? key.toUpperCase();
          const agent = d?.agent ?? '—';
          const scoreClass =
            score == null ? 'text-slate-500'
            : score >= 0.8 ? 'text-emerald-400'
            : score >= 0.6 ? 'text-amber-400'
            : 'text-rose-400';
          const active = selectedDomain === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => focusDomain(key)}
              className={cn(
                'flex min-w-[4.5rem] shrink-0 flex-col items-center border-r border-white/[0.04] px-2 py-2 transition sm:min-w-0 sm:flex-1',
                active ? 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/25' : 'hover:bg-white/[0.04]',
              )}
            >
              <div className="text-[9px] uppercase tracking-[0.1em] text-slate-600">{label}</div>
              <div className={cn('text-[13px] font-bold', scoreClass)}>{score != null ? score.toFixed(2) : '—'}</div>
              <div className="text-[8px] text-slate-700">{agent}</div>
            </button>
          );
        })}
      </div>

      {tooltip ? (
        <div
          className="pointer-events-none fixed z-[60] rounded border border-white/10 bg-[#020408]/90 px-3 py-2 text-[10px] text-slate-400"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      ) : null}

      {selected ? (
        <div
          className="fixed inset-x-2 bottom-2 z-50 max-h-[68vh] overflow-y-auto rounded-md border border-white/10 bg-[#020408]/95 p-4 shadow-xl backdrop-blur-md md:inset-x-auto md:bottom-auto md:right-4 md:top-1/2 md:max-h-[min(88vh,640px)] md:w-[min(92vw,280px)] md:p-5"
          style={{ animation: 'globeInsp 0.2s ease' }}
        >
          <button
            type="button"
            className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
            aria-label="Close inspection"
            onClick={() => {
              setSelected(null);
              setSelectedDomain(null);
            }}
          >
            ✕
          </button>

          {incidentAsset.status === 'loading' ? (
            <div className="mb-3 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-2 text-[9px] text-amber-200/90">
              Rendering visual asset…
            </div>
          ) : null}
          {incidentAsset.status === 'ready' ? (
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={incidentAsset.url}
                alt=""
                className="w-full rounded border border-white/10 object-cover"
                loading="lazy"
              />
              {incidentAsset.cached ? (
                <div className="mt-1 text-[8px] text-slate-600">Cached asset</div>
              ) : null}
            </div>
          ) : null}
          {incidentAsset.status === 'unavailable' ? (
            <div className="mb-3 rounded border border-slate-700/80 bg-slate-900/50 px-2 py-2 text-[9px] text-slate-500">
              Visual asset unavailable — {incidentAsset.message}
            </div>
          ) : null}

          <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-slate-500">{selected.source}</div>
          <div className="mb-2 text-[13px] leading-snug text-slate-200">{selected.title}</div>
          <p className="mb-3 text-[10px] leading-relaxed text-slate-500">{selected.narrativeWhy}</p>

          <div className="mb-2 flex flex-wrap gap-1 text-[8px] uppercase tracking-[0.08em]">
            <span className="rounded border border-slate-600/60 px-1.5 py-0.5 text-slate-500">Feed</span>
            <span className="text-slate-600">{selected.source.split('·')[1]?.trim() ?? 'micro'}</span>
            {selected.meta.epiconId ? (
              <span className="rounded border border-sky-500/25 px-1.5 py-0.5 text-sky-400/90">
                EPICON {String(selected.meta.epiconId).slice(0, 12)}…
              </span>
            ) : (
              <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-500">Ledger pending path</span>
            )}
          </div>

          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Integrity</span>
            <span
              className={cn(
                'text-[22px] font-bold',
                selected.value >= 0.75 ? 'text-emerald-400' : selected.value >= 0.5 ? 'text-amber-400' : 'text-rose-400',
              )}
            >
              {selected.value.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500">Conf {(selected.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded border px-2 py-0.5 text-[9px] uppercase tracking-[0.1em]',
                selected.severity === 'nominal'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : selected.severity === 'critical'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              )}
            >
              {selected.severity}
            </span>
            {selected.provisional ? (
              <span className="rounded border border-dashed border-slate-500/50 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-500">
                Provisional
              </span>
            ) : null}
          </div>
          <div className="mb-3 h-1 overflow-hidden rounded bg-white/10">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${selected.value * 100}%`,
                background:
                  selected.value >= 0.75 ? '#10b981' : selected.value >= 0.5 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <div className="mb-2 text-[9px] text-slate-500">
            Updated <span className="text-slate-400">{formatAge(selected.ageSec)}</span>
            {selected.clusterLabel ? (
              <>
                {' '}
                · <span className="text-slate-400">{selected.clusterLabel}</span>
              </>
            ) : null}
          </div>
          {miiScore != null ? (
            <div className="mb-3 text-[10px] text-slate-500">
              MII <span className="text-slate-300">{miiScore.toFixed(2)}</span>
            </div>
          ) : null}
          <div className="mb-2 text-[9px] text-slate-600">
            <span className="text-slate-500">Provenance: </span>
            {selected.provenance}
          </div>
          <hr className="mb-3 border-white/[0.06]" />
          <div className="max-h-32 space-y-1 overflow-y-auto text-[9px] leading-relaxed text-slate-500">
            {Object.entries(selected.meta).map(([k, v]) => (
              <div key={k}>
                <span className="text-slate-600">{k}: </span>
                {String(v)}
              </div>
            ))}
          </div>
          <div className="mt-3 inline-block rounded border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-sky-300">
            {selected.agent}
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#020408]/90 p-4 text-center text-sm text-slate-400">
          {loadError}
        </div>
      ) : null}
    </div>
  );
}
