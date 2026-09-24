from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, ARRAY, UniqueConstraint, func, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=True)
    auth_provider = Column(String, default="local", nullable=False)
    google_id = Column(String, unique=True, index=True, nullable=True)
    favorite_genres = Column(ARRAY(String), nullable=True)  # Store genres as an array
    favorite_actors = Column(ARRAY(String), nullable=True)
    favorite_directors = Column(ARRAY(String), nullable=True)
    preferred_language = Column(String, nullable=True)
    preferred_content_type = Column(String, nullable=True)
    preferred_regional_languages = Column(ARRAY(String), nullable=True)
    preferred_movie_genres = Column(ARRAY(String), nullable=True)
    preferred_series_genres = Column(ARRAY(String), nullable=True)
    preferred_release_era = Column(String, nullable=True)

    # Authentication Enhancements
    two_factor_enabled = Column(Boolean, default=False, nullable=False)
    totp_secret = Column(String, nullable=True)  # Will store symmetrically encrypted secret

    # Profile Enhancements
    profile_picture_url = Column(String, nullable=True)
    google_profile_picture_url = Column(String, nullable=True)

    # Relationships
    history = relationship("History", back_populates="user", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="user", cascade="all, delete")
    wishlists = relationship("Wishlist", back_populates="user", cascade="all, delete-orphan")
    recovery_codes = relationship("RecoveryCode", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")
    oauth_exchange_codes = relationship("OAuthExchangeCode", back_populates="user", cascade="all, delete-orphan")
    reminders = relationship("Reminder", back_populates="user", cascade="all, delete-orphan")

class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    tmdb_id = Column(Integer, unique=True, nullable=False)
    title = Column(String, index=True, nullable=False)
    overview = Column(String, nullable=True)

    # New fields for ML features + TV series support
    media_type = Column(String, default="movie", index=True)   # "movie" or "tv"
    genres = Column(ARRAY(String), nullable=True)
    cast_names = Column(ARRAY(String), nullable=True)
    director = Column(String, nullable=True)
    popularity = Column(Float, nullable=True)
    keywords = Column(ARRAY(String), nullable=True)
    poster_path = Column(String, nullable=True)
    vote_average = Column(Float, nullable=True)
    release_date = Column(String, nullable=True)

    # Relationships
    history = relationship("History", back_populates="movie", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="movie", cascade="all, delete")


class Rating(Base):
    __tablename__ = "ratings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tmdb_id = Column(Integer, ForeignKey("movies.tmdb_id", ondelete="CASCADE"), nullable=False)
    rating = Column(Float, nullable=False)  # Rating value (e.g., 1.0 - 5.0)

    # Enforce that a user can only rate a movie once
    __table_args__ = (UniqueConstraint("user_id", "tmdb_id", name="unique_user_movie_rating"),)

    # Relationships
    user = relationship("User", back_populates="ratings")
    movie = relationship("Movie", back_populates="ratings")


class History(Base):
    __tablename__ = "history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    movie_id = Column(Integer, ForeignKey("movies.id", ondelete="CASCADE"), nullable=True)
    title = Column(String, nullable=False)  # Ensure title is not NULL
    timestamp = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="history")
    movie = relationship("Movie", back_populates="history", lazy="joined")


class Wishlist(Base):
    __tablename__ = "wishlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tmdb_id = Column(Integer, nullable=False)
    media_type = Column(String, default="movie")  # "movie" or "tv"
    added_at = Column(DateTime, default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "tmdb_id", "media_type", name="unique_user_wishlist_item"),
    )

    user = relationship("User", back_populates="wishlists")


class RecoveryCode(Base):
    __tablename__ = "recovery_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    code_hash = Column(String, nullable=False)
    used = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="recovery_codes")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User", back_populates="password_reset_tokens")


class OAuthExchangeCode(Base):
    __tablename__ = "oauth_exchange_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User", back_populates="oauth_exchange_codes")


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tmdb_id = Column(Integer, nullable=False)
    media_type = Column(String, default="movie")
    created_at = Column(DateTime, default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "tmdb_id", "media_type", name="unique_user_reminder_item"),
    )

    user = relationship("User", back_populates="reminders")
