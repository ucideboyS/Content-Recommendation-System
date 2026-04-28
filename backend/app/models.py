from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, ARRAY, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    favorite_genres = Column(ARRAY(String), nullable=True)  # Store genres as an array
    favorite_actors = Column(ARRAY(String), nullable=True)
    favorite_directors = Column(ARRAY(String), nullable=True)

    # Relationships
    history = relationship("History", back_populates="user", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="user", cascade="all, delete")  # ✅ Added missing relationship


class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    tmdb_id = Column(Integer, unique=True, nullable=False)  # ✅ Added missing tmdb_id column
    title = Column(String, index=True, nullable=False)
    overview = Column(String, nullable=True)

    # Relationships
    history = relationship("History", back_populates="movie", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="movie", cascade="all, delete")  # ✅ Added missing relationship


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
    movie_id = Column(Integer, ForeignKey("movies.id", ondelete="CASCADE"), nullable=True)  # ✅ Fixed: ForeignKey linking to movies.id
    title = Column(String, nullable=False)  # Ensure title is not NULL
    timestamp = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="history")
    movie = relationship("Movie", back_populates="history", lazy="joined")
