import type { MobiusPermission } from '@/lib/identity/permissions';
import { getIdentityPermissions } from '@/lib/identity/store';

export function hasPermission(username: string, permission: MobiusPermission) {
  const permissions = getIdentityPermissions(username);
  return permissions.includes(permission);
}

export function requirePermission(username: string, permission: MobiusPermission) {
  const allowed = hasPermission(username, permission);

  if (!allowed) {
    throw new Error(`Permission denied: ${permission}`);
  }

  return true;
}
