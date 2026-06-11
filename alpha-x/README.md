# ALPHA-X Daily Briefing

Automated swing-trading research briefing, emailed every weekday at **7:00 AM Eastern**.

Each morning a GitHub Actions workflow ([`.github/workflows/alpha-x-daily.yml`](../.github/workflows/alpha-x-daily.yml)):

1. Pulls precise market data via `yfinance` — S&P 500, Nasdaq, Dow, Russell 2000, TSX, VIX, 10-year yield, oil, gold, CAD/USD, and all 11 US sector ETFs (last close, 1D/5D/1M change, distance from 50/200-day moving averages).
2. Sends that data to Claude (`claude-opus-4-8`) running the ALPHA-X investment-committee framework, with live **web search** for overnight news and the day's economic calendar.
3. Emails the resulting briefing to your Gmail and saves it as a workflow artifact (kept 90 days).

The briefing leads with a trade / **NO TRADE TODAY** call, and includes setups (entry, targets, stop, sizing for a $1,000 account at 1% max risk), a conditional watchlist, a self-critique, and the week's key events.

## One-time setup

### 1. Add repository secrets

GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | API key from [console.anthropic.com](https://console.anthropic.com/) → API Keys. Requires a funded account. |
| `GMAIL_ADDRESS` | Your Gmail address (sender and recipient). |
| `GMAIL_APP_PASSWORD` | A Gmail **App Password** — see below. Not your normal password. |

**Creating the Gmail App Password:** Google Account → Security → turn on **2-Step Verification** (required) → search "App passwords" → create one named e.g. `alpha-x` → copy the 16-character password.

### 2. Merge to `main`

GitHub only runs scheduled workflows from the **default branch**. The schedule starts firing once this folder and the workflow file are merged into `main`.

### 3. Test it manually

GitHub → **Actions → ALPHA-X Daily Briefing → Run workflow**. A manual run skips the 7 AM time check, so you can verify the email arrives end-to-end right away.

## Cost and caveats

- **~$0.15–0.50 per briefing** (Claude Opus 4.8 at $5/$25 per million tokens, plus web search) → roughly **$5–10/month** for weekdays.
- GitHub's cron is best-effort — the run starts at 7:00 AM ET but may begin a few minutes late.
- Market data is the prior day's close (the run is pre-market); web search covers overnight developments. **Verify prices before acting — this is automated research, not personalized financial advice.**
- To change the time, edit the two `cron` lines and the hour check in the workflow (both UTC entries exist to handle daylight saving).
