from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys

# Add app directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import the Base object from your app
from app.database import Base
from app.models import User, Movie, History  # Import models so Alembic detects them
from app.config import DATABASE_URL

# Alembic Config object
config = context.config

# Load .ini file logging settings
if config.config_file_name:
    fileConfig(config.config_file_name)

# Set SQLAlchemy URL dynamically
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Target metadata for schema generation
target_metadata = Base.metadata

def run_migrations_offline():
    """Run migrations in 'offline' mode."""
    context.configure(url=DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
