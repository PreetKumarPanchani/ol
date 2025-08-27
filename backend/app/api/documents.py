from typing import List, Optional, Dict, Any
from fastapi import HTTPException
from sqlalchemy.orm import Session
from ..models.database import Document, DocumentChunk, SessionLocal
from ..services.document_processor import DocumentProcessor
from ..services.embeddings import EmbeddingService
import logging

logger = logging.getLogger(__name__)

class DocumentService:
    def __init__(self):
        self.processor = DocumentProcessor()
        self.embedding_service = EmbeddingService()
    
    def get_all_documents(self, limit: int = 50) -> List[Document]:
        """Get all uploaded documents"""
        db = SessionLocal()
        try:
            documents = db.query(Document).order_by(
                Document.upload_date.desc()
            ).limit(limit).all()
            return documents
        finally:
            db.close()
    
    def get_document_by_id(self, document_id: str) -> Optional[Document]:
        """Get document by ID"""
        db = SessionLocal()
        try:
            document = db.query(Document).filter(
                Document.id == document_id
            ).first()
            return document
        finally:
            db.close()
    
    def delete_document(self, document_id: str) -> bool:
        """Delete document and all associated chunks"""
        db = SessionLocal()
        try:
            # Delete chunks first
            db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id
            ).delete()
            
            # Delete document
            result = db.query(Document).filter(
                Document.id == document_id
            ).delete()
            
            db.commit()
            return result > 0
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error deleting document {document_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            db.close()
    
    def get_document_chunks(
        self, 
        document_id: str, 
        page: Optional[int] = None,
        limit: int = 100
    ) -> List[DocumentChunk]:
        """Get chunks for a specific document"""
        db = SessionLocal()
        try:
            query = db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id
            )
            
            if page is not None:
                query = query.filter(DocumentChunk.page_number == page)
            
            chunks = query.order_by(
                DocumentChunk.chunk_index
            ).limit(limit).all()
            
            return chunks
            
        finally:
            db.close()
    
    def search_within_document(
        self,
        document_id: str,
        query: str,
        limit: int = 10
    ) -> List[Dict]:
        """Search within a specific document using embeddings"""
        db = SessionLocal()
        try:
            # Generate query embedding
            query_embedding = self.embedding_service.generate_embedding(query)
            
            # Get document chunks
            chunks = db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id,
                DocumentChunk.embedding != None
            ).all()
            
            if not chunks:
                return []
            
            # Calculate similarities
            from sklearn.metrics.pairwise import cosine_similarity
            results = []
            
            for chunk in chunks:
                similarity = cosine_similarity(
                    [query_embedding],
                    [chunk.embedding]
                )[0][0]
                
                results.append({
                    'chunk_id': chunk.id,
                    'content': chunk.content,
                    'page_number': chunk.page_number,
                    'similarity': float(similarity),
                    'char_start': chunk.char_start,
                    'char_end': chunk.char_end
                })
            
            # Sort by similarity
            results.sort(key=lambda x: x['similarity'], reverse=True)
            
            return results[:limit]
            
        finally:
            db.close()