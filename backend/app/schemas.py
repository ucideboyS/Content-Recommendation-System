from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class HistoryResponse(BaseModel):
    movie_id: int
    timestamp: datetime

    class Config:
        orm_mode = True

class PreferencesUpdate(BaseModel):
    preferred_language: Optional[str] = None
    preferred_content_type: Optional[str] = None
    preferred_regional_languages: Optional[List[str]] = None
    preferred_movie_genres: Optional[List[str]] = None
    preferred_series_genres: Optional[List[str]] = None
    preferred_release_era: Optional[str] = None
    favorite_genres: Optional[List[str]] = None
    favorite_actors: Optional[List[str]] = None
    favorite_directors: Optional[List[str]] = None
