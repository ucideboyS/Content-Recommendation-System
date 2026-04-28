from app.recommendations import recommend

def get_movie_recommendations(movie_name: str):
    return recommend(movie_name)
