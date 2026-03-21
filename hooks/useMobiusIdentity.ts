'use client';

import { useEffect, useState } from 'react';
import type { MobiusIdentity } from '@/lib/identity/types';
import type { MobiusPermission } from '@/lib/identity/permissions';

export function useMobiusIdentity() {
  const [identity, setIdentity] = useState<MobiusIdentity | null>(null);
  const [permissions, setPermissions] = useState<MobiusPermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch('/api/identity/me?username=kaizencycle', {
          cache: 'no-store',
        });
        const json = await res.json();

        if (!active) return;

        setIdentity(json.identity || null);
        setPermissions(json.permissions || []);
      } catch {
        if (active) {
          setIdentity(null);
          setPermissions([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return {
    identity,
    permissions,
    loading,
    hasPermission: (permission: MobiusPermission) => permissions.includes(permission),
  };
}
