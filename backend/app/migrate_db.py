"""
Database migration script — adds new columns and tables safely.
Can be run multiple times (idempotent).
"""

import os
import sys
import logging

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from app.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def column_exists(inspector, table_name: str, column_name: str) -> bool:
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def migrate():
    inspector = inspect(engine)

    with engine.begin() as conn:
        # ---------------------------------------------------------------
        # 1. Add new columns to 'movies' table
        # ---------------------------------------------------------------
        new_movie_columns = {
            "media_type": "VARCHAR DEFAULT 'movie'",
            "genres": "VARCHAR[]",
            "cast_names": "VARCHAR[]",
            "director": "VARCHAR",
            "popularity": "FLOAT",
            "keywords": "VARCHAR[]",
            "poster_path": "VARCHAR",
            "vote_average": "FLOAT",
            "release_date": "VARCHAR",
        }

        for col_name, col_type in new_movie_columns.items():
            if not column_exists(inspector, "movies", col_name):
                logger.info("Adding column movies.%s (%s)", col_name, col_type)
                conn.execute(text(f"ALTER TABLE movies ADD COLUMN {col_name} {col_type}"))
            else:
                logger.info("Column movies.%s already exists — skipping", col_name)

        # Create index on media_type if not exists
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_movies_media_type ON movies (media_type)
        """))

        # ---------------------------------------------------------------
        # 2. Create 'wishlists' table
        # ---------------------------------------------------------------
        if not table_exists(inspector, "wishlists"):
            logger.info("Creating 'wishlists' table")
            conn.execute(text("""
                CREATE TABLE wishlists (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    tmdb_id INTEGER NOT NULL,
                    media_type VARCHAR DEFAULT 'movie',
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_user_wishlist_item UNIQUE (user_id, tmdb_id, media_type)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wishlists_user ON wishlists (user_id)"))
        else:
            logger.info("Table 'wishlists' already exists — skipping")

    logger.info("✅ Migration complete!")


if __name__ == "__main__":
    migrate()
