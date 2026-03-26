import { C261_COVENANT } from '@/lib/constants/covenants';

export function checkCovenantCompliance(miiScore: number) {
  if (miiScore < C261_COVENANT.GI_THRESHOLD) {
    return {
      status: 'HALT' as const,
      message: 'System integrity below C-261 threshold',
      threshold: C261_COVENANT.GI_THRESHOLD,
    };
  }

  return { status: 'OK' as const, threshold: C261_COVENANT.GI_THRESHOLD };
}
