# Lead Generation System - Oracle PBCS/Hyperion Consulting

B2B lead generation system for finance technology consulting services.

## What It Does

1. **Scrapes job postings** for Oracle PBCS, Hyperion Planning, NSPB, EPBCS roles
2. **Enriches leads** using Hunter.io and Apollo.io APIs
3. **Sends personalized emails** via Gmail/Google Workspace
4. **Monitors replies** and classifies intent
5. **Books meetings** via Google Calendar

## Company

**Intersection Data Finance** - We help companies automate Oracle PBCS and Hyperion workflows through our subscription app and FP&A consulting services.

## Daily Limits

- **10 emails per working day** (respectful, non-spam volume)
- Gmail API limits: 500 emails/day (well within bounds)

## Data Sources

| Source | Purpose |
|--------|---------|
| Google Jobs | Job posting discovery |
| LinkedIn | Job and company data |
| Hunter.io | Email pattern discovery |
| Apollo.io | Contact enrichment |

## Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
# Fill in your API keys
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database
```bash
npm run db:setup
```

### 4. Run Lead Generation
```bash
# Scrape jobs
npm run scrape

# Enrich with emails
npm run enrich

# Send emails (limited to 10/day)
npm run send

# Monitor replies
npm run monitor
```

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Job Scraper  │───▶│  Enrichment  │───▶│  Database    │
│ (Puppeteer)  │    │(Hunter/Apollo│    │ (SQLite/PG)  │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
┌──────────────┐    ┌──────────────┐          │
│   Calendar   │◄───│   Gmail      │◄─────────┘
│  (Google)    │    │  (Google)    │
└──────────────┘    └──────────────┘
```

## Compliance

- ✅ B2B focus only (finance professionals)
- ✅ Clear unsubscribe in every email
- ✅ Company address included
- ✅ Honest subject lines
- ✅ Opt-out honored within 10 days

## Environment Variables

See `.env.example` for required configuration.

## License

MIT
