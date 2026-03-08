import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserType } from '../../users/enums/user-type.enum';

/**
 * Blocks RECEPTIONIST users from any non-GET request except:
 * - change-password (first-login reset, like Admin)
 * - download / export (Excel, PDF, etc.) so receptionist can download and export.
 * Receptionist can view (GET) everything but cannot create/update/delete otherwise.
 */
@Injectable()
export class ReceptionistReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true;
    if (user.userType !== UserType.RECEPTIONIST) return true;
    const method = (request.method || '').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
    const path = (request.url || request.path || '').split('?')[0];
    if (path && path.includes('change-password')) return true;
    if (path && (path.includes('download') || path.includes('export'))) return true;
    throw new ForbiddenException(
      'Receptionist role has view-only access. No create, update, or delete actions allowed.',
    );
  }
}
