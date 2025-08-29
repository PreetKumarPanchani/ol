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

# Set expire_on_commit=False to fix DetachedInstanceError
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)
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
            
        # Check and add missing columns
        #check_and_fix_schema()
            
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



def check_and_fix_schema():
    """Check and fix database schema if columns are missing"""
    try:
        with engine.connect() as conn:
            # Check if total_chunks column exists in documents table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'documents' AND column_name = 'total_chunks'
            """))
            
            if not result.fetchone():
                logger.info("Adding missing 'total_chunks' column to documents table")
                conn.execute(text("""
                    ALTER TABLE documents 
                    ADD COLUMN total_chunks INTEGER
                """))
                conn.commit()
                logger.info("✅ Added total_chunks column")
            
            # Check if doc_metadata column exists in documents table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'documents' AND column_name = 'doc_metadata'
            """))
            
            if not result.fetchone():
                logger.info("Adding missing 'doc_metadata' column to documents table")
                conn.execute(text("""
                    ALTER TABLE documents 
                    ADD COLUMN doc_metadata JSONB
                """))
                conn.commit()
                logger.info("✅ Added doc_metadata column")
            
            # Check if s3_url column exists in documents table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'documents' AND column_name = 's3_url'
            """))
            
            if not result.fetchone():
                logger.info("Adding missing 's3_url' column to documents table")
                conn.execute(text("""
                    ALTER TABLE documents 
                    ADD COLUMN s3_url VARCHAR
                """))
                conn.commit()
                logger.info("✅ Added s3_url column")
            
            # Check if doc_metadata column exists in document_chunks table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'document_chunks' AND column_name = 'doc_metadata'
            """))
            
            if not result.fetchone():
                logger.info("Adding missing 'doc_metadata' column to document_chunks table")
                conn.execute(text("""
                    ALTER TABLE document_chunks 
                    ADD COLUMN doc_metadata JSONB
                """))
                conn.commit()
                logger.info("✅ Added doc_metadata column to document_chunks")
            
            # Check if hash column exists in document_chunks table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'document_chunks' AND column_name = 'hash'
            """))
            
            if not result.fetchone():
                logger.info("Adding missing 'hash' column to document_chunks table")
                conn.execute(text("""
                    ALTER TABLE document_chunks 
                    ADD COLUMN hash VARCHAR
                """))
                conn.commit()
                logger.info("✅ Added hash column to document_chunks")
            
            # Check if created_at column exists in document_chunks table
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'document_chunks' AND column_name = 'created_at'
            """))
            
            if not result.fetchone():
                logger.info("Adding missing 'created_at' column to document_chunks table")
                conn.execute(text("""
                    ALTER TABLE document_chunks 
                    ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                """))
                conn.commit()
                logger.info("✅ Added created_at column to document_chunks")
                
    except Exception as e:
        logger.error(f"Schema check/fix failed: {e}")
        # Don't raise - this is not critical for app startup
        
# Initialize database on import
init_database()