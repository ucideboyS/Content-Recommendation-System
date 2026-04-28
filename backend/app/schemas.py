from pydantic import BaseModel
from datetime import datetime

class HistoryResponse(BaseModel):
    movie_id: int
    timestamp: datetime

    class Config:
        orm_mode = True
