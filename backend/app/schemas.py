from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List

class OAuthExchangeRequest(BaseModel):
    code: str


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

class ProfileUpdate(BaseModel):
    username: str
    # other fields optional since we only explicitly need username update in this flow,
    # but we can include them if needed. Currently, the UI just sends username when editing username.
    # The existing PUT /profile expects UserCreate, which requires email, password, etc.
    # We will use this new schema for a dedicated PATCH or update the PUT to accept this.

# --- Auth Enhancement Schemas ---

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class Verify2FASetupRequest(BaseModel):
    code: str

class Verify2FALoginRequest(BaseModel):
    token: str  # The temporary 2FA token
    code: str
    is_recovery_code: Optional[bool] = False

class Disable2FARequest(BaseModel):
    password: str
    code: str
    is_recovery_code: Optional[bool] = False

class RegenerateRecoveryCodesRequest(BaseModel):
    password: str
    code: str
    is_recovery_code: Optional[bool] = False
