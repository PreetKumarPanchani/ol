import openai
from typing import List, Dict, Any
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from ..models.database import DocumentChunk, SessionLocal
from ..config import settings

class EmbeddingService:
    def __init__(self):
        openai.api_key = settings.OPENAI_API_KEY
        self.model = settings.EMBEDDING_MODEL
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using OpenAI"""
        response = openai.embeddings.create(
            model=self.model,
            input=text
        )
        return response.data[0].embedding
    
    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        response = openai.embeddings.create(
            model=self.model,
            input=texts
        )
        return [item.embedding for item in response.data]
    
    def update_chunk_embeddings(self, document_id: str):
        """Generate and store embeddings for document chunks"""
        db = SessionLocal()
        
        try:
            chunks = db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id,
                DocumentChunk.embedding == None
            ).all()
            
            for chunk in chunks:
                embedding = self.generate_embedding(chunk.content)
                chunk.embedding = embedding
            
            db.commit()
            
        finally:
            db.close()
    
    def semantic_search(self, query: str, limit: int = 5, threshold: float = 0.7) -> List[Dict]:
        """Perform semantic search on document chunks"""
        db = SessionLocal()
        
        try:
            # Generate query embedding
            query_embedding = self.generate_embedding(query)
            
            # Get all chunks with embeddings
            chunks = db.query(DocumentChunk).filter(
                DocumentChunk.embedding != None
            ).all()
            
            results = []
            for chunk in chunks:
                # Calculate cosine similarity
                similarity = cosine_similarity(
                    [query_embedding],
                    [chunk.embedding]
                )[0][0]
                
                if similarity >= threshold:
                    results.append({
                        'chunk_id': chunk.id,
                        'document_id': chunk.document_id,
                        'content': chunk.content,
                        'page_number': chunk.page_number,
                        'similarity': float(similarity),
                        'doc_metadata': chunk.doc_metadata
                    })
            
            # Sort by similarity and return top results
            results.sort(key=lambda x: x['similarity'], reverse=True)
            return results[:limit]
            
        finally:
            db.close()
    
    def rerank_results(self, query: str, results: List[Dict]) -> List[Dict]:
        """Rerank search results using cross-encoder approach"""
        # Simple reranking based on keyword matches and legal citations
        query_lower = query.lower()
        query_terms = set(query_lower.split())
        
        for result in results:
            content_lower = result['content'].lower()
            
            # Boost score for exact phrase matches
            if query_lower in content_lower:
                result['similarity'] *= 1.5
            
            # Boost for legal citations
            if result.get('doc_metadata', {}).get('has_citation'):
                result['similarity'] *= 1.2
            
            # Boost for section references
            if result.get('doc_metadata', {}).get('has_section'):
                result['similarity'] *= 1.1
            
            # Calculate term frequency
            content_terms = set(content_lower.split())
            overlap = len(query_terms & content_terms) / len(query_terms)
            result['similarity'] *= (1 + overlap * 0.3)
        
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results