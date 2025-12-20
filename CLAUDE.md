# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ulak Scrapping is a serverless web scraping service built on AWS Lambda that fetches user followings and content from various social media platforms (currently Medium, with support planned for X and Instagram). The service uses Puppeteer for web scraping, caches data in Upstash Redis, and provides search functionality via Upstash Search.

## Commands

### Development
```bash
# Install dependencies (uses bun)
bun install

# Run locally with serverless-offline
serverless offline

# Deploy to AWS
serverless deploy
```

### Environment Setup
Copy `.env.example` to `.env.dev` and configure:
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` - Redis cache
- `UPSTASH_SEARCH_REST_URL` and `UPSTASH_SEARCH_REST_TOKEN` - Search functionality
- `PUPPETEER_CHROMIUM_PATH` - Local Chromium path (for local development only)
- `SUPABASE_URL` - Used for JWT authorization

## Architecture

### Handler Functions (AWS Lambda)
Located in `handlers/`:
- **fetchFollowings** (`handlers/fetch-followings.ts`) - Retrieves user followings from platforms
  - Endpoint: `GET /followings/platforms/{platformName}/users/{username}`
  - Supports search query parameter for filtering cached results
  - Caches results in Redis for 24 hours
  - Stores followings in Upstash Search for full-text search capabilities
- **fetchContents** (`handlers/fetch-contents.ts`) - Fetches user content (articles, posts)
  - Endpoint: `GET /contents/platforms/{platformName}/users/{username}`
  - Supports `since` query parameter (today, yesterday, last_week, last_month, last_year, all_time)
  - Caches results in Redis for 24 hours
- **send-emails** (`handlers/send-emails.ts`) - Scheduled function (runs every hour)

### Strategy Pattern Implementation
The codebase uses the Strategy pattern to support multiple platforms:

**Following Fetcher Strategies** (`followingFetcherStrategies/`):
- `followingFetcherFactory.ts` - Factory that returns platform-specific strategies
- Each strategy implements `FollowingFetcherStrategy` interface:
  - `isUserExists(username: string): Promise<boolean>`
  - `getFollowings(username: string): Promise<FollowingUser[]>`
- Currently implemented: `mediumStrategy.ts` uses Puppeteer with stealth plugin

**Content Fetcher Strategies** (`contentFetcherStrategies/`):
- `contentStrategyFactory.ts` - Factory for content fetching strategies
- Each strategy implements `ContentFetcherStrategy` interface:
  - `fetchContent(username: string, since: SinceDate): Promise<ContentItem[]>`
- Currently implemented: `mediumStrategy.ts`

### Adding New Platform Support
To add support for a new platform (e.g., X, Instagram):
1. Create a new strategy class in `followingFetcherStrategies/` implementing `FollowingFetcherStrategy`
2. Create a corresponding strategy in `contentFetcherStrategies/` implementing `ContentFetcherStrategy`
3. Register the strategy in both factory classes' `strategies` Map
4. The platform name should be added to the Zod enum validation in handlers

### Key Technologies
- **Puppeteer + Stealth Plugin**: Web scraping with bot detection avoidance
- **@sparticuz/chromium**: Chromium binary optimized for AWS Lambda
- **Cheerio**: HTML parsing after page content extraction
- **Upstash Redis**: Caching layer (24-hour TTL)
- **Upstash Search**: Full-text search for followings
- **Zod**: Runtime validation for API inputs
- **Serverless Framework**: Deployment and local development

### Authentication
All HTTP endpoints use Supabase JWT authorizer configured in `serverless.yml`. Requests must include a valid JWT in the `Authorization` header.

### Build Configuration
The project uses esbuild (configured in `serverless.yml`) with several externalized dependencies:
- Puppeteer and Chromium packages
- Cheerio
- Upstash clients
- XML parser

These are excluded from bundling to reduce Lambda package size.
