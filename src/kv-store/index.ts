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

// Helper function for user key isolation
const getUserKey = (username: string, key: string): string => {
  return `${username}:${key}`;
};

// Create the Streamable HTTP MCP Server with your KV store tools
const { process: serverProcess, server, express_server } = ExpressHttpStreamableMcpServer(
  {
    name: 'kv-store-server'
  },
  (server) => {
    // Add all KV store tools using the modern server.tool() API
    
    server.tool('kv_get', {
      username: z.string().describe('Username for key isolation'),
      key: z.string().describe('The key to retrieve')
    }, async ({ username, key }) => {
      const userKey = getUserKey(username, key);
      const value = await kvStore.get(userKey);
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
      username: z.string().describe('Username for key isolation'),
      key: z.string().describe('The key to set'),
      value: z.any().describe('The value to store (can be any JSON type)'),
      ttl: z.number().optional().describe('Time to live in seconds (optional)')
    }, async ({ username, key, value, ttl }) => {
      const userKey = getUserKey(username, key);
      const success = await kvStore.set(userKey, value, ttl);
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
      username: z.string().describe('Username for key isolation'),
      key: z.string().describe('The key to delete')
    }, async ({ username, key }) => {
      const userKey = getUserKey(username, key);
      const deleted = await kvStore.delete(userKey);
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
      username: z.string().describe('Username for key isolation'),
      key: z.string().describe('The key to check')
    }, async ({ username, key }) => {
      const userKey = getUserKey(username, key);
      const exists = await kvStore.exists(userKey);
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
      username: z.string().describe('Username for key isolation'),
      pattern: z.string().optional().describe('Glob pattern to match keys (optional, * and ? wildcards supported)')
    }, async ({ username, pattern }) => {
      const userPattern = pattern ? getUserKey(username, pattern) : getUserKey(username, '*');
      const keys = await kvStore.keys(userPattern);
      // Strip username prefix from returned keys
      const cleanKeys = keys.map(key => key.replace(`${username}:`, ''));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              keys: cleanKeys,
              count: cleanKeys.length,
              pattern: pattern || '*'
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