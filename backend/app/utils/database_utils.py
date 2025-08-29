import psycopg2
import logging
from typing import Optional, Dict, Any
from ..config import settings

logger = logging.getLogger(__name__)

def test_aws_connection() -> Dict[str, Any]:
    """Test AWS PostgreSQL connection and return status"""
    try:
        # Test direct connection to AWS PostgreSQL using DATABASE_URL
        conn = psycopg2.connect(settings.DATABASE_URL)
        
        # Test basic query
        with conn.cursor() as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()[0]
            
        conn.close()
        
        return {
            "status": "connected",
            "version": version,
            "database_url": settings.DATABASE_URL.replace(settings.PG_PASSWORD_AWS, "***")
        }
        
    except Exception as e:
        logger.error(f"AWS PostgreSQL connection test failed: {e}")
        return {
            "status": "failed",
            "error": str(e),
            "database_url": settings.DATABASE_URL.replace(settings.PG_PASSWORD_AWS, "***")
        }

def get_connection_info() -> Dict[str, Any]:
    """Get connection information for debugging"""
    return {
        "database_url": settings.DATABASE_URL.replace(settings.PG_PASSWORD_AWS, "***"),
        "ssl_mode": settings.PG_SSLMODE_AWS
    }

def check_pgvector_extension() -> bool:
    """Check if pgvector extension is available"""
    try:
        conn = psycopg2.connect(settings.DATABASE_URL)
        
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM pg_extension WHERE extname = 'vector';")
            result = cur.fetchone()
            
        conn.close()
        return result is not None
        
    except Exception as e:
        logger.error(f"Failed to check pgvector extension: {e}")
        return False

