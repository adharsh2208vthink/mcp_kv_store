#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { KVStore, KVStoreConfig } from './kv-store.js';
import { Command } from 'commander';
import express from 'express';
import cors from 'cors';

const program = new Command();

program
  .name('mcp-kv-server')
  .description('A standalone Key-Value store MCP server with HTTP API')
  .version('1.0.0')
  .option('-d, --data-dir <path>', 'Data directory path', './kv-data')
  .option('-m, --mode <mode>', 'Storage mode (memory|file|hybrid)', 'hybrid')
  .option('--max-memory <mb>', 'Max memory usage in MB', '100')
  .option('--sync-interval <seconds>', 'Sync interval in seconds', '30')
  .option('--log-level <level>', 'Log level (debug|info|warn|error)', 'info')
  .option('--http-port <port>', 'HTTP server port', '3001')
  .option('--http-only', 'Run only HTTP server (no MCP stdio)')
  .option('--stdio', 'Run MCP server on stdio only')
  .parse();

const options = program.opts();

const config: Partial<KVStoreConfig> = {
  dataDirectory: options.dataDir,
  storageMode: options.mode as any,
  maxMemoryMB: parseInt(options.maxMemory),
  syncIntervalSeconds: parseInt(options.syncInterval),
  logLevel: options.logLevel as any,
};

class KVMCPServer {
  private server: Server;
  private kvStore: KVStore;
  private httpApp: express.Application;

