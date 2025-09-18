# ContextShare Web Admin

A modern Next.js web application for managing ContextShare catalogs and resources through the Admin API.

## Features

- **Dashboard**: Overview of catalogs, resources, and server health
- **Catalog Management**: Create, view, and manage catalogs
- **Resource Management**: Full CRUD operations for all resource types
- **Code Editor**: Monaco-based editor with syntax highlighting
- **Real-time Health Monitoring**: Server status monitoring with automatic checks
- **Responsive Design**: Mobile-friendly interface built with Tailwind CSS

## Prerequisites

1. **ContextShare Server**: Must be running in database or hybrid mode with Admin API enabled
2. **Node.js**: Version 18 or higher
3. **npm**: For dependency management

## Quick Start

### 1. Navigate to the web-admin directory

```bash
cd server/web-admin
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy the example environment file and configure your settings:

```bash
# The .env.local file should already exist with:
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

Update the URL to match your ContextShare server location.

### 4. Start the development server

```bash
npm run dev
```

The web admin interface will be available at `http://localhost:3001`.

## Server Setup

Ensure your ContextShare server is running in database mode:

```powershell
# PowerShell (from the server directory)
cd ..
$env:MODE = "database"
$env:DATABASE_PATH = "./catalog.db"
$env:PORT = "3000"
npm run build
npm start
```

## Application Structure

```
server/web-admin/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── catalogs/          # Catalog management pages
│   │   ├── resources/         # Resource management pages
│   │   ├── health/            # Health monitoring page
│   │   └── page.tsx           # Dashboard
│   ├── components/
│   │   ├── layout/            # Navigation and layout components
│   │   └── ui/                # Reusable UI components
│   ├── lib/
│   │   └── api.ts             # API client configuration
│   └── types/
│       └── api.ts             # TypeScript type definitions
├── public/                    # Static assets
└── package.json
```

## Features

### Dashboard

- Server health status with automatic monitoring
- Catalog and resource statistics
- Quick actions for common tasks
- Recent catalogs overview

### Catalog Management

- **View Catalogs**: List all catalogs with status and resource counts
- **Create Catalog**: Form-based catalog creation with validation
- **Catalog Details**: Detailed view with resource breakdown by category

### Resource Management

- **Create Resources**: Multi-step form with category-specific templates
- **Edit Resources**: Monaco code editor with syntax highlighting
- **Delete Resources**: Safe deletion with confirmation
- **Metadata Support**: JSON metadata editing for all resources

### Code Editor

- **Monaco Editor**: VS Code-style editing experience
- **Syntax Highlighting**: Automatic language detection based on file type
- **Multiple Languages**: Support for Markdown, JSON, YAML, TypeScript, and more
- **Auto-formatting**: Proper indentation and formatting

### Health Monitoring

- **Real-time Checks**: Automatic health checks every 30 seconds
- **Response Time Tracking**: Monitor API performance
- **Server Information**: Display configuration and endpoints
- **Manual Refresh**: On-demand health checks

## API Configuration

The application uses axios for API communication. Configuration is centralized in `src/lib/api.ts`:

```typescript
// Base URL configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// Automatic error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw { error: 'network_error', details: [error.message] } as ApiError;
  }
);
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | ContextShare server base URL |

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

### Code Editor Integration

The Monaco editor supports multiple file types:

- **Markdown** (`.md`): Instructions, prompts, chat modes
- **JSON** (`.json`): Tasks, MCP configurations, metadata
- **YAML** (`.yaml`, `.yml`): Configuration files
- **TypeScript** (`.ts`): Scripts and configurations

### Adding New Resource Types

1. Update `ResourceCategory` type in `src/types/api.ts`
2. Add category to `categoryOptions` in resource forms
3. Define default content template in `getDefaultContentForCategory`
4. Add appropriate file extension in `getFileExtensionForCategory`

## API Integration

The web admin integrates with the ContextShare Admin API endpoints:

### Catalog Endpoints

- `GET /admin/catalogs` - List catalogs
- `POST /admin/catalogs` - Create catalog
- `GET /admin/catalogs/:id/resources` - List resources in catalog

### Resource Endpoints

- `POST /admin/resources` - Create resource
- `GET /admin/resources/:catalogId/:category/:filename` - Get resource
- `PUT /admin/resources/:catalogId/:category/:filename` - Update resource
- `DELETE /admin/resources/:catalogId/:category/:filename` - Delete resource

### Health Endpoint

- `GET /healthz` - Server health check

## Error Handling

The application includes comprehensive error handling:

- **Network Errors**: Automatic retry and user-friendly messages
- **Validation Errors**: Form validation with detailed feedback
- **API Errors**: Structured error responses from the server
- **Loading States**: Visual feedback during async operations

## Security Considerations

**Important**: This web admin interface does not include authentication. For production use:

1. **Add Authentication**: Implement login/logout functionality
2. **API Security**: Ensure the ContextShare server has proper authentication
3. **HTTPS**: Use TLS encryption for all traffic
4. **CORS**: Configure proper CORS settings on the server
5. **Rate Limiting**: Implement client-side and server-side rate limiting

## Troubleshooting

### Common Issues

1. **Server Connection Failed**
   - Check that ContextShare server is running
   - Verify `NEXT_PUBLIC_API_BASE_URL` is correct
   - Ensure server is in database/hybrid mode

2. **Health Check Fails**
   - Confirm server is accessible at the configured URL
   - Check for CORS issues in browser console
   - Verify `/healthz` endpoint is available

3. **Editor Not Loading**
   - Monaco editor requires modern browser
   - Check browser console for JavaScript errors
   - Ensure all dependencies are installed

### Debug Mode

Enable detailed logging by checking browser console. The application logs:

- API requests and responses
- Editor state changes
- Navigation events
- Error details

## Production Deployment

### Build for Production

```bash
npm run build
npm run start
```

### Environment Configuration

```bash
# Production environment
NEXT_PUBLIC_API_BASE_URL=https://your-contextshare-server.com
```

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

## Contributing

1. Follow existing code patterns and TypeScript conventions
2. Add appropriate error handling for new features
3. Update documentation for new functionality
4. Test against the ContextShare server Admin API

## License

This project is part of the ContextShare ecosystem and follows the same license terms.

## Support

For issues specific to the web admin interface:

1. Check the browser console for errors
2. Verify ContextShare server is running and accessible
3. Ensure all environment variables are configured correctly
4. Review the server logs for API-related issues
