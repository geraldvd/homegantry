# Contributing

## Development Setup

### Requirements

- **Node.js 20+**
- **npm 10+**
- **Docker Engine** with the Docker socket accessible (for testing container discovery)

### Running Locally

```bash
git clone https://github.com/geraldvd/homegantry.git
cd homegantry
npm install
npm run dev
```

This starts both the Express backend (`tsx watch`) and the Vite dev server concurrently:

- **Frontend**: [http://localhost:5173](http://localhost:5173) (with hot module replacement)
- **Backend**: [http://localhost:3000](http://localhost:3000) (with auto-restart on changes)

The Vite dev server proxies `/api` requests to the backend automatically.

### Using Docker Compose for Development

A development compose file is provided that mounts your source code for live-reload:

```bash
docker compose -f docker-compose.dev.yml up
```

This builds and runs the app with your local source mounted, so changes trigger automatic rebuilds.

### Build Commands

```bash
npm run build        # Build both frontend and backend for production
npm run build:client # Build frontend only (Vite)
npm run build:server # Build backend only (TypeScript)
npm run typecheck    # Type-check frontend and backend without emitting
```

## Project Structure

```
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── context/          # React context (state management)
│   ├── api/              # API client layer
│   ├── App.tsx           # Root component
│   └── main.tsx          # Entry point
├── server/               # Express backend
│   ├── index.ts          # Server entry point
│   ├── config.ts         # Environment configuration
│   ├── routes.ts         # API route definitions
│   ├── docker.ts         # Docker Engine API integration
│   ├── matcher.ts        # Service knowledge base matching
│   ├── storage.ts        # JSON file persistence
│   └── known-services.json  # Service database
├── docs/                 # VitePress documentation site
├── Dockerfile            # Production container image
└── docker-compose.yml    # End-user deployment
```

## Adding a Known Service

The service knowledge base is in `server/known-services.json`. See
[Adding a service to the knowledge base](https://github.com/geraldvd/homegantry/blob/main/CONTRIBUTING.md#adding-a-service-to-the-knowledge-base)
in CONTRIBUTING.md for the entry format, then add a test case to `test/server/matcher.test.ts` and run `npm test`.

## Tests and Linting

```bash
npm test              # vitest unit + supertest API tests (no Docker socket needed)
npm run test:coverage # coverage report for server/
npm run lint          # ESLint + Prettier check
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run `npm run typecheck` to catch type errors
5. Submit a pull request with a clear description of the change
