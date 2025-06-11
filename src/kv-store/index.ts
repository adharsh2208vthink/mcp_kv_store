#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { Command } from 'commander';
import { KVStore, KVStoreConfig } from './kv-store.js';
import { ExpressHttpStreamableMcpServer } from './server_runner.js';

const program = new Command();

program
  .name('mcp-kv-server')
  .description('A standalone Key-Value store MCP server with Streamable HTTP')
  .version('1.0.0')
  .option('-d, --data-dir <path>', 'Data directory path', './kv-data')
  .option('-m, --mode <mode>', 'Storage mode (memory|file|hybrid)', 'hybrid')
  .option('--max-memory <mb>', 'Max memory usage in MB', '100')
  .option('--sync-interval <seconds>', 'Sync interval in seconds', '30')
  .option('--log-level <level>', 'Log level (debug|info|warn|error)', 'info')
  .option('--http-port <port>', 'HTTP server port', '3001')
  .parse();

const options = program.opts();

const config: Partial<KVStoreConfig> = {
  dataDirectory: options.dataDir,
  storageMode: options.mode as any,
  maxMemoryMB: parseInt(options.maxMemory, 10),
  syncIntervalSeconds: parseInt(options.syncInterval, 10),
  logLevel: options.logLevel as any,
};

const kvStore = new KVStore(config);

// Create the Streamable HTTP MCP Server with your KV store tools
const { process: serverProcess, server, express_server } = ExpressHttpStreamableMcpServer(
  {
    name: 'kv-store-server'
  },
  (server) => {
    // Add all KV store tools using the modern server.tool() API
    
    server.tool('kv_get', {
      key: z.string().describe('The key to retrieve')
    }, async ({ key }) => {
      const value = await kvStore.get(key);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key,
              value,
              exists: value !== undefined
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_set', {
      key: z.string().describe('The key to set'),
      value: z.any().describe('The value to store (can be any JSON type)'),
      ttl: z.number().optional().describe('Time to live in seconds (optional)')
    }, async ({ key, value, ttl }) => {
      const success = await kvStore.set(key, value, ttl);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success,
              message: success ? 'Key set successfully' : 'Failed to set key'
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_delete', {
      key: z.string().describe('The key to delete')
    }, async ({ key }) => {
      const deleted = await kvStore.delete(key);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: deleted,
              message: deleted ? 'Key deleted successfully' : 'Key not found'
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_exists', {
      key: z.string().describe('The key to check')
    }, async ({ key }) => {
      const exists = await kvStore.exists(key);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              key,
              exists
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_keys', {
      pattern: z.string().optional().describe('Glob pattern to match keys (optional, * and ? wildcards supported)')
    }, async ({ pattern }) => {
      const keys = await kvStore.keys(pattern);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              keys,
              count: keys.length,
              pattern: pattern || '*'
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_expire', {
      key: z.string().describe('The key to set expiration for'),
      seconds: z.number().describe('Seconds until expiration')
    }, async ({ key, seconds }) => {
      const success = await kvStore.expire(key, seconds);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success,
              message: success ? 'Expiration set successfully' : 'Key not found'
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_ttl', {
      key: z.string().describe('The key to check TTL for')
    }, async ({ key }) => {
      const ttl = await kvStore.ttl(key);
      let message = '';
      if (ttl === -2) message = 'Key does not exist';
      else if (ttl === -1) message = 'Key exists but has no expiration';
      else message = `Key expires in ${ttl} seconds`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ttl,
              message
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_incr', {
      key: z.string().describe('The key to increment')
    }, async ({ key }) => {
      const newValue = await kvStore.incr(key);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key,
              value: newValue
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_decr', {
      key: z.string().describe('The key to decrement')
    }, async ({ key }) => {
      const newValue = await kvStore.decr(key);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key,
              value: newValue
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_append', {
      key: z.string().describe('The key to append to'),
      value: z.string().describe('The string value to append')
    }, async ({ key, value }) => {
      const newLength = await kvStore.append(key, value);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key,
              newLength
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_stats', {}, async () => {
      const stats = await kvStore.stats();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...stats,
              memoryUsageMB: Math.round(stats.memoryUsageBytes / 1024 / 1024 * 100) / 100,
              diskUsageMB: Math.round(stats.diskUsageBytes / 1024 / 1024 * 100) / 100,
              uptimeMinutes: Math.round(stats.uptime / 1000 / 60 * 100) / 100,
              hitRatePercent: Math.round(stats.hitRate * 100 * 100) / 100
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_backup', {}, async () => {
      const backupFile = await kvStore.backup();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              backupFile,
              message: 'Backup created successfully'
            }, null, 2)
          }
        ]
      };
    });

    server.tool('kv_clear', {}, async () => {
      await kvStore.clear();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'All data cleared successfully'
            }, null, 2)
          }
        ]
      };
    });
  }
);

console.log(`✅ KV Store MCP Server with Streamable HTTP transport started`);
console.log(`🔗 MCP Endpoint: /mcp`);
console.log(`📊 Health check: /health`);
console.log(`📖 Direct API: /kv/{key}, /stats`);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await kvStore.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await kvStore.close();
  process.exit(0);
});