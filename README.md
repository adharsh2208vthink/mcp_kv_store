# MCP KV Store Server

A standalone Key-Value store server implementing the Model Context Protocol (MCP) with Streamable HTTP support and multi-user isolation.

## Features

- **Multi-user isolation**: Username-based key prefixing ensures complete data separation between users
- **Hybrid storage modes**: Memory, file, or hybrid storage options
- **TTL support**: Optional time-to-live for automatic key expiration
- **Pattern matching**: Glob pattern support for key queries
- **Dual interface**: Both MCP tools and Streamable HTTP REST API
- **Server-Sent Events**: Streamable HTTP via SSE for real-time MCP connections
- **Configurable**: Flexible storage, memory limits, and sync intervals

## Installation

```bash
npm install
```

## Usage

### Basic Usage

```bash
# Run with default settings (hybrid mode, stdio + HTTP)
node index.js

# Run only HTTP server
node index.js --http-only

# Run only MCP stdio
node index.js --stdio
```

### Configuration Options

```bash
node index.js [options]

Options:
  -d, --data-dir <path>           Data directory path (default: "./kv-data")
  -m, --mode <mode>               Storage mode: memory|file|hybrid (default: "hybrid")
  --max-memory <mb>               Max memory usage in MB (default: "100")
  --sync-interval <seconds>       Sync interval in seconds (default: "30")
  --log-level <level>             Log level: debug|info|warn|error (default: "info")
  --http-port <port>              HTTP server port (default: "3001")
  --http-only                     Run only HTTP server (no MCP stdio)
  --stdio                         Run MCP server on stdio only
  -h, --help                      Display help for command
```

## MCP Tools

All tools require a `username` parameter for user isolation.

### kv_get
Get a value by key from the key-value store.

**Parameters:**
- `username` (string, required): Username for key isolation
- `key` (string, required): The key to retrieve

**Example:**
```json
{
  "tool": "kv_get",
  "arguments": {
    "username": "alice",
    "key": "config"
  }
}
```

### kv_set
Set a key-value pair in the store.

**Parameters:**
- `username` (string, required): Username for key isolation
- `key` (string, required): The key to set
- `value` (any, required): The value to store (can be any JSON type)
- `ttl` (number, optional): Time to live in seconds

**Example:**
```json
{
  "tool": "kv_set",
  "arguments": {
    "username": "alice",
    "key": "config",
    "value": {"theme": "dark", "lang": "en"},
    "ttl": 3600
  }
}
```

### kv_delete
Delete a key from the store.

**Parameters:**
- `username` (string, required): Username for key isolation
- `key` (string, required): The key to delete

### kv_exists
Check if a key exists in the store.

**Parameters:**
- `username` (string, required): Username for key isolation
- `key` (string, required): The key to check

### kv_keys
List keys matching a pattern.

**Parameters:**
- `username` (string, required): Username for key isolation
- `pattern` (string, optional): Glob pattern to match keys (* and ? wildcards supported)

**Example:**
```json
{
  "tool": "kv_keys",
  "arguments": {
    "username": "alice",
    "pattern": "config.*"
  }
}
```

## Streamable HTTP API

All endpoints require a `username` parameter for user isolation.

### Endpoints

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET /sse
Server-Sent Events endpoint for MCP over HTTP.

#### GET /kv/:key
Get value by key.

**Query Parameters:**
- `username` (required): Username for key isolation

**Example:**
```bash
curl "http://localhost:3001/kv/config?username=alice"
```

#### POST /kv/:key
Set key-value pair.

**Body:**
```json
{
  "username": "alice",
  "value": {"theme": "dark"},
  "ttl": 3600
}
```

#### DELETE /kv/:key
Delete key.

**Body:**
```json
{
  "username": "alice"
}
```

#### HEAD /kv/:key
Check if key exists (returns 200 if exists, 404 if not).

**Query Parameters:**
- `username` (required): Username for key isolation

#### GET /keys
List keys with optional pattern.

**Query Parameters:**
- `username` (required): Username for key isolation
- `pattern` (optional): Glob pattern

**Example:**
```bash
curl "http://localhost:3001/keys?username=alice&pattern=config.*"
```

#### GET /kv
Get all key-value pairs for a user.

**Query Parameters:**
- `username` (required): Username for key isolation
- `pattern` (optional): Glob pattern

## Storage Modes

### Memory Mode
- Fast access
- Data lost on restart
- Memory usage limited by `--max-memory`

### File Mode
- Persistent storage
- Slower than memory
- Data survives restarts

### Hybrid Mode (Default)
- Best of both worlds
- Hot data in memory, cold data on disk
- Automatic sync based on `--sync-interval`

## User Isolation

Keys are automatically prefixed with the username using the format `username:key`. This ensures complete data separation between users while maintaining a clean API where users only see their own key names.

**Internal storage:** `alice:config`
**User sees:** `config`

## Examples

### Using with MCP Client

```typescript
// Get a value
const result = await mcpClient.callTool('kv_get', {
  username: 'alice',
  key: 'settings'
});

// Set a value with TTL
await mcpClient.callTool('kv_set', {
  username: 'alice',
  key: 'session',
  value: { id: 'abc123', expires: Date.now() + 3600000 },
  ttl: 3600
});

// List user's keys
const keys = await mcpClient.callTool('kv_keys', {
  username: 'alice',
  pattern: 'session.*'
});
```

### Using HTTP API

```bash
# Set a value
curl -X POST http://localhost:3001/kv/config \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "value": {"theme": "dark"}, "ttl": 3600}'

# Get a value
curl "http://localhost:3001/kv/config?username=alice"

# List keys
curl "http://localhost:3001/keys?username=alice&pattern=*"

# Delete a key
curl -X DELETE http://localhost:3001/kv/config \
  -H "Content-Type: application/json" \
  -d '{"username": "alice"}'
```

## Architecture

- **KVStore**: Core storage engine with pluggable backends
- **MCP Server**: Implements Model Context Protocol for tool-based access
- **Streamable HTTP Server**: REST API with CORS support and SSE streaming
- **SSE Transport**: Server-Sent Events for real-time MCP connections
- **User Isolation**: Automatic key prefixing for multi-tenant usage

## Error Handling

All operations return structured error responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

HTTP endpoints use appropriate status codes:
- 200: Success
- 400: Bad request (missing username, invalid parameters)
- 404: Key not found
- 500: Internal server error

## License

MIT
