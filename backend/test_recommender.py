"""Quick manual test for the language-filtered SBERT recommender.
Run from the backend/ folder: python test_recommender.py
"""

from app.ml_model_v2.hybrid_recommender import recommend_by_title


def test(title: str):
    result = recommend_by_title(title, top_n=10)
    print(f"Selected: {result['selected_title']}")
    print(f"Strategy: {result['strategy']}")
    for r in result["recommendations"]:
        print(f"  {r['title']:<30} sim={r['similarity']}")
    print()


if __name__ == "__main__":
    test("3 Idiots")
    test("Inception")