#!/usr/bin/env python3
"""ALPHA-X daily market briefing.

Pulls precise market data (indexes, sectors, volatility, commodities, rates)
via yfinance, then asks Claude — running the ALPHA-X investment-committee
framework with live web search — to produce the daily swing-trading briefing.
The result is emailed via Gmail and saved to briefing.md.

Required environment variables:
  ANTHROPIC_API_KEY     Anthropic API key
  GMAIL_ADDRESS         Gmail address (sender and recipient)
  GMAIL_APP_PASSWORD    Gmail App Password (not the account password)
"""

import os
import smtplib
import ssl
import sys
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from zoneinfo import ZoneInfo

import anthropic
import markdown
import yfinance as yf

MODEL = "claude-opus-4-8"
MAX_WEB_SEARCHES = 8
MAX_PAUSE_CONTINUATIONS = 5

TICKERS = {
    "Indexes": {
        "^GSPC": "S&P 500",
        "^IXIC": "Nasdaq Composite",
        "^DJI": "Dow Jones",
        "^RUT": "Russell 2000",
        "^GSPTSE": "S&P/TSX Composite",
    },
    "Volatility & Rates": {
        "^VIX": "VIX",
        "^TNX": "US 10Y Yield (x10)",
    },
    "Commodities & FX": {
        "CL=F": "WTI Crude",
        "GC=F": "Gold",
        "CADUSD=X": "CAD/USD",
    },
    "US Sectors": {
        "XLE": "Energy",
        "XLK": "Technology",
        "XLF": "Financials",
        "XLV": "Health Care",
        "XLI": "Industrials",
        "XLY": "Cons. Discretionary",
        "XLP": "Cons. Staples",
        "XLU": "Utilities",
        "XLB": "Materials",
        "XLRE": "Real Estate",
        "XLC": "Communications",
    },
}

SYSTEM_PROMPT = """\
You are ALPHA-X, an institutional-grade hybrid investment and swing trading
research system acting as an investment committee (quant, technical,
fundamental, macro, sentiment, risk manager, portfolio manager). You maximize
long-term risk-adjusted returns while protecting capital. Think in
probabilities, never assume certainty, never give blind optimism, and
challenge your own assumptions before recommending anything.

ACCOUNT PROFILE
- Capital: $1,000 | Risk: moderate | Horizon: swing trading | Review: daily
- Never risk more than 1% of account value ($10) on a single trade.
- Prefer reward-to-risk above 2:1. Avoid illiquid names. Max 3 positions.
- Cash is a valid position. If no attractive opportunity exists, output
  "NO TRADE TODAY" prominently and explain why preserving capital is superior.

PROCESS
1. Use the precise market data provided in the user message as your primary
   numbers — do not contradict it with vaguer figures.
2. Use web search (you have a limited budget of searches) for: overnight news,
   today's economic calendar / earnings, geopolitical developments, and any
   specific setup you are considering. Cite sources inline as markdown links.
3. Assess market environment (trend, breadth, volatility, sector leadership,
   US + Canada), then decide: either NO TRADE TODAY, or at most 1-2 concrete
   setups using this format per setup:
   Ticker / Thesis / Rating / Confidence % / Holding period / Entry zone /
   Targets 1-3 / Stop loss / R:R / Position size ($ and %) / Bull-Base-Bear
   scenarios with probabilities / Catalysts / Risks.
4. Always include: a watchlist with the conditions that would trigger entries,
   a self-critique (why the call may fail, what invalidates it), and key
   events for the next 5 trading days.

OUTPUT RULES
- Markdown, suitable for email. Lead with the bottom line (trade or no trade).
- Keep it readable: complete sentences, no unexplained shorthand.
- End with: "This is automated research, not personalized financial advice.
  Data may be delayed — verify prices before acting."
"""


def pct(new: float, old: float) -> float:
    return (new / old - 1.0) * 100.0


def fetch_market_data() -> str:
    """Build a markdown table of precise levels and trend stats per ticker."""
    lines = []
    for group, tickers in TICKERS.items():
        lines.append(f"\n### {group}")
        lines.append("| Name | Last | 1D % | 5D % | 1M % | vs 50DMA | vs 200DMA |")
        lines.append("|---|---|---|---|---|---|---|")
        for symbol, name in tickers.items():
            try:
                hist = yf.Ticker(symbol).history(period="1y")["Close"].dropna()
                if len(hist) < 30:
                    raise ValueError("insufficient history")
                last = hist.iloc[-1]
                d1 = pct(last, hist.iloc[-2])
                d5 = pct(last, hist.iloc[-6]) if len(hist) > 6 else float("nan")
                m1 = pct(last, hist.iloc[-22]) if len(hist) > 22 else float("nan")
                ma50 = hist.rolling(50).mean().iloc[-1]
                ma200 = hist.rolling(200).mean().iloc[-1] if len(hist) >= 200 else None
                vs50 = pct(last, ma50)
                vs200 = f"{pct(last, ma200):+.1f}%" if ma200 else "n/a"
                lines.append(
                    f"| {name} ({symbol}) | {last:,.2f} | {d1:+.2f}% | {d5:+.2f}% "
                    f"| {m1:+.2f}% | {vs50:+.1f}% | {vs200} |"
                )
            except Exception as exc:  # keep the briefing going if one feed fails
                lines.append(f"| {name} ({symbol}) | data unavailable ({exc}) | | | | | |")
    return "\n".join(lines)


def generate_briefing(market_data: str) -> str:
    client = anthropic.Anthropic()
    now_et = datetime.now(ZoneInfo("America/New_York"))
    user_message = {
        "role": "user",
        "content": (
            f"It is {now_et:%A, %B %d, %Y at %I:%M %p} Eastern Time (pre-market).\n"
            f"Here is precise market data as of the latest close:\n{market_data}\n\n"
            "Produce today's ALPHA-X daily briefing. Search the web for overnight "
            "news, today's economic calendar, and anything needed to validate or "
            "reject a setup before recommending it."
        ),
    }
    messages = [user_message]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": MAX_WEB_SEARCHES}]

    response = None
    for _ in range(MAX_PAUSE_CONTINUATIONS):
        with client.messages.stream(
            model=MODEL,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
        ) as stream:
            response = stream.get_final_message()
        if response.stop_reason != "pause_turn":
            break
        # Server-side tool loop paused; echo the assistant turn back to resume.
        messages.append({"role": "assistant", "content": response.content})

    text = "\n\n".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        raise RuntimeError(f"No text in model response (stop_reason={response.stop_reason})")
    return text


def send_email(subject: str, body_md: str) -> None:
    sender = os.environ["GMAIL_ADDRESS"]
    password = os.environ["GMAIL_APP_PASSWORD"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = sender
    msg.attach(MIMEText(body_md, "plain"))
    html = markdown.markdown(body_md, extensions=["tables", "fenced_code"])
    msg.attach(MIMEText(f"<div style='font-family:sans-serif'>{html}</div>", "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context()) as smtp:
        smtp.login(sender, password)
        smtp.sendmail(sender, [sender], msg.as_string())


def main() -> int:
    now_et = datetime.now(ZoneInfo("America/New_York"))
    print("Fetching market data...")
    market_data = fetch_market_data()
    print("Generating ALPHA-X briefing...")
    briefing = generate_briefing(market_data)

    with open("briefing.md", "w") as f:
        f.write(briefing)

    subject = f"ALPHA-X Daily Briefing — {now_et:%a %b %d, %Y}"
    print("Sending email...")
    send_email(subject, briefing)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
