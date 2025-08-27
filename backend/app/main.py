from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uuid
import os
from .config import settings
from .services.document_processor import DocumentProcessor
from .services.embeddings import EmbeddingService
from .services.chat import ChatService
from .models.schemas import ChatRequest, ChatResponse, SearchRequest, DocumentResponse

app = FastAPI(title="Legal Research API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
doc_processor = DocumentProcessor()
embedding_service = EmbeddingService()
chat_service = ChatService()

@app.post("/api/upload", response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload and process legal document"""
    
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Save uploaded file
    file_path = f"/tmp/{uuid.uuid4()}_{file.filename}"
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    try:
        # Process document
        document = doc_processor.process_document(file_path, file.filename)
        
        # Generate embeddings asynchronously
        embedding_service.update_chunk_embeddings(document.id)
        
        # Generate summary
        summary = chat_service.generate_summary(document.id)
        
        return DocumentResponse(
            document_id=document.id,
            filename=document.filename,
            total_chunks=document.total_chunks,
            summary=summary,
            metadata=document.doc_metadata
        )
    
    finally:
        # Clean up temp file
        os.remove(file_path)

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with legal research assistant"""
    
    # Create session if not provided
    session_id = request.session_id or str(uuid.uuid4())
    
    # Generate response
    result = chat_service.generate_response(
        query=request.message,
        session_id=session_id,
        search_documents=request.search_documents
    )
    
    return ChatResponse(
        response=result['response'],
        sources=result['sources'],
        session_id=result['session_id']
    )

@app.post("/api/search/cases")
async def search_cases(request: SearchRequest):
    """Search for relevant case law"""
    from .services.caselaw import CaseLawService
    
    caselaw_service = CaseLawService()
    cases = caselaw_service.search_cases(request.query, max_results=request.limit or 10)
    
    return {
        "query": request.query,
        "results": cases,
        "total": len(cases)
    }

@app.post("/api/search/documents")
async def search_documents(request: SearchRequest):
    """Search uploaded documents"""
    
    results = embedding_service.semantic_search(
        query=request.query,
        limit=request.limit or 10,
        threshold=request.threshold or 0.7
    )
    
    # Rerank results
    results = embedding_service.rerank_results(request.query, results)
    
    return {
        "query": request.query,
        "results": results,
        "total": len(results)
    }

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
