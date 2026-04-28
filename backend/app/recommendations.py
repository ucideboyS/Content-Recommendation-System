import pickle
import pandas as pd

# Load the ML model files
movie_dict = pickle.load(open("app/ml_model/movie_dict.pkl", "rb"))
simi = pickle.load(open("app/ml_model/simi.pkl", "rb"))

movies = pd.DataFrame(movie_dict)

def recommend(movie_name: str):
    if movie_name not in movies["title"].values:
        return []

    index = movies[movies["title"] == movie_name].index[0]
    distances = sorted(list(enumerate(simi[index])), reverse=True, key=lambda x: x[1])

    recommended_movies = []
    for i in distances[1:6]:  # Top 5 recommendations
        recommended_movies.append(movies.iloc[i[0]].title)

    return recommended_movies

# ✅ Cold Start Recommendation (Based on User Preferences)
def recommend_by_preferences(user):
    filtered_movies = movies

    if user.favorite_genres:
        filtered_movies = filtered_movies[filtered_movies["genres"].apply(lambda x: any(g in x for g in user.favorite_genres))]

    if user.favorite_actors:
        filtered_movies = filtered_movies[filtered_movies["actors"].apply(lambda x: any(a in x for a in user.favorite_actors))]

    if user.favorite_directors:
        filtered_movies = filtered_movies[filtered_movies["directors"].apply(lambda x: any(d in x for d in user.favorite_directors))]

    recommended_movies = filtered_movies.sample(n=5)["title"].tolist() if not filtered_movies.empty else []

    return recommended_movies
