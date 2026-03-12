import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Response } from 'express';
import { NO_CACHE_HEADERS } from '../utils/no-cache-headers';

/** Disable browser and proxy caching for all API responses to avoid stale data. */
@Injectable()
export class NoCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    Object.entries(NO_CACHE_HEADERS).forEach(([key, value]) => {
      response.setHeader(key, value);
    });
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return next.handle();
  }
}
