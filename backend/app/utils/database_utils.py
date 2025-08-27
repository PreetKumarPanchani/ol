import psycopg2
import logging
from typing import Optional, Dict, Any
from ..config import settings

logger = logging.getLogger(__name__)

def test_aws_connection() -> Dict[str, Any]:
    """Test AWS PostgreSQL connection and return status"""
    try:
        # Test direct connection to AWS PostgreSQL
        conn = psycopg2.connect(
            host=settings.PG_HOST_AWS,
            port=settings.PG_PORT_AWS,
            database=settings.PG_DATABASE_AWS,
            user=settings.PG_USER_AWS,
            password=settings.PG_PASSWORD_AWS,
            sslmode='require',
            connect_timeout=10
        )
        
        # Test basic query
        with conn.cursor() as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()[0]
            
        conn.close()
        
        return {
            "status": "connected",
            "version": version,
            "host": settings.PG_HOST_AWS,
            "database": settings.PG_DATABASE_AWS
        }
        
    except Exception as e:
        logger.error(f"AWS PostgreSQL connection test failed: {e}")
        return {
            "status": "failed",
            "error": str(e),
            "host": settings.PG_HOST_AWS,
            "database": settings.PG_DATABASE_AWS
        }

def get_connection_info() -> Dict[str, Any]:
    """Get connection information for debugging"""
    return {
        "host": settings.PG_HOST_AWS,
        "port": settings.PG_PORT_AWS,
        "database": settings.PG_DATABASE_AWS,
        "user": settings.PG_USER_AWS,
        "ssl_mode": "require"
    }

def check_pgvector_extension() -> bool:
    """Check if pgvector extension is available"""
    try:
        conn = psycopg2.connect(
            host=settings.PG_HOST_AWS,
            port=settings.PG_PORT_AWS,
            database=settings.PG_DATABASE_AWS,
            user=settings.PG_USER_AWS,
            password=settings.PG_PASSWORD_AWS,
            sslmode='require'
        )
        
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM pg_extension WHERE extname = 'vector';")
            result = cur.fetchone()
            
        conn.close()
        return result is not None
        
    except Exception as e:
        logger.error(f"Failed to check pgvector extension: {e}")
        return False

