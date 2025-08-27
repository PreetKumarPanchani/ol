from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    search_documents: bool = True

class Source(BaseModel):
    type: str
    id: Optional[str]
    document_id: Optional[str]
    page: Optional[int]
    relevance: Optional[float]
    excerpt: Optional[str]
    title: Optional[str]
    citation: Optional[str]
    court: Optional[str]
    date: Optional[str]
    url: Optional[str]

class ChatResponse(BaseModel):
    response: str
    sources: List[Source]
    session_id: str

class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 10
    threshold: Optional[float] = 0.7

class DocumentResponse(BaseModel):
    document_id: str
    filename: str
    total_chunks: int
    summary: str
    metadata: Dict[str, Any]