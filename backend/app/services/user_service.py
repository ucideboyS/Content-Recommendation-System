from sqlalchemy.orm import Session
from app.models import User
from app.auth import hash_password

def create_user(db: Session, username: str, password: str):
    hashed_password = hash_password(password)
    user = User(username=username, password=hashed_password)
    db.add(user)
    db.commit()
    return user

def get_user(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()
