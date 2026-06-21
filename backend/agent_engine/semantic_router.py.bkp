import os
import math
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from agent_engine.registry import COMPONENT_REGISTRY

# Initialize the embedding model
embeddings_model = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2")

_component_keys = list(COMPONENT_REGISTRY.keys())
_component_descriptions = [COMPONENT_REGISTRY[k]["description"] for k in _component_keys]
_precomputed_embeddings = None

def get_precomputed_embeddings():
    global _precomputed_embeddings
    if _precomputed_embeddings is None:
        print("[SEMANTIC_ROUTER] Precomputing embeddings for 50+ components...")
        _precomputed_embeddings = embeddings_model.embed_documents(_component_descriptions)
        print("[SEMANTIC_ROUTER] Precomputation complete.")
    return _precomputed_embeddings

def cosine_similarity(a, b):
    dot_product = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot_product / (mag_a * mag_b)

def route_query(query: str, threshold: float = 0.70) -> list[str]:
    """
    Takes a natural language query, embeds it, calculates cosine similarity against all 50+ 
    component descriptions, and returns an array of matched component keys using the Hybrid Safeguard.
    """
    print(f"[SEMANTIC_ROUTER] Routing query: '{query}'")
    query_embedding = embeddings_model.embed_query(query)
    doc_embeddings = get_precomputed_embeddings()
    
    scores = [cosine_similarity(query_embedding, doc_emb) for doc_emb in doc_embeddings]
    
    scored_keys = list(zip(_component_keys, scores))
    scored_keys.sort(key=lambda x: x[1], reverse=True)
    
    # Hybrid Safeguard Approach
    matched = [k for k, score in scored_keys if score >= threshold]
    print(f"[SEMANTIC_ROUTER] Found {len(matched)} matches above threshold {threshold}")
    
    if len(matched) < 1:
        print(f"[SEMANTIC_ROUTER] Fallback triggered. Selecting absolute highest match.")
        matched = [scored_keys[0][0]]
    elif len(matched) > 5:
        print(f"[SEMANTIC_ROUTER] Hard cap triggered. Truncating {len(matched)} matches down to 5.")
        matched = matched[:5]
        
    print(f"[SEMANTIC_ROUTER] Final Selected Components: {matched}")
    return matched
