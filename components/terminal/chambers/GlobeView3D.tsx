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
type GlobeSceneState = {
  THREE: any;
  scene: any;
  camera: any;
  renderer: any;
  globe: any;
  pinMeshes: any[];
  pulseMeshes: any[];
  pins: GlobePin[];
  animationId: number;
  raycaster: any;
  mouse: any;
  isDragging: boolean;
  prevMouse: { x: number; y: number };
  autoRotate: boolean;
  autoRotateTimer: number | null;
  onMove: (e: MouseEvent) => void;
  onDown: (e: MouseEvent) => void;
  onUp: (e: MouseEvent) => void;
  resize: () => void;
  t: number;
};
export default function GlobeView3D({
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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webglReady, setWebglReady] = useState(false);
  const pins = useMemo(
    () => buildGlobePinsFromMicro(micro, echoEpicon),
    [micro, echoEpicon],
  );
  const domainByKey = useMemo(() => Object.fromEntries(domains.map((d) => [d.key, d])) as Record<string, SentimentDomain>, [domains]);
  const sceneRef = useRef<GlobeSceneState | null>(null);
  const pinsKey = useMemo(() => pins.map((p) => `${p.id}:${p.lat.toFixed(2)}:${p.lng.toFixed(2)}:${p.severity}`).join('|'), [pins]);
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
      scene.add(globe);
      const wireGeo = new THREE.SphereGeometry(1.001, 24, 24);
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x0f2744,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
      scene.add(new THREE.Mesh(wireGeo, wireMat));
      const atmGeo = new THREE.SphereGeometry(1.08, 64, 64);
      const atmMat = new THREE.MeshPhongMaterial({
        color: 0x0a3060,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      });
      scene.add(new THREE.Mesh(atmGeo, atmMat));
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
      let prevMouse = { x: 0, y: 0 };
      let autoRotate = true;
      let autoRotateTimer: number | null = null;
      let t = 0;
      const state: GlobeSceneState = {
        THREE,
        scene,
        camera,
        renderer,
        globe,
        pinMeshes: [],
        pulseMeshes: [],
        pins: [],
        animationId: 0,
        raycaster,
        mouse,
        isDragging,
        prevMouse,
        autoRotate,
        autoRotateTimer,
        onMove: (_e: MouseEvent) => {},
        onDown: (_e: MouseEvent) => {},
        onUp: (_e: MouseEvent) => {},
        resize: () => {},
        t,
      };
      sceneRef.current = state;
      const rotateAttached = (dy: number, dx: number) => {
        globe.rotation.y += dy;
        globe.rotation.x += dx;
        scene.children.forEach((c: any) => {
          if (c !== globe && c.type === 'Mesh') {
            c.rotation.y += dy;
            c.rotation.x += dx;
          }
        });
      };
      state.onDown = (e: MouseEvent) => {
        state.isDragging = true;
        state.autoRotate = false;
        if (state.autoRotateTimer != null) window.clearTimeout(state.autoRotateTimer);
        state.prevMouse = { x: e.clientX, y: e.clientY };
      };
      state.onMove = (e: MouseEvent) => {
        if (state.isDragging) {
          const dx = e.clientX - state.prevMouse.x;
          const dy = e.clientY - state.prevMouse.y;
          const rotY = dx * 0.005;
          const rotX = dy * 0.005;
          rotateAttached(rotY, rotX);
          state.prevMouse = { x: e.clientX, y: e.clientY };
        }
        const rect = renderer.domElement.getBoundingClientRect();
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
            text: `${sig.source} · ${(sig.value * 100).toFixed(0)}%`,
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
        state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        const heads = state.pinMeshes.filter((m) => m.userData.kind === 'head');
        const hits = state.raycaster.intersectObjects(heads);
        if (hits.length > 0) {
          setSelected(hits[0].object.userData.pin as GlobePin);
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
          const dy = 0.0008;
          globe.rotation.y += dy;
          scene.children.forEach((c: any) => {
            if (c !== globe && c.type === 'Mesh') c.rotation.y += dy;
          });
        }
        for (const ring of state.pulseMeshes) {
          const ud = ring.userData as { phase: number; speed: number };
          const s = 1 + Math.sin(state.t * ud.speed * 40 + ud.phase) * 0.4;
          ring.scale.setScalar(s);
          const mat = ring.material as { opacity?: number };
          if (typeof mat.opacity === 'number') {
            mat.opacity = 0.5 - Math.sin(state.t * ud.speed * 40 + ud.phase) * 0.3;
          }
        }
        renderer.render(scene, camera);
      }
      animate();

      // ── Country border lines ──────────────────────────────────────────
      // Fetched async so the globe renders immediately; added as children
      // of the globe mesh so they rotate with it for free.
      void (async () => {
        try {
          const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
          if (!res.ok || disposed) return;
          const topo = await res.json() as any;
          if (disposed) return;

          const tf = topo.transform as { scale: [number, number]; translate: [number, number] } | undefined;
          const borderMat = new THREE.LineBasicMaterial({ color: 0x1e4a7a, transparent: true, opacity: 0.5 });

          const arcCoords = (idx: number): [number, number][] => {
            const raw: [number, number][] = topo.arcs[idx < 0 ? ~idx : idx];
            let x = 0, y = 0;
            const pts = raw.map(([dx, dy]: [number, number]) => {
              x += dx; y += dy;
              const lng = tf ? x * tf.scale[0] + tf.translate[0] : x;
              const lat = tf ? y * tf.scale[1] + tf.translate[1] : y;
              return [lng, lat] as [number, number];
            });
            return idx < 0 ? pts.reverse() : pts;
          };

          const R = 1.002; // just above the sphere surface to avoid z-fighting
          for (const geo of topo.objects.countries.geometries as any[]) {
            const rings: number[][] =
              geo.type === 'Polygon' ? (geo.arcs as number[][]) :
              geo.type === 'MultiPolygon' ? (geo.arcs as number[][][]).flat() : [];
            for (const ring of rings) {
              const pts3d: any[] = [];
              for (const arcIdx of ring) {
                for (const [lng, lat] of arcCoords(arcIdx)) {
                  pts3d.push(latLngToXYZ(THREE, lat, lng, R));
                }
              }
              if (pts3d.length < 2) continue;
              globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3d), borderMat));
            }
          }
        } catch {
          // country borders are optional — fail silently
        }
      })();

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
  const rebuildPins = useCallback(() => {
    const st = sceneRef.current;
    if (!st) return;
    for (const m of st.pinMeshes) {
      st.globe.remove(m);
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as { dispose?: () => void };
      mat?.dispose?.();
    }
    for (const m of st.pulseMeshes) {
      st.globe.remove(m);
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as { dispose?: () => void };
      mat?.dispose?.();
    }
    st.pinMeshes = [];
    st.pulseMeshes = [];
    st.pins = pins;
    const THREE = st.THREE;
    for (const sig of pins) {
      const pos = latLngToXYZ(THREE, sig.lat, sig.lng);
      const color = severityColor(sig.severity);
      const stemGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.06, 6);
      const stemMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.copy(pos.clone().multiplyScalar(0.97));
      stem.lookAt(0, 0, 0);
      stem.rotateX(Math.PI / 2);
      st.globe.add(stem);
      st.pinMeshes.push(stem);
      const headGeo = new THREE.SphereGeometry(0.018, 8, 8);
      const headMat = new THREE.MeshBasicMaterial({ color });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.copy(pos.clone().multiplyScalar(1.04));
      head.userData = { pin: sig, kind: 'head' };
      st.globe.add(head);
      st.pinMeshes.push(head);
      if (sig.pulse) {
        const ringGeo = new THREE.RingGeometry(0.02, 0.028, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos.clone().multiplyScalar(1.04));
        ring.lookAt(pos.clone().multiplyScalar(2));
        ring.userData = { phase: Math.random() * Math.PI * 2, speed: 0.02 + Math.random() * 0.01 };
        st.globe.add(ring);
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
  const focusDomain = useCallback(
    (key: SentimentDomainKey) => {
      const match = pins.find((p) => p.domainKey === key);
      if (match) setSelected(match);
    },
    [pins],
  );
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#020408] font-mono text-slate-200">
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes globeInsp { from { opacity: 0; transform: translateY(-50%) translateX(8px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }`,
        }}
      />
      <div ref={containerRef} className="relative h-[min(72vh,640px)] w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-[#020408]/95 to-transparent px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Mobius Civic Terminal</div>
        <div
          className={cn(
            'pointer-events-none rounded border px-3 py-1 text-[11px] uppercase tracking-[0.12em]',
            giChipClass(giScore),
          )}
        >
          GI {giScore.toFixed(2)} · {giChipLabel(giScore)}
        </div>
        <div className="text-[10px] tracking-[0.1em] text-slate-600">
          {cycleId} · {clockLabel}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-[0.12em] text-slate-600">
        Drag to rotate · Click pins to inspect
      </div>
      <div className="flex border-t border-white/[0.06] bg-[#020408]/90">
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
          return (
            <button
              key={key}
              type="button"
              onClick={() => focusDomain(key)}
              className="flex flex-1 flex-col items-center border-r border-white/[0.04] px-1 py-2 transition hover:bg-white/[0.04] sm:px-2"
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
          className="fixed right-4 top-1/2 z-50 w-[min(92vw,280px)] rounded-md border border-white/10 bg-[#020408]/95 p-5 shadow-xl backdrop-blur-md"
          style={{ top: '50%', animation: 'globeInsp 0.2s ease' }}
        >
          <button
            type="button"
            className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
            aria-label="Close inspection"
            onClick={() => setSelected(null)}
          >
            ✕
          </button>
          <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-slate-500">{selected.source}</div>
          <div className="mb-3 text-[13px] leading-snug text-slate-200">{selected.title}</div>
          <div className="mb-2 flex items-center gap-2">
            <span
              className={cn(
                'text-[28px] font-bold',
                selected.value >= 0.75 ? 'text-emerald-400' : selected.value >= 0.5 ? 'text-amber-400' : 'text-rose-400',
              )}
            >
              {selected.value.toFixed(2)}
            </span>
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
          {miiScore != null ? (
            <div className="mb-3 text-[10px] text-slate-500">
              MII <span className="text-slate-300">{miiScore.toFixed(2)}</span>
            </div>
          ) : null}
          <hr className="mb-3 border-white/[0.06]" />
          <div className="max-h-40 space-y-1 overflow-y-auto text-[9px] leading-relaxed text-slate-500">
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
