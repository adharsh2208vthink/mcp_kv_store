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
  .description('A standalone Key-Value store MCP server with Streamable HTTP')
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

  private getUserKey(username: string, key: string): string {
    return `${username}:${key}`;
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
    this.httpApp.get('/kv/:key', async (req: any, res: any) => {
      try {
        const { username } = req.query;
        if (!username) {
          return res.status(400).json({
            success: false,
            error: 'Username is required'
          });
        }
        const userKey = this.getUserKey(username as string, req.params.key);
        const value = await this.kvStore.get(userKey);
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
    this.httpApp.post('/kv/:key', async (req: any, res: any) => {
      try {
        const { username, value, ttl } = req.body;
        if (!username) {
          return res.status(400).json({
            success: false,
            error: 'Username is required'
          });
        }
        const userKey = this.getUserKey(username, req.params.key);
        const success = await this.kvStore.set(userKey, value, ttl);
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
    this.httpApp.delete('/kv/:key', async (req: any, res: any) => {
      try {
        const { username } = req.body;
        if (!username) {
          return res.status(400).json({
            success: false,
            error: 'Username is required'
          });
        }
        const userKey = this.getUserKey(username, req.params.key);
        const deleted = await this.kvStore.delete(userKey);
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
    this.httpApp.head('/kv/:key', async (req: any, res: any) => {
      try {
        const { username } = req.query;
        if (!username) {
          return res.status(400).end();
        }
        const userKey = this.getUserKey(username as string, req.params.key);
        const exists = await this.kvStore.exists(userKey);
        res.status(exists ? 200 : 404).end();
      } catch (error) {
        res.status(500).end();
      }
    });

    // Get all keys with optional pattern
    this.httpApp.get('/keys', async (req: any, res: any) => {
      try {
        const { username, pattern } = req.query;
        if (!username) {
          return res.status(400).json({
            success: false,
            error: 'Username is required'
          });
        }
        const userPattern = pattern ? 
          this.getUserKey(username as string, pattern as string) : 
          this.getUserKey(username as string, '*');
        const keys = await this.kvStore.keys(userPattern);
        // Strip username prefix from returned keys
        const cleanKeys = keys.map(key => key.replace(`${username}:`, ''));
        res.json({
          success: true,
          keys: cleanKeys,
          count: cleanKeys.length,
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
    this.httpApp.get('/kv', async (req: any, res: any) => {
      try {
        const { username, pattern } = req.query;
        if (!username) {
          return res.status(400).json({
            success: false,
            error: 'Username is required'
          });
        }
        const userPattern = pattern ? 
          this.getUserKey(username as string, pattern as string) : 
          this.getUserKey(username as string, '*');
        const keys = await this.kvStore.keys(userPattern);
        const data: Record<string, any> = {};
        
        for (const key of keys) {
          const cleanKey = key.replace(`${username}:`, '');
          data[cleanKey] = await this.kvStore.get(key);
        }

        res.json({
          success: true,
          data,
          count: Object.keys(data).length,
          pattern: pattern || '*'
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
              username: {
                type: 'string',
                description: 'Username for key isolation'
              },
              key: {
                type: 'string',
                description: 'The key to retrieve'
              }
            },
            required: ['username', 'key']
          }
        },
        {
          name: 'kv_set',
          description: 'Set a key-value pair in the store',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username for key isolation'
              },
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
            required: ['username', 'key', 'value']
          }
        },
        {
          name: 'kv_delete',
          description: 'Delete a key from the store',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username for key isolation'
              },
              key: {
                type: 'string',
                description: 'The key to delete'
              }
            },
            required: ['username', 'key']
          }
        },
        {
          name: 'kv_exists',
          description: 'Check if a key exists in the store',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username for key isolation'
              },
              key: {
                type: 'string',
                description: 'The key to check'
              }
            },
            required: ['username', 'key']
          }
        },
        {
          name: 'kv_keys',
          description: 'List keys matching a pattern',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username for key isolation'
              },
              pattern: {
                type: 'string',
                description: 'Glob pattern to match keys (optional, * and ? wildcards supported)'
              }
            },
            required: ['username']
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
            const userKey = this.getUserKey(args.username as string, args.key as string);
            const value = await this.kvStore.get(userKey);
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
            const userKey = this.getUserKey(args.username as string, args.key as string);
            const success = await this.kvStore.set(userKey, args.value, args.ttl as number);
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
            const userKey = this.getUserKey(args.username as string, args.key as string);
            const deleted = await this.kvStore.delete(userKey);
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
            const userKey = this.getUserKey(args.username as string, args.key as string);
            const exists = await this.kvStore.exists(userKey);
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
            const username = args.username as string;
            const userPattern = args.pattern ? 
              this.getUserKey(username, args.pattern as string) : 
              this.getUserKey(username, '*');
            const keys = await this.kvStore.keys(userPattern);
            // Strip username prefix from returned keys
            const cleanKeys = keys.map(key => key.replace(`${username}:`, ''));
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    keys: cleanKeys,
                    count: cleanKeys.length
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
    const httpPort = parseInt(options.httpPort);
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