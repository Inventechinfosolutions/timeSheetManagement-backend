import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CachingUtil {
  private readonly logger = new Logger(CachingUtil.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getCache<Output>(key: string): Promise<Output | undefined> {
    const value = await this.cacheManager.get<Output>(key);
    return value;
  }

  async setCache(key: string, value: any, ttl: number) {
    //this.logger.log(' setCache : key : ' + key + ' value : ' + JSON.stringify(value));
    await this.cacheManager.set(key, value, ttl);
  }

  async setCacheInfinite(key: string, value: number) {
    try {
      // User requested 180s for "Infinite" which is not infinite, but keeping as requested
      await this.cacheManager.set(key, value, 180); 
      console.log(`Cache set successfully for key: ${key}, value: ${value}`);
    } catch (error) {
      console.error(`Error setting cache for key: ${key}, value: ${value}`, error);
    }
  }

  async deleteCache(key: string) {
    this.logger.log(' deleteCache : key : ' + key);
    await this.cacheManager.del(key);
  }

  async clearFullCache() {
    this.logger.log(' clearFullCache');
    // cache-manager v7 uses clear()
    if (typeof (this.cacheManager as any).clear === 'function') {
      await (this.cacheManager as any).clear();
    }
  }
}
