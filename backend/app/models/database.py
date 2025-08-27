from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, JSON, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
import uuid
from datetime import datetime
from ..config import settings
import logging

logger = logging.getLogger(__name__)

# Create engine with AWS PostgreSQL configuration
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={
        "sslmode": "require",  # AWS RDS requires SSL
        "connect_timeout": 10,
        "application_name": "legal_agent"
    }
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    content_type = Column(String)
    upload_date = Column(DateTime, default=datetime.utcnow)
    total_chunks = Column(Integer)
    doc_metadata = Column(JSON)  # Changed from 'metadata' to 'doc_metadata'
    s3_url = Column(String)

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, nullable=False)
    chunk_index = Column(Integer)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536))
    doc_metadata = Column(JSON)  # Changed from 'metadata' to 'doc_metadata'
    page_number = Column(Integer)
    char_start = Column(Integer)
    char_end = Column(Integer)
    hash = Column(String, index=True)  # For deduplication
    created_at = Column(DateTime, default=datetime.utcnow)

class CaseSearch(Base):
    __tablename__ = "case_searches"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    query = Column(Text)
    results = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    role = Column(String)  # 'user' or 'assistant'
    content = Column(Text)
    sources = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)

def init_database():
    """Initialize database tables and pgvector extension"""
    try:
        # Create all tables
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
        
        # Enable pgvector extension if not already enabled
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            logger.info("pgvector extension enabled")
            
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize database on import
init_database()