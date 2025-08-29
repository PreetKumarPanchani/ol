from pydantic_settings import BaseSettings
from typing import Optional
import os 


class Settings(BaseSettings):
    # AWS PostgreSQL Database
    PG_HOST_AWS: str
    PG_PORT_AWS: int = 5432
    PG_DATABASE_AWS: str
    PG_USER_AWS: str
    PG_PASSWORD_AWS: str
    PG_SSLMODE_AWS: str = "require"

    # RAG Settings
    RAG_LLM_MODEL: str = os.getenv("RAG_LLM_MODEL", "gpt-4o-mini")
    RAG_EMBEDDING_MODEL: str = os.getenv("RAG_EMBEDDING_MODEL", "minilm")
    RAG_CHUNK_SIZE: int = int(os.getenv("RAG_CHUNK_SIZE", "1000"))
    RAG_CHUNK_OVERLAP: int = int(os.getenv("RAG_CHUNK_OVERLAP", "200"))
    
    # Hugging Face Settings
    HUGGINGFACE_API_TOKEN: Optional[str] = None
    
    # Construct DATABASE_URL from AWS credentials
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql://{self.PG_USER_AWS}:{self.PG_PASSWORD_AWS}@{self.PG_HOST_AWS}:{self.PG_PORT_AWS}/{self.PG_DATABASE_AWS}?sslmode={self.PG_SSLMODE_AWS}"
    
    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    
    # AWS
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "eu-west-2"
    S3_BUCKET: str = "legal-documents"
    
    # APIs
    CASELAW_API_URL: str = "https://caselaw.nationalarchives.gov.uk"
    LEGISLATION_API_URL: str = "https://www.legislation.gov.uk"
    
    # Chunking
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    
    # Storage Control Flags
    STORE_CASE_SEARCHES: bool = False  # Control case search caching
    STORE_CHAT_SESSIONS: bool = False  # Control chat session storage
    STORE_CHAT_MESSAGES: bool = False  # Control chat message storage
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra fields from environment

settings = Settings()