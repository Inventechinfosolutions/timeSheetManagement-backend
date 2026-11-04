import { UserType } from '../enums/user-type.enum';

/**
 * Admin-level access. CEO and General Manager have the same access as Admin.
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
    type === UserType.GENERAL_MANAGER ||
    role === UserType.ADMIN ||
    role === UserType.CEO ||
    role === UserType.GENERAL_MANAGER
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

export const isGeneralManagerUser = (
  user?: { userType?: string | null; role?: string | null } | null,
): boolean => {
  if (!user) return false;
  const type = String(user.userType || '').toUpperCase();
  const role = String(user.role || '').toUpperCase();
  return type === UserType.GENERAL_MANAGER || role === UserType.GENERAL_MANAGER;
};

/** Returns true if user is CEO or General Manager (both share identical access). */
export const isCeoOrGmUser = (
  user?: { userType?: string | null; role?: string | null } | null,
): boolean => {
  return isCeoUser(user) || isGeneralManagerUser(user);
};

export const blockedByLabel = (blockedBy?: string | null): string => {
  const value = String(blockedBy || '').toUpperCase();
  if (value === UserType.ADMIN || value === 'ADMIN') return 'Admin';
  if (value === UserType.CEO || value === 'CEO') return 'CEO';
  if (value === UserType.GENERAL_MANAGER || value === 'GENERAL_MANAGER') return 'General Manager';
  return 'Manager';
};