  constructor() {
    this.kvStore = new KVStore(config);
    this.server = new Server(
      {
        name: 'kv-store-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.httpApp = express();
    this.setupHTTPServer();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupHTTPServer() {
    this.httpApp.use(cors());
    this.httpApp.use(express.json());

    // Health check endpoint
    this.httpApp.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // SSE endpoint for MCP over HTTP
    this.httpApp.get('/sse', async (req, res) => {
      console.error('SSE connection established');
      
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      const transport = new SSEServerTransport('/sse', res);
      await this.server.connect(transport);
    });

    // CORS preflight for SSE
    this.httpApp.options('/sse', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
      res.sendStatus(200);
    });

    // Get value by key
    this.httpApp.get('/kv/:key', async (req, res) => {
      try {
        const value = await this.kvStore.get(req.params.key);
        res.json({
          success: true,
          key: req.params.key,
          value,
          exists: value !== undefined
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Set key-value pair
    this.httpApp.post('/kv/:key', async (req, res) => {
      try {
        const { value, ttl } = req.body;
        const success = await this.kvStore.set(req.params.key, value, ttl);
        res.json({
          success,
          key: req.params.key,
          message: success ? 'Key set successfully' : 'Failed to set key'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Delete key
    this.httpApp.delete('/kv/:key', async (req, res) => {
      try {
        const deleted = await this.kvStore.delete(req.params.key);
        res.json({
          success: deleted,
          key: req.params.key,
          message: deleted ? 'Key deleted successfully' : 'Key not found'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Check if key exists
    this.httpApp.head('/kv/:key', async (req, res) => {
      try {
        const exists = await this.kvStore.exists(req.params.key);
        res.status(exists ? 200 : 404).end();
      } catch (error) {
        res.status(500).end();
      }
    });

    // Get all keys with optional pattern
    this.httpApp.get('/keys', async (req, res) => {
      try {
        const pattern = req.query.pattern as string;
        const keys = await this.kvStore.keys(pattern);
        res.json({
          success: true,
          keys,
          count: keys.length,
          pattern: pattern || '*'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Get all key-value pairs
    this.httpApp.get('/kv', async (req, res) => {
      try {
        const pattern = req.query.pattern as string;
        const keys = await this.kvStore.keys(pattern);
        const data: Record<string, any> = {};
        
        for (const key of keys) {
          data[key] = await this.kvStore.get(key);
        }

        res.json({
          success: true,
          data,
          count: keys.length,
          pattern: pattern || '*'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Set expiration for key
    this.httpApp.post('/kv/:key/expire', async (req, res) => {
      try {
        const { seconds } = req.body;
        const success = await this.kvStore.expire(req.params.key, seconds);
        res.json({
          success,
          key: req.params.key,
          seconds,
          message: success ? 'Expiration set successfully' : 'Key not found'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Get TTL for key
    this.httpApp.get('/kv/:key/ttl', async (req, res) => {
      try {
        const ttl = await this.kvStore.ttl(req.params.key);
        let message = '';
        if (ttl === -2) message = 'Key does not exist';
        else if (ttl === -1) message = 'Key exists but has no expiration';
        else message = `Key expires in ${ttl} seconds`;

        res.json({
          success: true,
          key: req.params.key,
          ttl,
          message
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Increment key
    this.httpApp.post('/kv/:key/incr', async (req, res) => {
      try {
        const newValue = await this.kvStore.incr(req.params.key);
        res.json({
          success: true,
          key: req.params.key,
          value: newValue
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Decrement key
    this.httpApp.post('/kv/:key/decr', async (req, res) => {
      try {
        const newValue = await this.kvStore.decr(req.params.key);
        res.json({
          success: true,
          key: req.params.key,
          value: newValue
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Append to key
    this.httpApp.post('/kv/:key/append', async (req, res) => {
      try {
        const { value } = req.body;
        const newLength = await this.kvStore.append(req.params.key, value);
        res.json({
          success: true,
          key: req.params.key,
          newLength
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Get database statistics
    this.httpApp.get('/stats', async (req, res) => {
      try {
        const stats = await this.kvStore.stats();
        res.json({
          success: true,
          ...stats,
          memoryUsageMB: Math.round(stats.memoryUsageBytes / 1024 / 1024 * 100) / 100,
          diskUsageMB: Math.round(stats.diskUsageBytes / 1024 / 1024 * 100) / 100,
          uptimeMinutes: Math.round(stats.uptime / 1000 / 60 * 100) / 100,
          hitRatePercent: Math.round(stats.hitRate * 100 * 100) / 100
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Create backup
    this.httpApp.post('/backup', async (req, res) => {
      try {
        const backupFile = await this.kvStore.backup();
        res.json({
          success: true,
          backupFile,
          message: 'Backup created successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Clear all data
    this.httpApp.delete('/kv', async (req, res) => {
      try {
        await this.kvStore.clear();
        res.json({
          success: true,
          message: 'All data cleared successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'kv_get',
          description: 'Get a value by key from the key-value store',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to retrieve'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'kv_set',
          description: 'Set a key-value pair in the store',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to set'
              },
              value: {
                description: 'The value to store (can be any JSON type)'
              },
              ttl: {
                type: 'number',
                description: 'Time to live in seconds (optional)'
              }
            },
            required: ['key', 'value']
          }
        },
        {
          name: 'kv_delete',
          description: 'Delete a key from the store',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to delete'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'kv_exists',
          description: 'Check if a key exists in the store',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to check'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'kv_keys',
          description: 'List keys matching a pattern',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Glob pattern to match keys (optional, * and ? wildcards supported)'
              }
            }
          }
        },
        {
          name: 'kv_expire',
          description: 'Set expiration time for a key',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to set expiration for'
              },
              seconds: {
                type: 'number',
                description: 'Seconds until expiration'
              }
            },
            required: ['key', 'seconds']
          }
        },
        {
          name: 'kv_ttl',
          description: 'Get time to live for a key',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to check TTL for'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'kv_incr',
          description: 'Increment a numeric value',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to increment'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'kv_decr',
          description: 'Decrement a numeric value',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to decrement'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'kv_append',
          description: 'Append a string to an existing value',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'The key to append to'
              },
              value: {
                type: 'string',
                description: 'The string value to append'
              }
            },
            required: ['key', 'value']
          }
        },
        {
          name: 'kv_stats',
          description: 'Get database statistics',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'kv_backup',
          description: 'Create a backup of the database',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'kv_clear',
          description: 'Clear all data from the store',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          throw new Error('Missing arguments');
        }

        switch (name) {
          case 'kv_get': {
            const value = await this.kvStore.get(args.key as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    value: value,
                    exists: value !== undefined
                  }, null, 2)
                }
              ]
            };
          }

          case 'kv_set': {
            const success = await this.kvStore.set(args.key as string, args.value, args.ttl as number);
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
          }

          case 'kv_delete': {
            const deleted = await this.kvStore.delete(args.key as string);
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
          }

          case 'kv_exists': {
            const exists = await this.kvStore.exists(args.key as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    exists
                  }, null, 2)
                }
              ]
            };
          }

          case 'kv_keys': {
            const keys = await this.kvStore.keys(args?.pattern as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    keys,
                    count: keys.length
                  }, null, 2)
                }
              ]
            };
          }

          case 'kv_expire': {
            const success = await this.kvStore.expire(args.key as string, args.seconds as number);
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
          }

          case 'kv_ttl': {
            const ttl = await this.kvStore.ttl(args.key as string);
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
          }

          case 'kv_incr': {
            const newValue = await this.kvStore.incr(args.key as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    value: newValue
                  }, null, 2)
                }
              ]
            };
          }

          case 'kv_decr': {
            const newValue = await this.kvStore.decr(args.key as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    value: newValue
                  }, null, 2)
                }
              ]
            };
          }

          case 'kv_append': {
            const newLength = await this.kvStore.append(args.key as string, args.value as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    newLength
                  }, null, 2)
                }
              ]
            };
          }

          case 'kv_stats': {
            const stats = await this.kvStore.stats();
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
          }

          case 'kv_backup': {
            const backupFile = await this.kvStore.backup();
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
          }

          case 'kv_clear': {
            await this.kvStore.clear();
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
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
              }, null, 2)
            }
          ]
        };
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.kvStore.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.kvStore.close();
      process.exit(0);
    });
  }

  async run() {
    // Handle different run modes
    if (options.stdio) {
      // Run MCP server on stdio only
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('KV Store MCP server running on stdio');
      return;
    }

    // Start HTTP server
    const httpPort = parseInt(process.env.PORT || options.httpPort);
    this.httpApp.listen(httpPort, () => {
      console.error(`KV Store HTTP API running on port ${httpPort}`);
      console.error(`SSE endpoint: http://localhost:${httpPort}/sse`);
      console.error(`Health check: curl http://localhost:${httpPort}/health`);
    });

    // Start MCP server on stdio (unless --http-only flag is used)
    if (!options.httpOnly) {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('KV Store MCP server also running on stdio');
    }
  }
}

// Start the server
const server = new KVMCPServer();
server.run().catch(console.error);