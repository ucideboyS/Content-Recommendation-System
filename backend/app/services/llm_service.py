"""
LLM Service — wraps all AI interactions via GitHub Models (OpenAI-compatible).
Uses GPT-4o-mini through the GitHub Models inference endpoint.
"""

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client singleton — lazy-initialized so the app still boots without a token.
# ---------------------------------------------------------------------------
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client

    token = os.getenv("GITHUB_TOKEN")
    if not token:
        logger.warning("GITHUB_TOKEN not set — AI features will be disabled.")
        return None

    try:
        from openai import OpenAI
        _client = OpenAI(
            base_url="https://models.inference.ai.azure.com",
            api_key=token,
        )
        logger.info("LLM client initialised (GitHub Models / gpt-4o-mini)")
        return _client
    except Exception as e:
        logger.error(f"Failed to initialise LLM client: {e}")
        return None


MODEL = "gpt-4o-mini"

# ============================================================================
# PROMPTS
# ============================================================================

NL_SEARCH_SYSTEM_PROMPT = """You are a movie search query parser embedded inside a movie recommendation system. Your only job is to convert whatever the user types in natural language into a structured JSON filter object that the backend search engine can process. Users may type casually, use slang, reference feelings, mention actors or directors by nickname, or describe plots vaguely — your job is to extract intent from all of it.

Analyze the query for the following signals: specific keywords or themes mentioned, any genres implied or stated, the emotional tone or mood the user seems to want, the era or decade they are interested in, preferred runtime length, any movie or director they reference as a similarity anchor, anything they explicitly want to avoid, and how results should be sorted.

Always respond with ONLY a raw JSON object. No markdown formatting, no backticks, no explanation, no preamble. Just the JSON.

Return this exact structure:
{
  "keywords": [],
  "genres": [],
  "mood": null,
  "era": null,
  "runtime": null,
  "similar_to": null,
  "director": null,
  "actor": null,
  "avoid": [],
  "sort_by": "relevance"
}

Valid values — mood: happy, sad, tense, nostalgic, adventurous, romantic, thoughtful. Era: classic, 80s, 90s, 2000s, 2010s, recent. Runtime: short (under 90 min), medium (90 to 130 min), long (over 130 min). Sort by: relevance, rating, popularity, recent.

If a field cannot be determined from the query, set it to null or an empty array. Never guess wildly — only populate fields you are confident about from what the user wrote."""

MOOD_SYSTEM_PROMPT = """You are a mood-to-movie matching engine embedded inside a personalized movie recommendation system. You will receive a user's current mood and a list of candidate movies with their metadata. Your job is to rank those movies by how well they match the emotional experience that mood calls for — not just by genre, but by tone, pacing, narrative arc, and the feeling the viewer will likely leave with.

Understand each mood deeply before scoring. Happy means the user wants to feel uplifted, entertained, or joyful — comedies, feel-good dramas, and light adventures work. Sad or emotional means the user wants to feel something deeply — tearjerkers, heavy dramas, and bittersweet stories are right. Tense means the user wants to feel their heart race — psychological thrillers, suspense, and high-stakes narratives fit. Nostalgic means the user wants warmth and memory — classics, coming-of-age stories, and films from the 80s or 90s are ideal. Adventurous means the user wants scale and excitement — action, epic fantasy, and sci-fi journeys work. Romantic means the user wants connection and warmth — love stories and intimate character-driven films fit. Thoughtful means the user wants to sit with ideas — slow-burn, philosophical, or cerebral films are right.

Score each movie between 0.0 and 1.0 based on mood fit. Only return movies with a score above 0.5. Return the top 5.

Respond with ONLY a raw JSON array. No markdown, no explanation, no backticks:
[{"movie_id": 123, "fit_score": 0.91, "reason": "one sentence, max 12 words, explaining why this fits the mood"}]

The reason must be specific to that movie — never generic. Bad reason: "This is a feel-good film." Good reason: "Lighthearted road trip energy that leaves you smiling at the end." """

TRENDING_CONTEXT_PROMPT = """You are a one-line movie trend analyst inside a live movie recommendation platform. You will receive the title, genre, release year, and current trending rank of a movie. Your job is to write a single punchy sentence — maximum 12 words — that tells the user why this movie is worth watching right now or why it might be trending.

Do not use filler phrases like "This film", "It seems", "A movie that", or "This is". Start the sentence directly with something specific and vivid. Write like a smart friend recommending it, not like a press release. Focus on what makes it feel timely, rewatchable, or culturally relevant. If it is a classic that is trending, acknowledge that angle. If it is new, hint at the buzz.

Return only the sentence. No punctuation at the start, no quotation marks around it, no explanation. Just the single sentence."""

# ============================================================================
# PUBLIC API
# ============================================================================


def parse_natural_language_query(query: str) -> Optional[dict]:
    """Parse a natural-language movie search query into structured filters."""
    client = _get_client()
    if not client:
        return None

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": NL_SEARCH_SYSTEM_PROMPT},
                {"role": "user", "content": query},
            ],
            temperature=0.3,
            max_tokens=500,
        )

        raw = response.choices[0].message.content.strip()
        # Strip potential markdown wrapping
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            raw = raw.rsplit("```", 1)[0]
        parsed = json.loads(raw)
        logger.info(f"NL query parsed: {parsed}")
        return parsed

    except json.JSONDecodeError as e:
        logger.error(f"LLM returned invalid JSON for NL search: {e} — raw: {raw}")
        return None
    except Exception as e:
        logger.error(f"NL search LLM call failed: {e}")
        return None


def rank_movies_by_mood(mood: str, candidate_movies: list[dict]) -> Optional[list[dict]]:
    """Rank candidate movies by mood fit using LLM scoring."""
    client = _get_client()
    if not client:
        return None

    if not candidate_movies:
        return []

    # Build a compact representation for the LLM
    movies_text = json.dumps(
        [
            {
                "movie_id": m.get("id"),
                "title": m.get("title"),
                "overview": (m.get("overview") or "")[:200],
                "genres": m.get("genre_names", []),
                "release_date": m.get("release_date", ""),
                "vote_average": m.get("vote_average", 0),
            }
            for m in candidate_movies
        ],
        indent=None,
    )

    user_msg = f"Mood: {mood}\n\nCandidate movies:\n{movies_text}"

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": MOOD_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.5,
            max_tokens=800,
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            raw = raw.rsplit("```", 1)[0]
        parsed = json.loads(raw)

        if not isinstance(parsed, list):
            logger.error("Mood ranking did not return a list")
            return None

        logger.info(f"Mood ranking returned {len(parsed)} results")
        return parsed

    except json.JSONDecodeError as e:
        logger.error(f"LLM returned invalid JSON for mood ranking: {e}")
        return None
    except Exception as e:
        logger.error(f"Mood ranking LLM call failed: {e}")
        return None


def generate_trending_context(
    title: str,
    genres: list[str],
    year: int,
    rank: int,
) -> Optional[str]:
    """Generate a punchy one-liner explaining why a movie is trending."""
    client = _get_client()
    if not client:
        return None

    user_msg = (
        f"Title: {title}\n"
        f"Genres: {', '.join(genres) if genres else 'Unknown'}\n"
        f"Release Year: {year}\n"
        f"Current Trending Rank: #{rank}"
    )

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": TRENDING_CONTEXT_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.8,
            max_tokens=60,
        )

        line = response.choices[0].message.content.strip().strip('"').strip("'")
        logger.info(f"Trending context for '{title}': {line}")
        return line

    except Exception as e:
        logger.error(f"Trending context LLM call failed: {e}")
        return None
