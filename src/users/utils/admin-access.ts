import { UserType } from '../enums/user-type.enum';

/**
 * Admin-level access. CEO has the same access as Admin.
 * This does not treat the hardcoded Admin login or ADMIN_EMAIL as CEO.
 */
export const hasAdminAccess = (
  user?: { userType?: string | null; role?: string | null } | null,
): boolean => {
  if (!user) return false;
  const type = String(user.userType || '').toUpperCase();
  const role = String(user.role || '').toUpperCase();
  return (
    type === UserType.ADMIN ||
    type === UserType.CEO ||
    role === UserType.ADMIN ||
    role === UserType.CEO
  );
};

export const isCeoUser = (
  user?: { userType?: string | null; role?: string | null } | null,
): boolean => {
  if (!user) return false;
  const type = String(user.userType || '').toUpperCase();
  const role = String(user.role || '').toUpperCase();
  return type === UserType.CEO || role === UserType.CEO;
};

export const blockedByLabel = (blockedBy?: string | null): string => {
  const value = String(blockedBy || '').toUpperCase();
  if (value === UserType.ADMIN || value === 'ADMIN') return 'Admin';
  if (value === UserType.CEO || value === 'CEO') return 'CEO';
  return 'Manager';
};
