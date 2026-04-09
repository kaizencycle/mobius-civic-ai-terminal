"use client";

import { useEffect, useReducer, useRef, useCallback } from "react";

export type JournalAgent =
  | "ATLAS"
  | "ZEUS"
  | "HERMES"
  | "ECHO"
  | "AUREA"
  | "JADE"
  | "EVE"
  | "DAEDALUS";

export interface JournalEntry {
  id: string;
  ts: string;
  agent: JournalAgent | string;
  action: string;
  detail?: string;
  cycle?: string;
  integrity_delta?: number;
  tags?: string[];
}

export type SSEStatus = "connecting" | "live" | "fallback" | "error";

interface JournalState {
  entries: JournalEntry[];
  status: SSEStatus;
  lastEventAt: Date | null;
}

type JournalAction =
  | { type: "push"; entry: JournalEntry }
  | { type: "set_status"; status: SSEStatus }
  | { type: "seed"; entries: JournalEntry[] };

const MAX_ENTRIES = 200;

function journalReducer(state: JournalState, action: JournalAction): JournalState {
  switch (action.type) {
    case "seed":
      return { ...state, entries: action.entries.slice(0, MAX_ENTRIES) };
    case "push": {
      if (state.entries.some((e) => e.id === action.entry.id)) return state;
      const next = [action.entry, ...state.entries].slice(0, MAX_ENTRIES);
      return { ...state, entries: next, lastEventAt: new Date() };
    }
    case "set_status":
      return { ...state, status: action.status };
    default:
      return state;
  }
}

interface UseAgentJournalOptions {
  apiBase?: string;
  agents?: JournalAgent[];
  maxEntries?: number;
}

export function useAgentJournal(opts: UseAgentJournalOptions = {}) {
  const { apiBase = process.env.NEXT_PUBLIC_MOBIUS_API_BASE ?? "", agents } = opts;

  const [state, dispatch] = useReducer(journalReducer, {
    entries: [],
    status: "connecting",
    lastEventAt: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const seed = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/agents/journal?per_page=50`, {
        next: { revalidate: 0 },
      });
      if (!res.ok) return;
      const data = await res.json();
      const entries: JournalEntry[] = (data.entries ?? data ?? []).map(normalise);
      dispatch({ type: "seed", entries });
    } catch {
      // no-op
    }
  }, [apiBase]);

  const startFallbackPoll = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/agents/journal?per_page=10`, {
          next: { revalidate: 0 },
        });
        if (!res.ok) return;
        const data = await res.json();
        (data.entries ?? data ?? []).forEach((raw: Record<string, unknown>) => {
          const entry = normalise(raw);
          if (!agents || agents.includes(entry.agent as JournalAgent)) {
            dispatch({ type: "push", entry });
          }
        });
        connectSSE();
      } catch {
        dispatch({ type: "set_status", status: "error" });
      }
    }, 30_000);
  }, [apiBase, agents]);

  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`${apiBase}/api/v1/stream/journal-events`);
    esRef.current = es;

    es.onopen = () => {
      dispatch({ type: "set_status", status: "live" });
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    es.onmessage = (evt) => {
      try {
        const raw = JSON.parse(evt.data);
        const entry = normalise(raw);
        if (!agents || agents.includes(entry.agent as JournalAgent)) {
          dispatch({ type: "push", entry });
        }
      } catch {
        // malformed payload
      }
    };

    es.onerror = () => {
      dispatch({ type: "set_status", status: "fallback" });
      es.close();
      esRef.current = null;
      startFallbackPoll();
    };
  }, [apiBase, agents, startFallbackPoll]);

  useEffect(() => {
    seed();
    connectSSE();
    return () => {
      esRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [seed, connectSSE]);

  return {
    entries: state.entries,
    status: state.status,
    lastEventAt: state.lastEventAt,
  };
}

function normalise(raw: Record<string, unknown>): JournalEntry {
  return {
    id: String(raw.id ?? raw.ts ?? crypto.randomUUID()),
    ts: String(raw.ts ?? raw.timestamp ?? raw.created_at ?? new Date().toISOString()),
    agent: String(raw.agent ?? raw.sentinel_id ?? "ATLAS") as JournalAgent,
    action: String(raw.action ?? raw.event ?? raw.message ?? ""),
    detail: raw.detail != null ? String(raw.detail) : undefined,
    cycle: raw.cycle != null ? String(raw.cycle) : undefined,
    integrity_delta: typeof raw.integrity_delta === "number" ? raw.integrity_delta : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
  };
}
