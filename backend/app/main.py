from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uuid
import os
import logging
from contextlib import asynccontextmanager
from .config import settings
from .services.document_processor import DocumentProcessor
from .services.embeddings import EmbeddingService
from .api.chat import ChatService
from .models.schemas import ChatRequest, ChatResponse, SearchRequest, DocumentResponse

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
import openai
import base64
import io

# Import new RAG services
from .services.stateless_rag import StatelessRAGPipeline, EmbeddingModel
from .api.rag import router as rag_router

logger = logging.getLogger(__name__)

# Global RAG pipeline instance
rag_pipeline = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global rag_pipeline
    
    # Startup
    logger.info("Initializing services...")
    
    # Initialize RAG pipeline with your defaults
    rag_pipeline = StatelessRAGPipeline(
        embedding_model=EmbeddingModel.MINILM,  # Local model
        llm_model="gpt-4o-mini",  # Cheaper, faster GPT-4
        chunk_size=1000,
        chunk_overlap=200
    )
    logger.info("RAG pipeline initialized with MiniLM embeddings")
    
    yield
    
    # Cleanup on shutdown
    if rag_pipeline:
        for session_id in list(rag_pipeline.active_sessions.keys()):
            rag_pipeline.cleanup_session(session_id)
        logger.info("All RAG sessions cleaned up")

# Create app with lifespan
app = FastAPI(
    title="Legal Research API", 
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include RAG router
app.include_router(rag_router)

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
        # Process document and get the ID before session closes
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
            doc_metadata=document.doc_metadata  # Fixed: Use document.doc_metadata
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

@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    model: str = Form(default="whisper-1"),
    language: Optional[str] = Form(default=None)
):
    """Transcribe audio using OpenAI Whisper"""
    try:
        # Read the audio file
        audio_data = await file.read()
        
        # Create a file-like object
        audio_file = io.BytesIO(audio_data)
        audio_file.name = file.filename or "audio.webm"
        
        # Prepare transcription parameters
        transcription_params = {
            "model": model,
            "file": audio_file
        }
        
        if language:
            transcription_params["language"] = language
        
        # Call OpenAI Whisper API
        openai.api_key = settings.OPENAI_API_KEY
        response = openai.audio.transcriptions.create(**transcription_params)
        
        return JSONResponse(content={
            "text": response.text,
            "status": "success"
        })
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tts")
async def text_to_speech(request: dict):
    """Convert text to speech using OpenAI TTS"""
    try:
        text = request.get("text", "")
        voice = request.get("voice", "nova")
        speed = request.get("speed", 1.0)
        model = request.get("model", "tts-1")
        
        if not text:
            raise HTTPException(status_code=400, detail="No text provided")
        
        # Call OpenAI TTS API
        openai.api_key = settings.OPENAI_API_KEY
        response = openai.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
            speed=speed
        )
        
        # Convert audio to base64
        audio_data = response.content
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        return JSONResponse(content={
            "audioData": audio_base64,
            "status": "success"
        })
        
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/voice/status")
async def voice_status():
    """Check voice services status"""
    try:
        # Check if OpenAI API key is configured
        has_openai = bool(settings.OPENAI_API_KEY)
        
        return {
            "whisper_available": has_openai,
            "tts_available": has_openai,
            "supported_voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
            "supported_languages": ["en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru", "zh", "ja", "ko"]
        }
    except Exception as e:
        logger.error(f"Voice status check error: {e}")
        return {
            "whisper_available": False,
            "tts_available": False,
            "error": str(e)
        }

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
