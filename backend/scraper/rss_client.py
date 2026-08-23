"""
RSS feed scraper — pulls latest crisis-related articles from major news sources.
"""

import feedparser
import httpx
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Article:
    title: str
    description: str
    url: str
    source: str
    published: str


FEEDS = [
    ("Reuters World",    "https://feeds.reuters.com/reuters/worldNews"),
    ("BBC World",        "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("Al Jazeera",       "https://www.aljazeera.com/xml/rss/all.xml"),
    ("AP World",         "https://rsshub.app/apnews/world-news"),
    ("Google News Crisis","https://news.google.com/rss/search?q=global+crisis+conflict+economy&hl=en&gl=US&ceid=US:en"),
]

CRISIS_KEYWORDS = [
    "war","conflict","crisis","famine","drought","flood","earthquake",
    "sanctions","inflation","food security","displacement","refugee",
    "shortage","supply chain","blockade","coup","protest","unrest",
]


async def fetch_articles(max_per_feed: int = 15) -> list[Article]:
    articles = []
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for source_name, url in FEEDS:
            try:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 NEXUS/1.0"})
                feed = feedparser.parse(resp.text)
                count = 0
                for entry in feed.entries:
                    if count >= max_per_feed:
                        break
                    title = entry.get("title", "")
                    desc  = entry.get("summary", entry.get("description", ""))
                    text  = (title + " " + desc).lower()
                    # Only keep crisis-relevant articles
                    if any(kw in text for kw in CRISIS_KEYWORDS):
                        articles.append(Article(
                            title=title,
                            description=desc[:400],
                            url=entry.get("link", ""),
                            source=source_name,
                            published=entry.get("published", datetime.utcnow().isoformat()),
                        ))
                        count += 1
            except Exception:
                continue  # silently skip failing feeds
    return articles
