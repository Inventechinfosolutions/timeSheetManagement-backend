import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class SlidingSessionInterceptor implements NestInterceptor {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      mergeMap((data) => {
        const authorization = request.headers['authorization'];
        if (authorization && authorization.startsWith('Bearer ')) {
          const token = authorization.split(' ')[1];
          return from(this.processToken(token, response)).pipe(
            mergeMap(() => from(Promise.resolve(data)))
          );
        }
        return from(Promise.resolve(data));
      }),
    );
  }

  private async processToken(token: string, response: any): Promise<void> {
    try {
      const decoded = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
      });
      const payload = { sub: decoded.sub, loginId: decoded.loginId };
      const { accessToken } = await this.authService.generateJWTTokenWithRefresh(payload);
      
      // Send new token in a custom header
      response.setHeader('x-new-token', accessToken);
      // Ensure the client can read this custom header
      response.setHeader('Access-Control-Expose-Headers', 'x-new-token');
    } catch (e) {
      // Token might be expired or invalid, let the guard handle it
    }
  }
}
