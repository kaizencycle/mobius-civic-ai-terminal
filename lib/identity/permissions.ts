import type { MobiusRole } from '@/lib/identity/types';

export type MobiusPermission =
  | 'query:run'
  | 'query:save'
  | 'epicon:publish'
  | 'epicon:verify'
  | 'epicon:contradict'
  | 'agents:invoke'
  | 'terminal:admin';

export const rolePermissions: Record<MobiusRole, MobiusPermission[]> = {
  observer: ['query:run', 'query:save'],
  citizen: ['query:run', 'query:save', 'epicon:publish'],
  analyst: ['query:run', 'query:save', 'epicon:publish', 'epicon:contradict'],
  journalist: ['query:run', 'query:save', 'epicon:publish'],
  developer: ['query:run', 'query:save', 'epicon:publish', 'agents:invoke'],
  steward: [
    'query:run',
    'query:save',
    'epicon:publish',
    'epicon:verify',
    'epicon:contradict',
    'terminal:admin',
  ],
};

export function getPermissionsForRole(role: MobiusRole): MobiusPermission[] {
  return [...rolePermissions[role]];
}
