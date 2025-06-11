import * as fs from 'fs/promises';
import * as path from 'path';

export interface KVStoreConfig {
  storageMode: 'memory' | 'file' | 'hybrid';
  dataDirectory: string;
  maxMemoryMB: number;
  syncIntervalSeconds: number;
  backupIntervalHours: number;
  maxKeySize: number;
  maxValueSize: number;
  enableCompression: boolean;
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
  diskUsageBytes: number;
  hitRate: number;
  uptime: number;
}

export class KVStore {
  private data: Map<string, KVEntry> = new Map();
  private config: KVStoreConfig;
  private dataFile: string;
  private indexFile: string;
  private logFile: string;
  private syncTimer?: NodeJS.Timeout;
  private backupTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private startTime: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(config: Partial<KVStoreConfig> = {}) {
    this.config = {
      storageMode: 'hybrid',
      dataDirectory: './kv-data',
      maxMemoryMB: 100,
      syncIntervalSeconds: 30,
      backupIntervalHours: 24,
      maxKeySize: 1024,
      maxValueSize: 1024 * 1024, // 1MB
      enableCompression: false,
      logLevel: 'info',
      ...config
    };

    this.dataFile = path.join(this.config.dataDirectory, 'kvstore.json');
    this.indexFile = path.join(this.config.dataDirectory, 'kvstore.index');
    this.logFile = path.join(this.config.dataDirectory, 'kvstore.log');
    this.startTime = Date.now();

    this.init();
  }

  private async init(): Promise<void> {
    try {
      await fs.mkdir(this.config.dataDirectory, { recursive: true });
      
      if (this.config.storageMode !== 'memory') {
        await this.loadFromDisk();
      }

      if (this.config.storageMode === 'hybrid') {
        this.setupSyncTimer();
      }

      this.setupCleanupTimer();
      this.setupBackupTimer();
      
      this.log('info', `KV Store initialized with ${this.data.size} keys`);
    } catch (error) {
      this.log('error', `Failed to initialize KV Store: ${error}`);
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

      this.data.set(key, entry);
      
      if (this.config.storageMode === 'file') {
        await this.saveToDisk();
      }

      this.log('debug', `Set key: ${key}`);
      return true;
    } catch (error) {
      this.log('error', `Failed to set key ${key}: ${error}`);
      return false;
    }
  }

  async get(key: string): Promise<any> {
    const entry = this.data.get(key);
    
    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      this.missCount++;
      return undefined;
    }

    this.hitCount++;
    return entry.value;
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.data.delete(key);
    
    if (deleted && this.config.storageMode === 'file') {
      await this.saveToDisk();
    }

    this.log('debug', `Deleted key: ${key}, success: ${deleted}`);
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.data.get(key);
    
    if (!entry) return false;
    
    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return false;
    }

    return true;
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.data.keys());
    
    if (!pattern) return allKeys;

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return allKeys.filter(key => regex.test(key));
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const entry = this.data.get(key);
    if (!entry) return false;

    entry.expiresAt = Date.now() + (seconds * 1000);
    this.data.set(key, entry);

    if (this.config.storageMode === 'file') {
      await this.saveToDisk();
    }

    return true;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.data.get(key);
    if (!entry) return -2; // Key doesn't exist

    if (!entry.expiresAt) return -1; // Key exists but no expiration

    const remainingMs = entry.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (typeof current === 'number' ? current : 0) + 1;
    await this.set(key, newValue);
    return newValue;
  }

  async decr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (typeof current === 'number' ? current : 0) - 1;
    await this.set(key, newValue);
    return newValue;
  }

  async append(key: string, value: string): Promise<number> {
    const current = await this.get(key);
    const currentStr = typeof current === 'string' ? current : '';
    const newValue = currentStr + value;
    await this.set(key, newValue);
    return newValue.length;
  }

  async clear(): Promise<void> {
    this.data.clear();
    
    if (this.config.storageMode !== 'memory') {
      await this.saveToDisk();
    }
    
    this.log('info', 'Cleared all data');
  }

  async stats(): Promise<KVStats> {
    const totalKeys = this.data.size;
    const memoryUsageBytes = this.calculateMemoryUsage();
    const diskUsageBytes = await this.calculateDiskUsage();
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;
    const uptime = Date.now() - this.startTime;

    return {
      totalKeys,
      memoryUsageBytes,
      diskUsageBytes,
      hitRate,
      uptime
    };
  }

  async backup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.config.dataDirectory, 'backups');
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`);

    await fs.mkdir(backupDir, { recursive: true });
    
    const backupData = {
      timestamp: Date.now(),
      config: this.config,
      data: Object.fromEntries(this.data)
    };

    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
    this.log('info', `Backup created: ${backupFile}`);
    
    return backupFile;
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

  private async loadFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      this.data = new Map(Object.entries(parsed));
      this.log('info', `Loaded ${this.data.size} keys from disk`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.log('warn', `Failed to load from disk: ${error}`);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const data = Object.fromEntries(this.data);
      await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.log('error', `Failed to save to disk: ${error}`);
    }
  }

  private setupSyncTimer(): void {
    this.syncTimer = setInterval(async () => {
      await this.saveToDisk();
      this.log('debug', 'Synced to disk');
    }, this.config.syncIntervalSeconds * 1000);
  }

  private setupCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      const now = Date.now();
      let expiredCount = 0;

      for (const [key, entry] of this.data.entries()) {
        if (entry.expiresAt && now > entry.expiresAt) {
          this.data.delete(key);
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        this.log('debug', `Cleaned up ${expiredCount} expired keys`);
        if (this.config.storageMode !== 'memory') {
          await this.saveToDisk();
        }
      }
    }, 60000); // Run every minute
  }

  private setupBackupTimer(): void {
    this.backupTimer = setInterval(async () => {
      await this.backup();
    }, this.config.backupIntervalHours * 60 * 60 * 1000);
  }

  private calculateMemoryUsage(): number {
    let size = 0;
    for (const [key, entry] of this.data.entries()) {
      size += key.length * 2; // Approximate string size
      size += JSON.stringify(entry).length * 2;
    }
    return size;
  }

  private async calculateDiskUsage(): Promise<number> {
    try {
      const stats = await fs.stat(this.dataFile);
      return stats.size;
    } catch {
      return 0;
    }
  }

  async close(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    if (this.config.storageMode !== 'memory') {
      await this.saveToDisk();
    } 

    this.log('info', 'KV Store closed');
  }
}

export default KVStore;