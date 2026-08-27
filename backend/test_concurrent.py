import requests, threading

def test():
    res = requests.post('http://localhost:8000/api/users/login', json={'username': 'testuser_auth', 'password': 'password123'})
    token = res.json()['access_token']

    # Use a new movie ID that is DEFINITELY not in the DB to trigger the insert
    def make_req():
        resp = requests.post(
            'http://localhost:8000/api/users/history',
            json={'tmdb_movie_id': 1187044}, # 12th fail is 1187043, maybe 1187044 exists
            headers={'Authorization': f'Bearer {token}'}
        )
        print(f"Status: {resp.status_code}, Body: {resp.text}")

    threads = [threading.Thread(target=make_req) for _ in range(3)]
    for t in threads: t.start()
    for t in threads: t.join()

if __name__ == "__main__":
    test()
