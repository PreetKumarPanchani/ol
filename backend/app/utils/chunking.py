from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy import or_, and_
from ..models.database import DocumentChunk, CaseSearch, SessionLocal
from ..services.embeddings import EmbeddingService
from ..services.caselaw import CaseLawService
from ..services.legislation import LegislationService
from ..config import settings
import logging

logger = logging.getLogger(__name__)

class SearchService:
    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.caselaw_service = CaseLawService()
        self.legislation_service = LegislationService()
    
    def unified_search(
        self,
        query: str,
        search_types: List[str] = ['documents', 'cases', 'legislation'],
        limit_per_type: int = 5
    ) -> Dict[str, Any]:
        """Perform unified search across all sources"""
        results = {
            'query': query,
            'timestamp': datetime.utcnow().isoformat(),
            'results': {}
        }
        
        # Search uploaded documents
        if 'documents' in search_types:
            try:
                doc_results = self.search_documents(
                    query=query,
                    limit=limit_per_type,
                    threshold=0.7
                )
                results['results']['documents'] = doc_results
            except Exception as e:
                logger.error(f"Document search error: {e}")
                results['results']['documents'] = []
        
        # Search case law
        if 'cases' in search_types:
            try:
                case_results = self.search_cases_with_cache(
                    query=query,
                    limit=limit_per_type
                )
                results['results']['cases'] = case_results
            except Exception as e:
                logger.error(f"Case search error: {e}")
                results['results']['cases'] = []
        
        # Search legislation
        if 'legislation' in search_types:
            try:
                leg_results = self.legislation_service.search_legislation(
                    query=query,
                    max_results=limit_per_type
                )
                results['results']['legislation'] = leg_results
            except Exception as e:
                logger.error(f"Legislation search error: {e}")
                results['results']['legislation'] = []
        
        # Calculate relevance scores and rank
        results['ranked_results'] = self._rank_unified_results(
            results['results'],
            query
        )
        
        return results
    
    def search_documents(
        self,
        query: str,
        limit: int = 10,
        threshold: float = 0.7,
        document_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """Search uploaded documents using semantic search"""
        return self.embedding_service.semantic_search(
            query=query,
            limit=limit,
            threshold=threshold
        )
    
    def search_cases_with_cache(
        self,
        query: str,
        limit: int = 10,
        use_cache: bool = True,
        cache_duration_hours: int = 24
    ) -> List[Dict]:
        """Search case law with caching"""
        db = SessionLocal()
        try:
            # Check cache if enabled
            if use_cache:
                cutoff_time = datetime.utcnow() - timedelta(hours=cache_duration_hours)
                cached = db.query(CaseSearch).filter(
                    CaseSearch.query == query,
                    CaseSearch.timestamp >= cutoff_time
                ).first()
                
                if cached and cached.results:
                    logger.info(f"Using cached results for query: {query}")
                    return cached.results[:limit]
            
            # Perform new search
            logger.info(f"Performing new case search for: {query}")
            cases = self.caselaw_service.search_cases(query, max_results=limit)
            
            # Save to cache
            cache_entry = CaseSearch(
                query=query,
                results=cases,
                timestamp=datetime.utcnow()
            )
            db.add(cache_entry)
            db.commit()
            
            return cases
            
        except Exception as e:
            logger.error(f"Case search error: {e}")
            return []
        finally:
            db.close()
    
    def _rank_unified_results(
        self,
        results_by_type: Dict[str, List],
        query: str
    ) -> List[Dict]:
        """Rank and merge results from different sources"""
        ranked = []
        
        # Score each result
        for result_type, results in results_by_type.items():
            for result in results:
                score = 0.0
                
                # Base score from similarity (if available)
                if 'similarity' in result:
                    score = result['similarity']
                
                # Boost recent results
                if 'date' in result:
                    try:
                        date = datetime.fromisoformat(result['date'].replace('Z', '+00:00'))
                        days_old = (datetime.utcnow() - date).days
                        recency_boost = max(0, 1 - (days_old / 365))
                        score += recency_boost * 0.2
                    except:
                        pass
                
                # Boost by source type preference
                type_weights = {
                    'cases': 1.2,  # Prefer case law
                    'legislation': 1.1,
                    'documents': 1.0
                }
                score *= type_weights.get(result_type, 1.0)
                
                # Add to ranked list
                ranked.append({
                    'type': result_type,
                    'score': score,
                    'data': result
                })
        
        # Sort by score
        ranked.sort(key=lambda x: x['score'], reverse=True)
        
        return ranked