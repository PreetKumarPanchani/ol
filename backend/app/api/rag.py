"""
RAG API endpoints for stateless RAG pipeline
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import logging
from datetime import datetime, timedelta

# Import the stateless RAG pipeline
from ..services.stateless_rag import (
    StatelessRAGPipeline, 
    EmbeddingModel,
    RAGSession
)

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/rag", tags=["RAG"])

# Session cleanup scheduler
session_timeout_minutes = 30
active_sessions: Dict[str, datetime] = {}


class RAGConfig(BaseModel):
    """Configuration for RAG pipeline"""
    embedding_model: str = Field(
        default="minilm",
        description="Choose: openai_small, openai_large, minilm, mpnet, bge_large"
    )
    llm_model: str = Field(default="gpt-4o-mini")
    chunk_size: int = Field(default=1000)
    chunk_overlap: int = Field(default=200)
    k_retrieval: int = Field(default=5, description="Number of chunks to retrieve")


class RAGQueryRequest(BaseModel):
    """Request for RAG query with citations"""
    query: str
    session_id: Optional[str] = None
    search_types: List[str] = Field(
        default=["cases", "legislation"],
        description="Types to search: cases, legislation, documents"
    )
    embedding_model: str = Field(
        default="openai_small",
        description="Choose: openai_small, openai_large, minilm, mpnet, bge_large"
    )
    k_retrieval: int = Field(default=5)
    auto_cleanup: bool = Field(
        default=True,
        description="Automatically cleanup session after response"
    )


class RAGResponse(BaseModel):
    """Response from RAG pipeline"""
    session_id: str
    response: str
    citations: List[Dict[str, Any]]
    sources_count: int
    embedding_model_used: str
    processing_time: float


class SessionInfo(BaseModel):
    """Information about active session"""
    session_id: str
    created_at: datetime
    documents_count: int
    has_vector_store: bool


# Dependency to get the RAG pipeline
def get_rag_pipeline() -> StatelessRAGPipeline:
    """Get the global RAG pipeline instance"""
    from ..main import rag_pipeline
    if not rag_pipeline:
        raise HTTPException(status_code=500, detail="RAG pipeline not initialized")
    return rag_pipeline


@router.post("/query", response_model=RAGResponse)
async def query_with_rag(
    request: RAGQueryRequest,
    background_tasks: BackgroundTasks,
    rag_pipeline: StatelessRAGPipeline = Depends(get_rag_pipeline)
):
    """
    Perform stateless RAG query with proper citations
    Everything is processed in memory and optionally cleaned up
    """
    start_time = datetime.utcnow()
    
    try:
        # Map embedding model string to enum
        embedding_map = {
            "openai_small": EmbeddingModel.OPENAI_SMALL,
            "openai_large": EmbeddingModel.OPENAI_LARGE,
            "minilm": EmbeddingModel.MINILM,
            "mpnet": EmbeddingModel.MPNET,
            "bge_large": EmbeddingModel.BGE_LARGE
        }
        
        selected_embedding = embedding_map.get(
            request.embedding_model, 
            EmbeddingModel.MINILM
        )
        
        # Update pipeline embedding model if different
        if rag_pipeline.embedding_model != selected_embedding:
            logger.info(f"Switching embedding model to {selected_embedding.value}")
            rag_pipeline.embedding_model = selected_embedding
            rag_pipeline.embeddings = rag_pipeline._initialize_embeddings()
        
        # Generate session ID if not provided
        session_id = request.session_id or str(uuid.uuid4())
        
        # Check if session exists
        if session_id not in rag_pipeline.active_sessions:
            # Create new session
            logger.info(f"Creating new RAG session: {session_id}")
            rag_pipeline.create_session(session_id)
            active_sessions[session_id] = datetime.utcnow()
        
        # Fetch and process data from APIs
        logger.info(f"Fetching data for query: {request.query[:50]}...")
        documents = rag_pipeline.fetch_and_process_api_data(
            session_id=session_id,
            query=request.query,
            search_types=request.search_types
        )
        
        # Build vector store in memory
        total_docs = sum(len(docs) for docs in documents.values())
        logger.info(f"Building vector store with {total_docs} documents")
        
        vector_store = rag_pipeline.build_vector_store(session_id, documents)
        
        if not vector_store:
            return RAGResponse(
                session_id=session_id,
                response="No relevant data found for your query. Please try a different search.",
                citations=[],
                sources_count=0,
                embedding_model_used=selected_embedding.value,
                processing_time=(datetime.utcnow() - start_time).total_seconds()
            )
        
        # Query with citations
        logger.info(f"Querying vector store with k={request.k_retrieval}")
        result = rag_pipeline.query_with_citations(
            session_id=session_id,
            query=request.query,
            k=request.k_retrieval
        )
        
        # Schedule cleanup if requested
        if request.auto_cleanup:
            background_tasks.add_task(
                cleanup_session_delayed,
                session_id,
                rag_pipeline,
                delay_seconds=5  # Cleanup after 5 seconds
            )
            logger.info(f"Scheduled cleanup for session {session_id}")
        
        processing_time = (datetime.utcnow() - start_time).total_seconds()
        
        return RAGResponse(
            session_id=session_id,
            response=result['response'],
            citations=result['citations'],
            sources_count=len(result.get('sources', [])),
            embedding_model_used=selected_embedding.value,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"RAG query error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/create")
async def create_rag_session(
    rag_pipeline: StatelessRAGPipeline = Depends(get_rag_pipeline)
) -> Dict[str, str]:
    """
    Create a new RAG session for manual management
    Useful when you want to keep data in memory for multiple queries
    """
    session_id = str(uuid.uuid4())
    session = rag_pipeline.create_session(session_id)
    active_sessions[session_id] = datetime.utcnow()
    
    return {
        "session_id": session_id,
        "status": "created",
        "message": "Session created. Data will be kept in memory until cleanup."
    }


@router.delete("/session/{session_id}")
async def cleanup_rag_session(
    session_id: str, 
    rag_pipeline: StatelessRAGPipeline = Depends(get_rag_pipeline)
) -> Dict[str, str]:
    """
    Manually cleanup a RAG session
    Removes all data from memory
    """
    if session_id not in rag_pipeline.active_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    
    rag_pipeline.cleanup_session(session_id)
    active_sessions.pop(session_id, None)
    
    return {
        "session_id": session_id,
        "status": "cleaned",
        "message": "Session cleaned up. All data removed from memory."
    }


@router.get("/sessions", response_model=List[SessionInfo])
async def list_active_sessions(
    rag_pipeline: StatelessRAGPipeline = Depends(get_rag_pipeline)
):
    """List all active RAG sessions"""
    sessions = []
    for session_id, session in rag_pipeline.active_sessions.items():
        sessions.append(SessionInfo(
            session_id=session_id,
            created_at=session.created_at,
            documents_count=len(session.sources),
            has_vector_store=session.vector_store is not None
        ))
    
    return sessions


@router.post("/cleanup/expired")
async def cleanup_expired_sessions(
    rag_pipeline: StatelessRAGPipeline = Depends(get_rag_pipeline)
):
    """
    Cleanup sessions older than timeout period
    This can be called periodically to free memory
    """
    current_time = datetime.utcnow()
    expired_sessions = []
    
    for session_id, created_at in list(active_sessions.items()):
        if (current_time - created_at).total_seconds() > (session_timeout_minutes * 60):
            rag_pipeline.cleanup_session(session_id)
            active_sessions.pop(session_id, None)
            expired_sessions.append(session_id)
            logger.info(f"Cleaned up expired session: {session_id}")
    
    return {
        "cleaned_sessions": expired_sessions,
        "count": len(expired_sessions),
        "remaining_sessions": len(active_sessions)
    }


@router.get("/config")
async def get_rag_config(
    rag_pipeline: StatelessRAGPipeline = Depends(get_rag_pipeline)
):
    """Get current RAG pipeline configuration"""
    return {
        "embedding_model": rag_pipeline.embedding_model.value,
        "llm_model": rag_pipeline.llm_model,
        "chunk_size": rag_pipeline.chunk_size,
        "chunk_overlap": rag_pipeline.chunk_overlap,
        "active_sessions": len(rag_pipeline.active_sessions),
        "available_embeddings": [
            {
                "name": "OpenAI Small (Fast)",
                "value": "openai_small",
                "description": "OpenAI text-embedding-3-small - Fast and efficient"
            },
            {
                "name": "OpenAI Large (Accurate)",
                "value": "openai_large",
                "description": "OpenAI text-embedding-3-large - Most accurate"
            },
            {
                "name": "MiniLM (Local)",
                "value": "minilm",
                "description": "all-MiniLM-L6-v2 - Fast local model"
            },
            {
                "name": "MPNet (Balanced)",
                "value": "mpnet",
                "description": "all-mpnet-base-v2 - Balanced performance"
            },
            {
                "name": "BGE Large (Best Local)",
                "value": "bge_large",
                "description": "BAAI/bge-large-en-v1.5 - Best local model"
            }
        ]
    }


async def cleanup_session_delayed(
    session_id: str, 
    rag_pipeline: StatelessRAGPipeline, 
    delay_seconds: int = 5
):
    """
    Cleanup session after a delay
    Used for background cleanup after sending response
    """
    import asyncio
    await asyncio.sleep(delay_seconds)
    
    if rag_pipeline and session_id in rag_pipeline.active_sessions:
        rag_pipeline.cleanup_session(session_id)
        active_sessions.pop(session_id, None)
        logger.info(f"Session {session_id} cleaned up after delay")