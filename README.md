# KV Store MCP Server

A high-performance, feature-rich Key-Value store server that implements the Model Context Protocol (MCP) with both HTTP REST API and MCP protocol support. Built with TypeScript and Express, offering persistent storage, TTL support, and comprehensive data operations.

## Features

- **Dual Protocol Support**: Both MCP protocol and HTTP REST API
- **Persistent Storage**: File-based storage with automatic backup/restore
- **TTL Support**: Set expiration times for keys
- **Advanced Operations**: Increment, decrement, append operations
- **Pattern Matching**: Query keys with glob patterns
- **Health Monitoring**: Built-in health checks and statistics
- **CORS Enabled**: Ready for web applications
- **Memory Management**: Configurable memory limits and sync intervals

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd mcp_kv_store

# Install dependencies
npm install

# Build the project
npm run build
```

## Quick Start

### Start HTTP Server
```bash
npm run start:http
```

### Start MCP Server (stdio)
```bash
npm run start:stdio
```

### Development Mode
```bash
npm run dev:kv
```

## 🔧 Configuration Options

```bash
node dist/kv-store/index.js [options]

Options:
  -d, --data-dir <path>         Data directory path (default: "./kv-data")
  -m, --mode <mode>            Storage mode (memory|file|hybrid) (default: "hybrid")
  --max-memory <mb>            Max memory usage in MB (default: "100")
  --sync-interval <seconds>    Sync interval in seconds (default: "30")
  --log-level <level>          Log level (debug|info|warn|error) (default: "info")
  --http-port <port>           HTTP server port (default: "3001")
  --http-only                  Run only HTTP server (no MCP stdio)
  --stdio                      Run MCP server on stdio only
```

## 🌐 HTTP REST API

### Base URL
```
http://localhost:3001
```

### Endpoints

#### Health Check
```bash
GET /health
# Response: {"status":"ok","timestamp":"2025-06-11T10:50:42.652Z"}
```

#### Key Operations

**Get Value**
```bash
GET /kv/:key
# Example: curl http://localhost:3001/kv/user_alice
```

**Set Value**
```bash
POST /kv/:key
Content-Type: application/json
{
  "value": "any-json-value",
  "ttl": 3600  // optional, seconds
}
# Example: curl -X POST http://localhost:3001/kv/mykey -H "Content-Type: application/json" -d '{"value": {"name": "John"}}'
```

**Delete Key**
```bash
DELETE /kv/:key
# Example: curl -X DELETE http://localhost:3001/kv/mykey
```

**Check if Key Exists**
```bash
HEAD /kv/:key
# Returns 200 if exists, 404 if not
```

#### Bulk Operations

**Get All Keys**
```bash
GET /keys?pattern=*
# Example: curl "http://localhost:3001/keys?pattern=user_*"
```

**Get All Data**
```bash
GET /kv?pattern=*
# Example: curl http://localhost:3001/kv
```

**Clear All Data**
```bash
DELETE /kv
```

#### Advanced Operations

**Set Expiration**
```bash
POST /kv/:key/expire
Content-Type: application/json
{"seconds": 3600}
```

**Get TTL**
```bash
GET /kv/:key/ttl
```

**Increment Value**
```bash
POST /kv/:key/incr
```

**Decrement Value**
```bash
POST /kv/:key/decr
```

**Append to Value**
```bash
POST /kv/:key/append
Content-Type: application/json
{"value": "text-to-append"}
```

#### Management

**Get Statistics**
```bash
GET /stats
```

**Create Backup**
```bash
POST /backup
```

## 🔌 MCP Protocol Integration

### For Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kv-store": {
      "command": "npx",
      "args": [
        "mcp-remote", 
        "https://your-deployed-url.onrender.com/sse"
      ]
    }
  }
}
```

### Available MCP Tools

- `kv_get` - Get a value by key
- `kv_set` - Set a key-value pair
- `kv_delete` - Delete a key
- `kv_exists` - Check if key exists
- `kv_keys` - List keys with pattern matching
- `kv_expire` - Set expiration for key
- `kv_ttl` - Get time to live for key
- `kv_incr` - Increment numeric value
- `kv_decr` - Decrement numeric value
- `kv_append` - Append to string value
- `kv_stats` - Get database statistics
- `kv_backup` - Create backup
- `kv_clear` - Clear all data

## 🚀 Deployment

### Deploy to Render

1. **Push to GitHub**
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

2. **Create Render Web Service**
   - Go to [render.com](https://render.com)
   - Connect your GitHub repository
   - Use these settings:
     - **Build Command**: `npm run build`
     - **Start Command**: `npm run start:http`
     - **Environment**: Node.js

3. **Environment Variables** (optional)
```
DATA_DIR=/opt/render/project/data
LOG_LEVEL=info
MAX_MEMORY=256
```

### Deploy to Other Platforms

**Docker**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["npm", "run", "start:http"]
```

**Railway/Vercel/Netlify**
- Build Command: `npm run build`
- Start Command: `npm run start:http`
- Port: `3001`

## 📊 Usage Examples

### Basic Operations
```bash
# Set a user profile
curl -X POST http://localhost:3001/kv/user_123 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "John Doe", "email": "john@example.com", "role": "admin"}}'

# Get the user profile
curl http://localhost:3001/kv/user_123

# Set with expiration (1 hour)
curl -X POST http://localhost:3001/kv/session_token \
  -H "Content-Type: application/json" \
  -d '{"value": "abc123", "ttl": 3600}'

# List all user keys
curl "http://localhost:3001/keys?pattern=user_*"

# Get statistics
curl http://localhost:3001/stats
```

### Counter Example
```bash
# Initialize counter
curl -X POST http://localhost:3001/kv/page_views \
  -H "Content-Type: application/json" \
  -d '{"value": 0}'

# Increment counter
curl -X POST http://localhost:3001/kv/page_views/incr

# Get current count
curl http://localhost:3001/kv/page_views
```

## 🔧 Development

### Scripts
```bash
npm run build          # Build TypeScript
npm run dev:kv         # Development mode with auto-reload
npm run start:http     # Start HTTP server
npm run start:stdio    # Start MCP stdio server
npm run test           # Run tests (if available)
```

### Project Structure
```
src/
├── kv-store/
│   ├── index.ts       # Main server implementation
│   └── kv-store.ts    # KV store core logic
├── types/             # TypeScript type definitions
└── utils/             # Utility functions
```

