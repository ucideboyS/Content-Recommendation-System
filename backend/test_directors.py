import requests

BASE = "http://localhost:8000"

test_movies = [
    ("Yeh Jawaani Hai Deewani (2013)", 181965),
    ("Tamasha (2015)", 314095),
    ("3 Idiots (2009)", 20453),
]

for name, tmdb_id in test_movies:
    print(f"\n{'='*70}")
    print(f"SEED: {name}  (TMDB ID: {tmdb_id})")
    print(f"{'='*70}")
    
    res = requests.get(f"{BASE}/api/recommend/by-id/{tmdb_id}")
    if res.status_code != 200:
        print(f"  ERROR: HTTP {res.status_code}")
        continue
    
    recs = res.json().get("recommendations", [])
    
    for i, r in enumerate(recs):
        year = (r.get("release_date") or "????")[:4]
        reasons = ", ".join(r.get("reasons", []))
        print(f"  #{i+1}  {r['title']} ({year})  score={r['final_score']:.4f}  reasons=[{reasons}]")
