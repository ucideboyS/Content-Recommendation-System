"""Verification: language-matched recommendations."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from app.ml_model_v2.hybrid_recommender import recommend_by_title

print("=== TEST 1: 3 Idiots (Hindi) ===")
result = recommend_by_title("3 Idiots", top_n=10)
print("Strategy:", result["strategy"])
print("Selected:", result["selected_title"])
print("Results:", len(result["recommendations"]))
for i, r in enumerate(result["recommendations"], 1):
    print("  %d. %s (sim=%.4f)" % (i, r["title"], r["similarity"]))

print()
print("=== TEST 2: Inception (English) ===")
result2 = recommend_by_title("Inception", top_n=10)
print("Strategy:", result2["strategy"])
print("Selected:", result2["selected_title"])
print("Results:", len(result2["recommendations"]))
for i, r in enumerate(result2["recommendations"], 1):
    print("  %d. %s (sim=%.4f)" % (i, r["title"], r["similarity"]))
