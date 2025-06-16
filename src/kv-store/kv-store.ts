import { createClient, RedisClientType } from 'redis';

export interface KVStoreConfig {
  redisUrl: string;
  maxKeySize: number;
  maxValueSize: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface KVEntry {
  value: any;
  type: 'string' | 'number' | 'object' | 'boolean';
  createdAt: number;
  expiresAt?: number;
}

export interface KVStats {
  totalKeys: number;
  memoryUsageBytes: number;
  hitRate: number;
  uptime: number;
}

export class KVStore {
  private redis: RedisClientType;
  private config: KVStoreConfig;
  private startTime: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(config: Partial<KVStoreConfig> = {}) {
    this.config = {
      redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      maxKeySize: 1024,
      maxValueSize: 1024 * 1024, // 1MB
      logLevel: 'info',
      ...config
    };

    this.redis = createClient({
      url: this.config.redisUrl
    });

    this.startTime = Date.now();
  }

  public async init(): Promise<void> {
    try {
      await this.redis.connect();
      this.log('info', `KV Store connected to Redis`);
    } catch (error) {
      this.log('error', `Failed to connect to Redis: ${error}`);
      throw error;
    }
  }

  private log(level: string, message: string): void {
    if (this.shouldLog(level)) {
      console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.logLevel);
    const messageLevel = levels.indexOf(level);
    return messageLevel >= configLevel;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      this.validateKey(key);
      this.validateValue(value);

      const entry: KVEntry = {
        value,
        type: typeof value === 'object' ? 'object' : 
              typeof value === 'number' ? 'number' :
              typeof value === 'boolean' ? 'boolean' : 'string',
        createdAt: Date.now(),
        expiresAt: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : undefined
      };

      const serialized = JSON.stringify(entry);
      
      if (ttlSeconds) {
        await this.redis.setEx(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      this.log('debug', `Set key: ${key}`);
      return true;
    } catch (error) {
      this.log('error', `Failed to set key ${key}: ${error}`);
      return false;
    }
  }

  async get(key: string): Promise<any> {
    try {
      const data = await this.redis.get(key);
      
      if (!data) {
        this.missCount++;
        return undefined;
      }

      const entry: KVEntry = JSON.parse(data);
      
      // Check if expired (Redis should handle this, but double-check)
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.redis.del(key);
        this.missCount++;
        return undefined;
      }

      this.hitCount++;
      return entry.value;
    } catch (error) {
      this.log('error', `Failed to get key ${key}: ${error}`);
      this.missCount++;
      return undefined;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      const deleted = result > 0;
      
      this.log('debug', `Deleted key: ${key}, success: ${deleted}`);
      return deleted;
    } catch (error) {
      this.log('error', `Failed to delete key ${key}: ${error}`);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.log('error', `Failed to check existence of key ${key}: ${error}`);
      return false;
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    try {
      const searchPattern = pattern || '*';
      return await this.redis.keys(searchPattern);
    } catch (error) {
      this.log('error', `Failed to get keys with pattern ${pattern}: ${error}`);
      return [];
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, seconds);
      return result;
    } catch (error) {
      this.log('error', `Failed to set expiration for key ${key}: ${error}`);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.log('error', `Failed to get TTL for key ${key}: ${error}`);
      return -2;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const current = await this.get(key);
      const newValue = (typeof current === 'number' ? current : 0) + 1;
      await this.set(key, newValue);
      return newValue;
    } catch (error) {
      this.log('error', `Failed to increment key ${key}: ${error}`);
      return 0;
    }
  }

  async decr(key: string): Promise<number> {
    try {
      const current = await this.get(key);
      const newValue = (typeof current === 'number' ? current : 0) - 1;
      await this.set(key, newValue);
      return newValue;
    } catch (error) {
      this.log('error', `Failed to decrement key ${key}: ${error}`);
      return 0;
    }
  }

  async append(key: string, value: string): Promise<number> {
    try {
      const current = await this.get(key);
      const currentStr = typeof current === 'string' ? current : '';
      const newValue = currentStr + value;
      await this.set(key, newValue);
      return newValue.length;
    } catch (error) {
      this.log('error', `Failed to append to key ${key}: ${error}`);
      return 0;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushDb();
      this.log('info', 'Cleared all data');
    } catch (error) {
      this.log('error', `Failed to clear data: ${error}`);
    }
  }

  async stats(): Promise<KVStats> {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      // Parse Redis info response
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsageBytes = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      
      const keysMatch = keyspace.match(/keys=(\d+)/);
      const totalKeys = keysMatch ? parseInt(keysMatch[1]) : 0;
      
      const totalRequests = this.hitCount + this.missCount;
      const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;
      const uptime = Date.now() - this.startTime;

      return {
        totalKeys,
        memoryUsageBytes,
        hitRate,
        uptime
      };
    } catch (error) {
      this.log('error', `Failed to get stats: ${error}`);
      return {
        totalKeys: 0,
        memoryUsageBytes: 0,
        hitRate: 0,
        uptime: Date.now() - this.startTime
      };
    }
  }

  async backup(): Promise<string> {
    try {
      // Redis handles persistence automatically
      // This could trigger a BGSAVE if needed
      await this.redis.bgSave();
      const timestamp = new Date().toISOString();
      this.log('info', `Redis backup triggered at ${timestamp}`);
      return `redis-backup-${timestamp}`;
    } catch (error) {
      this.log('error', `Failed to backup: ${error}`);
      throw error;
    }
  }

  private validateKey(key: string): void {
    if (typeof key !== 'string') {
      throw new Error('Key must be a string');
    }
    if (key.length === 0) {
      throw new Error('Key cannot be empty');
    }
    if (key.length > this.config.maxKeySize) {
      throw new Error(`Key too long (max ${this.config.maxKeySize} characters)`);
    }
  }

  private validateValue(value: any): void {
    const serialized = JSON.stringify(value);
    if (serialized.length > this.config.maxValueSize) {
      throw new Error(`Value too large (max ${this.config.maxValueSize} bytes)`);
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
      this.log('info', 'KV Store disconnected from Redis');
    } catch (error) {
      this.log('error', `Failed to close Redis connection: ${error}`);
    }
  }
}

export default KVStore;