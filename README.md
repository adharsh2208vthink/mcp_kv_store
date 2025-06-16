# KV Store MCP Server

A Redis-backed key-value storage server implementing the Model Context Protocol (MCP) for seamless integration with Claude Desktop and other MCP clients.

## Features

- **Redis Persistence** - Data survives restarts and deployments
- **User Isolation** - Multi-tenant support with username-based key prefixes
- **TTL Support** - Set expiration times for keys
- **Pattern Matching** - Search keys using glob patterns (`*`, `?`)
- **Docker Ready** - Containerized for easy deployment
- **Cloud Deployable** - Supports any container platform
- **MCP Integration** - Direct integration with Claude Desktop

## Quick Start

### Option 1: Run Locally

```bash
# Clone the repository
git clone https://github.com/adharsh2208vthink/mcp_kv_store.git
cd mcp_kv_store

# Install dependencies
npm install

# Start Redis (required)
redis-server

# Build and run
npm run build
npm start
```

### Option 2: Docker

```bash
# Build and run with Docker
docker build -t kv-store .
docker run -p 8080:8080 kv-store
```

## Available Tools

### `kv_set`
Store a key-value pair with optional TTL.

```typescript
kv_set({
  username: "myuser",
  key: "user_profile", 
  value: {"name": "John", "age": 30},
  ttl: 3600  // optional: expires in 1 hour
})
```

### `kv_get`
Retrieve a value by key.

```typescript
kv_get({
  username: "myuser",
  key: "user_profile"
})
```

### `kv_delete`
Delete a key-value pair.

```typescript
kv_delete({
  username: "myuser",
  key: "user_profile"
})
```

### `kv_exists`
Check if a key exists.

```typescript
kv_exists({
  username: "myuser", 
  key: "user_profile"
})
```

### `kv_keys`
List keys with optional pattern matching.

```typescript
kv_keys({
  username: "myuser",
  pattern: "user_*"  // optional: glob pattern
})
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Direct KV Operations
```bash
# Get a key
GET /kv/mykey?username=myuser

# Set a key  
POST /kv/mykey?username=myuser
Content-Type: application/json
{"value": "myvalue", "ttl": 3600}

# Delete a key
DELETE /kv/mykey?username=myuser
```

### Statistics
```bash
GET /stats
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

## Deployment

### Render (Current)
The service is deployed on Render with automatic deployments from the main branch.

### Azure Container Instances
```bash
# Build and push to Azure Container Registry
az acr build --registry myregistry --image kv-store .

# Deploy to Azure Container Instances  
az container create \
  --resource-group mygroup \
  --name kv-store \
  --image myregistry.azurecr.io/kv-store \
  --environment-variables PORT=80
```

### AWS ECS / Google Cloud Run
The Docker image is platform-agnostic and works on any container platform that provides a `PORT` environment variable.

## Development

### Prerequisites
- Node.js 18+
- Redis 6+
- TypeScript

### Setup
```bash
npm install
npm run build
npm run dev  # Development with hot reload
```

### Testing
```bash
npm test
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Claude        │    │   KV Store      │    │     Redis       │
│   Desktop       │◄──►│   MCP Server    │◄──►│   Database      │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

- **MCP Protocol** for Claude Desktop integration
- **Express.js** HTTP server with health checks
- **Redis** for persistent storage with TTL support
- **User isolation** via prefixed keys (`username:key`)

## Use Cases

- **AI Memory** - Give Claude persistent memory across conversations
- **Configuration** - Store app settings and preferences  
- **Session Data** - Maintain user state and progress
- **Quick Notes** - Temporary data storage with TTL
- **Data Exchange** - Share data between different AI sessions

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues:** [GitHub Issues](https://github.com/adharsh2208vthink/mcp_kv_store/issues)
- **MCP Docs:** [Model Context Protocol](https://modelcontextprotocol.io/)

---

**Made with care for the Claude Desktop community**
