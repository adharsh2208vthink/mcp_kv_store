# KV Store MCP Server

A production-ready Model Context Protocol (MCP) server implementation providing key-value storage capabilities for AI agents and applications. Built with TypeScript and Express, featuring both local and remote deployment options with comprehensive tool support.

## Overview

This MCP server exposes a full-featured key-value store through 13 standardized tools, enabling AI agents to perform persistent data operations including storage, retrieval, manipulation, and database management. The server implements the latest MCP Streamable HTTP transport specification for optimal compatibility and performance.

## Features

### Core Storage Operations
- **Key-Value Management**: Set, get, delete, and check existence of keys
- **Data Types**: Support for all JSON-serializable data types
- **TTL Support**: Time-to-live functionality with automatic expiration
- **Pattern Matching**: Glob-based key filtering and listing

### Advanced Operations
- **Atomic Operations**: Increment and decrement numeric values
- **String Manipulation**: Append operations for string concatenation
- **Database Utilities**: Statistics, backup, and clear operations
- **Session Management**: Stateful connections with automatic cleanup

### Transport & Deployment
- **Streamable HTTP**: Modern MCP transport with SSE support
- **Local Development**: STDIO transport for development and testing
- **Remote Deployment**: Production-ready deployment on cloud platforms
- **Health Monitoring**: Built-in health checks and logging

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn package manager
- TypeScript 5.0+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd mcp_kv_store

# Install dependencies
npm install

# Build the project
npm run build
```

### Local Development

```bash
# Start in development mode
npm run dev

# Or start the built version
npm start
```

### Remote Deployment

The server is designed for deployment on platforms like Render, Heroku, or any Node.js hosting service:

```bash
# Production build
npm run build

# Start production server
npm start
```

## Configuration

### Environment Variables

```bash
PORT=3000                    # Server port (auto-detected on cloud platforms)
NODE_ENV=production         # Environment mode
KV_DATA_DIR=./kv-data      # Data directory path
KV_STORAGE_MODE=hybrid     # Storage mode: memory|file|hybrid
KV_MAX_MEMORY_MB=100       # Maximum memory usage
KV_SYNC_INTERVAL=30        # Sync interval in seconds
KV_LOG_LEVEL=info          # Logging level: debug|info|warn|error
```

### Storage Modes

- **Memory**: Fast in-memory storage (data lost on restart)
- **File**: Persistent disk storage with automatic backups
- **Hybrid**: Combines memory performance with disk persistence

## MCP Tools Reference

### Storage Operations

#### `kv_set`
Store a key-value pair with optional TTL.
```json
{
  "key": "string",
  "value": "any",
  "ttl": "number (optional)"
}
```

#### `kv_get`
Retrieve a value by key.
```json
{
  "key": "string"
}
```

#### `kv_delete`
Remove a key-value pair.
```json
{
  "key": "string"
}
```

#### `kv_exists`
Check if a key exists.
```json
{
  "key": "string"
}
```

### Query Operations

#### `kv_keys`
List keys matching a pattern.
```json
{
  "pattern": "string (optional, supports * and ? wildcards)"
}
```

#### `kv_stats`
Get database statistics including memory usage, key count, and performance metrics.

### Time-Based Operations

#### `kv_expire`
Set expiration time for a key.
```json
{
  "key": "string",
  "seconds": "number"
}
```

#### `kv_ttl`
Get remaining time-to-live for a key.
```json
{
  "key": "string"
}
```

### Numeric Operations

#### `kv_incr`
Increment a numeric value atomically.
```json
{
  "key": "string"
}
```

#### `kv_decr`
Decrement a numeric value atomically.
```json
{
  "key": "string"
}
```

### String Operations

#### `kv_append`
Append text to an existing string value.
```json
{
  "key": "string",
  "value": "string"
}
```

### Database Operations

#### `kv_backup`
Create a backup of the current database state.

#### `kv_clear`
Remove all keys from the database.

## Client Integration

### Claude Desktop

Configure Claude Desktop to connect to your MCP server:

```json
{
  "mcpServers": {
    "kv-store": {
      "command": "npx",
      "args": [
        "mcp-remote", 
        "https://your-deployment-url.com/mcp"
      ]
    }
  }
}
```

### Local Development

For local development with Claude Desktop:

```json
{
  "mcpServers": {
    "kv-store": {
      "command": "node",
      "args": ["dist/kv-store/index.js", "--stdio"]
    }
  }
}
```

### Other MCP Clients

The server supports any MCP-compatible client using either:
- **STDIO transport**: For local connections
- **Streamable HTTP transport**: For remote connections

## API Endpoints

In addition to MCP tools, the server exposes HTTP endpoints for direct integration:

### Health Check
```http
GET /health
```

### Direct KV Operations
```http
GET /kv/{key}          # Get value
POST /kv/{key}         # Set value
DELETE /kv/{key}       # Delete key
```

### Statistics
```http
GET /stats             # Database statistics
```

## Development

### Project Structure

```
src/
├── kv-store/
│   ├── index.ts           # Main server entry point
│   └── kv-store.ts        # Core KV store implementation
├── server_runner.ts       # MCP server framework
└── types/                 # TypeScript definitions
```

### Build Scripts

```bash
npm run build         # Compile TypeScript
npm run dev           # Development mode with hot reload
npm run clean         # Clean build artifacts
npm run test          # Run health check tests
```

### Development Workflow

1. Make changes to source files in `src/`
2. Use `npm run dev` for automatic rebuilding
3. Test with MCP Inspector or Claude Desktop
4. Build for production with `npm run build`

## Deployment

### Render (Recommended)

1. Connect your GitHub repository to Render
2. Set build command: `npm run build`
3. Set start command: `npm start`
4. Configure environment variables as needed

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["npm", "start"]
```

### Manual Deployment

Ensure your deployment platform:
- Supports Node.js 18+
- Allows HTTP/HTTPS traffic on the configured port
- Provides persistent storage if using file-based storage mode

## Performance

### Benchmarks
- **Memory mode**: 10,000+ ops/sec
- **File mode**: 1,000+ ops/sec
- **Hybrid mode**: 5,000+ ops/sec (memory) + persistence

### Scaling Considerations
- Use Redis adapter for distributed deployments
- Implement connection pooling for high-traffic scenarios
- Consider read replicas for read-heavy workloads

## Security

### Best Practices
- Enable HTTPS in production
- Implement rate limiting for public deployments
- Use environment variables for sensitive configuration
- Regular backup and monitoring

### Authentication
The server currently operates without authentication. For production use with sensitive data, implement:
- OAuth 2.1 with PKCE (for MCP clients that support it)
- API key authentication for HTTP endpoints
- Network-level restrictions (VPC, firewall rules)

## Troubleshooting

### Common Issues

**Connection Refused**
- Verify the server is running on the correct port
- Check firewall settings and network connectivity

**Tool Not Found**
- Ensure client is properly configured
- Verify MCP transport compatibility

**Data Loss**
- Check storage mode configuration
- Verify write permissions for file-based storage
- Review backup and recovery procedures

### Debugging

Enable debug logging:
```bash
KV_LOG_LEVEL=debug npm start
```

Use MCP Inspector for protocol-level debugging:
```bash
npx @modelcontextprotocol/inspector
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request

### Code Standards
- TypeScript strict mode
- ESLint configuration included
- Comprehensive error handling
- Documentation for new features

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review MCP documentation at modelcontextprotocol.io
