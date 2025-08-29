"""
Stateless RAG Pipeline for Legal Research with Citations
No persistent storage - everything lives in memory for the session
"""
"""
Stateless RAG Pipeline for Legal Research with Citations
No persistent storage - everything lives in memory for the session
"""

"""
Enhanced Stateless RAG Pipeline with Proper Citation Formatting
"""

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import re
from enum import Enum

# LangChain imports
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# Import the CaseLawService
from .caselaw import CaseLawService

import httpx
import logging

logger = logging.getLogger(__name__)


class EmbeddingModel(Enum):
    """Available embedding models"""
    OPENAI_SMALL = "text-embedding-3-small"
    OPENAI_LARGE = "text-embedding-3-large"
    MINILM = "sentence-transformers/all-MiniLM-L6-v2"
    MPNET = "sentence-transformers/all-mpnet-base-v2"
    BGE_LARGE = "BAAI/bge-large-en-v1.5"


@dataclass
class CitationSource:
    """Represents a citable source with full content"""
    id: str
    type: str  # 'case', 'legislation', 'document'
    content: str  # Full chunk content for display
    metadata: Dict[str, Any]
    chunk_index: int = 0
    relevance_score: float = 0.0
    citation_number: Optional[int] = None  # Assigned citation number [1], [2], etc.


@dataclass
class RAGSession:
    """Encapsulates a stateless RAG session"""
    session_id: str
    vector_store: Optional[FAISS] = None
    sources: List[CitationSource] = field(default_factory=list)
    citation_map: Dict[str, CitationSource] = field(default_factory=dict)
    citation_number_map: Dict[int, CitationSource] = field(default_factory=dict)  # Map [1] -> source
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def cleanup(self):
        """Cleanup session resources"""
        self.vector_store = None
        self.sources.clear()
        self.citation_map.clear()
        self.citation_number_map.clear()


class StatelessRAGPipeline:
    """
    Stateless RAG Pipeline with Enhanced Citation System
    """
    
    def __init__(
        self,
        embedding_model: EmbeddingModel = EmbeddingModel.MINILM,
        llm_model: str = "gpt-4o-mini",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        api_timeout: int = 30
    ):
        self.embedding_model = embedding_model
        self.llm_model = llm_model
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.api_timeout = api_timeout
        self.embeddings = self._initialize_embeddings()
        
        # Initialize LLM
        from ..config import settings
        self.llm = ChatOpenAI(
            model=llm_model, 
            temperature=0.1,
            openai_api_key=settings.OPENAI_API_KEY
        )
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        self.http_client = httpx.Client(timeout=api_timeout)
        self.active_sessions: Dict[str, RAGSession] = {}
        
        # Initialize the CaseLawService
        self.caselaw_service = CaseLawService()
    
    def _initialize_embeddings(self):
        """Initialize the selected embedding model"""
        if self.embedding_model in [EmbeddingModel.OPENAI_SMALL, EmbeddingModel.OPENAI_LARGE]:
            from ..config import settings
            return OpenAIEmbeddings(
                model=self.embedding_model.value,
                openai_api_key=settings.OPENAI_API_KEY
            )
        else:
            from ..config import settings
            if hasattr(settings, 'HUGGINGFACE_API_TOKEN') and settings.HUGGINGFACE_API_TOKEN:
                import os
                os.environ["HUGGING_FACE_HUB_TOKEN"] = settings.HUGGINGFACE_API_TOKEN
            
            return HuggingFaceEmbeddings(
                model_name=self.embedding_model.value,
                cache_folder="/tmp/hf_cache"
            )
    
    def create_session(self, session_id: str) -> RAGSession:
        """Create a new RAG session"""
        session = RAGSession(session_id=session_id)
        self.active_sessions[session_id] = session
        return session
    
    def fetch_and_process_api_data(
        self,
        session_id: str,
        query: str,
        search_types: List[str] = ['cases', 'legislation']
    ) -> Dict[str, List[Document]]:
        """
        Fetch data from APIs and process into documents
        """
        session = self.active_sessions.get(session_id)
        if not session:
            session = self.create_session(session_id)
        
        documents = {
            'cases': [],
            'legislation': [],
            'documents': []
        }
        
        if 'cases' in search_types:
            case_docs = self._fetch_case_law(query)
            documents['cases'] = case_docs
            
        if 'legislation' in search_types:
            leg_docs = self._fetch_legislation(query)
            documents['legislation'] = leg_docs
        
        return documents
    
    def _fetch_case_law(self, query: str, max_results: int = 10) -> List[Document]:
        """Fetch case law using enhanced XML parsing"""
        docs = []
        try:
            cases = self.caselaw_service.search_cases(query, max_results)
            
            for case in cases:
                # Create comprehensive content
                content = f"""
Case: {case.get('title', '')}
Citation: {case.get('citation', '')}
Court: {case.get('court', '')}
Date: {case.get('date', '')}

Full Text:
{case.get('full_text', 'No full text available')}

Judges: {', '.join(case.get('judges', [])) if case.get('judges') else 'No judge information'}
Keywords: {', '.join(case.get('keywords', [])) if case.get('keywords') else 'No keywords'}
"""
                
                doc = Document(
                    page_content=content,
                    metadata={
                        'source_id': f"case_{hashlib.md5(case.get('title', '').encode()).hexdigest()[:8]}",
                        'type': 'case',
                        'title': case.get('title', ''),
                        'citation': case.get('citation', ''),
                        'court': case.get('court', ''),
                        'date': case.get('date', ''),
                        'url': case.get('url', ''),
                        'query': query
                    }
                )
                docs.append(doc)
                
        except Exception as e:
            logger.error(f"Error fetching case law: {e}")
        
        return docs
    
    def _fetch_legislation(self, query: str, max_results: int = 10) -> List[Document]:
        """Fetch legislation"""
        docs = []
        try:
            # Simplified legislation fetch
            example_content = f"""
Legislation Search Results for: {query}

Note: This would contain actual legislation text from the API.
The legislation.gov.uk API would provide:
- Acts of Parliament
- Statutory Instruments
- Related provisions
"""
            
            doc = Document(
                page_content=example_content,
                metadata={
                    'source_id': f"leg_{hashlib.md5(query.encode()).hexdigest()[:8]}",
                    'type': 'legislation',
                    'query': query
                }
            )
            docs.append(doc)
            
        except Exception as e:
            logger.error(f"Error fetching legislation: {e}")
        
        return docs
    
    def build_vector_store(
        self,
        session_id: str,
        documents: Dict[str, List[Document]]
    ) -> FAISS:
        """
        Build in-memory FAISS vector store with proper citation tracking
        """
        session = self.active_sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        all_docs = []
        citation_counter = 1  # Start citation numbering at 1
        
        # Process each document type
        for doc_type, docs in documents.items():
            for doc in docs:
                # Split into chunks if needed
                if len(doc.page_content) > self.chunk_size:
                    chunks = self.text_splitter.split_text(doc.page_content)
                    for i, chunk in enumerate(chunks):
                        # Create chunk document
                        chunk_doc = Document(
                            page_content=chunk,
                            metadata={
                                **doc.metadata,
                                'chunk_index': i,
                                'total_chunks': len(chunks),
                                'chunk_id': f"{doc.metadata['source_id']}_chunk_{i}",
                                'citation_number': citation_counter  # Add citation number
                            }
                        )
                        all_docs.append(chunk_doc)
                        
                        # Create citation source with full content
                        citation_source = CitationSource(
                            id=f"{doc.metadata['source_id']}_chunk_{i}",
                            type=doc_type,
                            content=chunk,  # Store full chunk text
                            metadata=doc.metadata,
                            chunk_index=i,
                            citation_number=citation_counter
                        )
                        session.sources.append(citation_source)
                        session.citation_map[citation_source.id] = citation_source
                        session.citation_number_map[citation_counter] = citation_source
                        
                        citation_counter += 1
                else:
                    # Document is small enough to use as-is
                    doc.metadata['citation_number'] = citation_counter
                    all_docs.append(doc)
                    
                    citation_source = CitationSource(
                        id=doc.metadata['source_id'],
                        type=doc_type,
                        content=doc.page_content,  # Store full content
                        metadata=doc.metadata,
                        citation_number=citation_counter
                    )
                    session.sources.append(citation_source)
                    session.citation_map[citation_source.id] = citation_source
                    session.citation_number_map[citation_counter] = citation_source
                    
                    citation_counter += 1
        
        # Create FAISS vector store
        if all_docs:
            vector_store = FAISS.from_documents(
                documents=all_docs,
                embedding=self.embeddings
            )
            session.vector_store = vector_store
            logger.info(f"Created vector store with {len(all_docs)} documents, {citation_counter-1} citations")
            return vector_store
        else:
            logger.warning(f"No documents to vectorize")
            return None
    
    def query_with_citations(
        self,
        session_id: str,
        query: str,
        k: int = 5
    ) -> Dict[str, Any]:
        """
        Query with proper numbered citations [1], [2], etc.
        """
        session = self.active_sessions.get(session_id)
        if not session or not session.vector_store:
            return {
                'response': "No data available for this session.",
                'citations': [],
                'sources': []
            }
        
        # Enhanced prompt that uses numbered citations
        citation_prompt = PromptTemplate(
            template="""You are an expert legal research assistant. Answer the question using ONLY the provided context.
            
CRITICAL REQUIREMENTS:
1. EVERY factual statement MUST include an inline citation using the format [citation_number]
2. Use the EXACT citation numbers provided in the context
3. Place citations immediately after the relevant statement
4. If multiple sources support a claim, cite all: [1][2] or [1, 2]
5. NEVER make claims without citations
6. If the context doesn't contain relevant information, say so clearly

Context with numbered citations:
{context}

Question: {question}

Answer with numbered citations [1], [2], etc.:""",
            input_variables=["context", "question"]
        )
        
        # Retrieve relevant documents
        retriever = session.vector_store.as_retriever(
            search_kwargs={"k": k}
        )
        relevant_docs = retriever.get_relevant_documents(query)
        
        # Format context with citation numbers
        formatted_context = ""
        used_citations = set()
        
        for doc in relevant_docs:
            citation_num = doc.metadata.get('citation_number')
            if citation_num:
                used_citations.add(citation_num)
                # Format with citation number instead of source_id
                formatted_context += f"[{citation_num}] {doc.page_content}\n---\n\n"
        
        # Create RAG chain
        rag_chain = (
            {"context": lambda x: formatted_context, "question": RunnablePassthrough()}
            | citation_prompt
            | self.llm
            | StrOutputParser()
        )
        
        # Get response
        response_text = rag_chain.invoke(query)
        
        # Extract citations and format response
        citations = self._extract_numbered_citations(session, response_text, used_citations)
        
        return {
            'response': response_text,
            'citations': citations,
            'sources': relevant_docs,
            'session_id': session_id
        }
    
    def _extract_numbered_citations(
        self,
        session: RAGSession,
        response_text: str,
        used_citations: set
    ) -> List[Dict[str, Any]]:
        """Extract numbered citations from response"""
        # Pattern to find [1], [2], etc.
        citation_pattern = r'\[(\d+)\]'
        matches = re.findall(citation_pattern, response_text)
        
        citations = []
        seen_numbers = set()
        
        for num_str in matches:
            num = int(num_str)
            if num in used_citations and num not in seen_numbers:
                seen_numbers.add(num)
                
                # Get citation source from session
                if num in session.citation_number_map:
                    source = session.citation_number_map[num]
                    
                    # Create citation with full chunk content
                    citation = {
                        'number': num,
                        'source_id': source.id,
                        'type': source.type,
                        'chunk_content': source.content,  # Full chunk text for display
                        'content_excerpt': source.content[:200] + '...' if len(source.content) > 200 else source.content,
                        'metadata': source.metadata
                    }
                    citations.append(citation)
        
        # Sort by citation number
        citations.sort(key=lambda x: x['number'])
        return citations
    
    def cleanup_session(self, session_id: str):
        """Cleanup session"""
        if session_id in self.active_sessions:
            session = self.active_sessions[session_id]
            session.cleanup()
            del self.active_sessions[session_id]
            logger.info(f"Session {session_id} cleaned up")
    
    def process_query(
        self,
        query: str,
        session_id: Optional[str] = None,
        search_types: List[str] = ['cases', 'legislation'],
        cleanup_after: bool = True
    ) -> Dict[str, Any]:
        """
        Complete stateless pipeline with proper citations
        """
        import uuid
        
        if not session_id:
            session_id = str(uuid.uuid4())
        
        try:
            # Create session
            session = self.create_session(session_id)
            logger.info(f"Created session {session_id}")
            
            # Fetch data
            logger.info(f"Fetching data for query: {query}")
            documents = self.fetch_and_process_api_data(session_id, query, search_types)
            
            # Build vector store
            logger.info(f"Building vector store")
            vector_store = self.build_vector_store(session_id, documents)
            
            if vector_store:
                # Query with citations
                logger.info(f"Querying with citations")
                result = self.query_with_citations(session_id, query)
            else:
                result = {
                    'response': "No relevant data found for your query.",
                    'citations': [],
                    'sources': []
                }
            
            return result
            
        finally:
            if cleanup_after:
                self.cleanup_session(session_id)
                logger.info(f"Session {session_id} completed and cleaned up")



                
'''
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import re
from enum import Enum

# LangChain imports
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain.callbacks.base import BaseCallbackHandler

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# Import the CaseLawService
from .caselaw import CaseLawService

# For API calls
import httpx
import logging

logger = logging.getLogger(__name__)


class EmbeddingModel(Enum):
    """Available embedding models"""
    OPENAI_SMALL = "text-embedding-3-small"
    OPENAI_LARGE = "text-embedding-3-large"
    MINILM = "sentence-transformers/all-MiniLM-L6-v2"
    MPNET = "sentence-transformers/all-mpnet-base-v2"
    BGE_LARGE = "BAAI/bge-large-en-v1.5"


@dataclass
class CitationSource:
    """Represents a citable source"""
    id: str
    type: str  # 'case', 'legislation', 'document'
    content: str
    metadata: Dict[str, Any]
    chunk_index: int = 0
    relevance_score: float = 0.0


@dataclass
class RAGSession:
    """Encapsulates a stateless RAG session"""
    session_id: str
    vector_store: Optional[FAISS] = None
    sources: List[CitationSource] = field(default_factory=list)
    citation_map: Dict[str, CitationSource] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def cleanup(self):
        """Cleanup session resources"""
        self.vector_store = None
        self.sources.clear()
        self.citation_map.clear()


class StatelessRAGPipeline:
    """
    Stateless RAG Pipeline for Legal Research
    Everything is processed in-memory and discarded after use
    """
    
    def __init__(
        self,
        embedding_model: EmbeddingModel = EmbeddingModel.MINILM,
        llm_model: str = "gpt-4o-mini",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        api_timeout: int = 30
    ):
        self.embedding_model = embedding_model
        self.llm_model = llm_model
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.api_timeout = api_timeout
        self.embeddings = self._initialize_embeddings()
        
        # Initialize LLM with API key from config
        from ..config import settings
        self.llm = ChatOpenAI(
            model=llm_model, 
            temperature=0.1,
            openai_api_key=settings.OPENAI_API_KEY
        )
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        self.http_client = httpx.Client(timeout=api_timeout)
        self.active_sessions: Dict[str, RAGSession] = {}
        
        # Initialize the CaseLawService
        self.caselaw_service = CaseLawService()
    
    def _initialize_embeddings(self):
        """Initialize the selected embedding model"""
        if self.embedding_model in [EmbeddingModel.OPENAI_SMALL, EmbeddingModel.OPENAI_LARGE]:
            from ..config import settings
            return OpenAIEmbeddings(
                model=self.embedding_model.value,
                openai_api_key=settings.OPENAI_API_KEY
            )
        else:
            # HuggingFace embeddings with token support
            from ..config import settings
            
            # Set Hugging Face token if available
            if settings.HUGGINGFACE_API_TOKEN:
                import os
                os.environ["HUGGING_FACE_HUB_TOKEN"] = settings.HUGGINGFACE_API_TOKEN
            
            return HuggingFaceEmbeddings(
                model_name=self.embedding_model.value,
                cache_folder="/tmp/hf_cache"  # Temporary cache
            )
    
    def create_session(self, session_id: str) -> RAGSession:
        """Create a new RAG session"""
        session = RAGSession(session_id=session_id)
        self.active_sessions[session_id] = session
        return session
    
    def fetch_and_process_api_data(
        self,
        session_id: str,
        query: str,
        search_types: List[str] = ['cases', 'legislation']
    ) -> Dict[str, List[Document]]:
        """
        Fetch data from APIs and process into documents
        Returns documents organized by type
        """
        session = self.active_sessions.get(session_id)
        if not session:
            session = self.create_session(session_id)
        
        documents = {
            'cases': [],
            'legislation': [],
            'documents': []
        }
        
        # Fetch case law if requested
        if 'cases' in search_types:
            case_docs = self._fetch_case_law(query)
            documents['cases'] = case_docs
            print(f"\n=== DEBUG: Fetched {len(case_docs)} case law documents ===")
            
        # Fetch legislation if requested
        if 'legislation' in search_types:
            leg_docs = self._fetch_legislation(query)
            documents['legislation'] = leg_docs
            print(f"\n=== DEBUG: Fetched {len(leg_docs)} legislation documents ===")
        
        print(f"\n=== DEBUG: Total documents fetched ===")
        for doc_type, docs in documents.items():
            print(f"{doc_type}: {len(docs)} documents")
        
        return documents
    
    def _fetch_case_law(self, query: str, max_results: int = 10) -> List[Document]:
        """Fetch case law from National Archives API using CaseLawService"""
        docs = []
        try:
            # Use the CaseLawService to search for cases
            cases = self.caselaw_service.search_cases(query, max_results)
            
            for case in cases:
                # Create comprehensive content with all available information
                content = f"""
Case: {case.get('title', '')}
Citation: {case.get('citation', '')}
Court: {case.get('court', '')}
Date: {case.get('date', '')}

Full Text:
{case.get('full_text', 'No full text available')}

Summary: {case.get('summary', 'No summary available')}

Judges: {', '.join(case.get('judges', [])) if case.get('judges') else 'No judge information available'}

Keywords: {', '.join(case.get('keywords', [])) if case.get('keywords') else 'No keywords available'}
"""
                
                # Create document with metadata for citation
                doc = Document(
                    page_content=content,
                    metadata={
                        'source_id': f"case_{hashlib.md5(case.get('title', '').encode()).hexdigest()[:8]}",
                        'type': 'case',
                        'title': case.get('title', ''),
                        'citation': case.get('citation', ''),
                        'court': case.get('court', ''),
                        'date': case.get('date', ''),
                        'url': case.get('url', ''),
                        'query': query,
                        'full_text': case.get('full_text', ''),
                        'judges': case.get('judges', []),
                        'keywords': case.get('keywords', [])
                    }
                )
                docs.append(doc)
                
        except Exception as e:
            logger.error(f"Error fetching case law: {e}")
        
        return docs
    
    def _fetch_legislation(self, query: str, max_results: int = 10) -> List[Document]:
        """Fetch legislation from legislation.gov.uk API"""
        docs = []
        try:
            # Note: legislation.gov.uk has a complex API - this is simplified
            response = self.http_client.get(
                "https://www.legislation.gov.uk/api/search",
                params={
                    'query': query,
                    'type': 'primary',
                    'results-count': max_results
                }
            )
            
            # Process legislation results (simplified)
            # In real implementation, parse the actual API response
            
            # Example document creation
            example_content = f"""
Legislation Search Results for: {query}

Note: This would contain actual legislation text from the API.
The legislation.gov.uk API would provide:
- Acts of Parliament
- Statutory Instruments
- Related provisions
"""
            
            doc = Document(
                page_content=example_content,
                metadata={
                    'source_id': f"leg_{hashlib.md5(query.encode()).hexdigest()[:8]}",
                    'type': 'legislation',
                    'query': query
                }
            )
            docs.append(doc)
            
        except Exception as e:
            logger.error(f"Error fetching legislation: {e}")
        
        return docs
    
    def build_vector_store(
        self,
        session_id: str,
        documents: Dict[str, List[Document]]
    ) -> FAISS:
        """
        Build in-memory FAISS vector store from documents
        This is completely stateless - exists only in RAM
        """
        session = self.active_sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Combine all documents
        all_docs = []
        
        # Process each document type
        for doc_type, docs in documents.items():
            print(f"\n=== DEBUG: Processing {doc_type} documents ===")
            print(f"Number of {doc_type} docs: {len(docs)}")
            
            for doc_idx, doc in enumerate(docs):
                print(f"\n--- Processing {doc_type} doc {doc_idx+1} ---")
                print(f"Original metadata: {doc.metadata}")
                print(f"Content length: {len(doc.page_content)}")
                print(f"Content preview: {doc.page_content[:200]}...")
                
                # Split into chunks if needed
                if len(doc.page_content) > self.chunk_size:
                    chunks = self.text_splitter.split_text(doc.page_content)
                    print(f"Split into {len(chunks)} chunks")
                    for i, chunk in enumerate(chunks):
                        # Create new document for each chunk
                        chunk_doc = Document(
                            page_content=chunk,
                            metadata={
                                **doc.metadata,
                                'chunk_index': i,
                                'total_chunks': len(chunks),
                                'chunk_id': f"{doc.metadata['source_id']}_chunk_{i}"
                            }
                        )
                        all_docs.append(chunk_doc)
                        
                        # Add to citation tracking
                        citation_source = CitationSource(
                            id=f"{doc.metadata['source_id']}_chunk_{i}",
                            type=doc_type,
                            content=chunk,
                            metadata=doc.metadata,
                            chunk_index=i
                        )
                        session.sources.append(citation_source)
                        session.citation_map[citation_source.id] = citation_source
                else:
                    # Document is small enough to use as-is
                    print("Document used as-is (no chunking needed)")
                    all_docs.append(doc)
                    
                    citation_source = CitationSource(
                        id=doc.metadata['source_id'],
                        type=doc_type,
                        content=doc.page_content,
                        metadata=doc.metadata
                    )
                    session.sources.append(citation_source)
                    session.citation_map[citation_source.id] = citation_source
        
        # Create FAISS vector store in memory
        if all_docs:
            vector_store = FAISS.from_documents(
                documents=all_docs,
                embedding=self.embeddings
            )
            session.vector_store = vector_store
            logger.info(f"Created in-memory vector store with {len(all_docs)} documents for session {session_id}")
            return vector_store
        else:
            logger.warning(f"No documents to vectorize for session {session_id}")
            return None
    
    def query_with_citations(
        self,
        session_id: str,
        query: str,
        k: int = 5
    ) -> Dict[str, Any]:
        """
        Query the vector store and return response with proper citations
        """
        session = self.active_sessions.get(session_id)
        if not session or not session.vector_store:
            return {
                'response': "No data available for this session. Please fetch data first.",
                'citations': [],
                'sources': []
            }
        
        # Custom prompt template that enforces citations
        citation_prompt = PromptTemplate(
            template="""You are an expert legal research assistant. Answer the question using ONLY the provided context.
            
CRITICAL REQUIREMENTS:
1. EVERY factual statement MUST include an inline citation in format [Source: source_id]
2. Use the exact source_id from the metadata
3. Place citations immediately after the relevant statement
4. If multiple sources support a claim, cite all: [Source: id1][Source: id2]
5. NEVER make claims without citations
6. If the context doesn't contain relevant information, say so clearly

Context with source IDs:
{context}

Question: {question}

Answer with inline citations:""",
            input_variables=["context", "question"]
        )
        
        # Retrieve relevant documents
        retriever = session.vector_store.as_retriever(
            search_kwargs={"k": k}
        )
        relevant_docs = retriever.get_relevant_documents(query)
        
        # DEBUG: Print retrieved documents
        print(f"\n=== DEBUG: Retrieved {len(relevant_docs)} documents ===")
        for i, doc in enumerate(relevant_docs):
            print(f"\n--- Document {i+1} ---")
            print(f"Metadata: {doc.metadata}")
            print(f"Content: {doc.page_content[:500]}...")
            print(f"Content length: {len(doc.page_content)}")
        
        # Format context with clear source identification
        formatted_context = ""
        for doc in relevant_docs:
            source_id = doc.metadata.get('source_id', 'unknown')
            chunk_index = doc.metadata.get('chunk_index', 0)
            if chunk_index > 0:
                source_id = f"{source_id}_chunk_{chunk_index}"
            
            formatted_context += f"[Source: {source_id}]\n{doc.page_content}\n---\n\n"
        
        # DEBUG: Print formatted context
        print(f"\n=== DEBUG: Formatted Context ===")
        print(f"Context length: {len(formatted_context)}")
        print(f"Context preview: {formatted_context[:1000]}...")
        
        # Create RAG chain using LCEL (LangChain Expression Language)
        rag_chain = (
            {"context": lambda x: formatted_context, "question": RunnablePassthrough()}
            | citation_prompt
            | self.llm
            | StrOutputParser()
        )
        
        # Get response from chain
        response_text = rag_chain.invoke(query)
        
        # Extract and format citations from response
        citations = self._extract_and_format_citations(session, response_text)
        
        return {
            'response': response_text,
            'citations': citations,
            'sources': relevant_docs,
            'session_id': session_id
        }
    
    def _extract_and_format_citations(
        self,
        session: RAGSession,
        response_text: str
    ) -> List[Dict[str, Any]]:
        """Extract citations from response and format them properly"""
        citation_pattern = r'\[Source:\s*([^\]]+)\]'
        matches = re.findall(citation_pattern, response_text)
        
        citations = []
        citation_numbers = {}
        current_number = 1
        
        for source_id in matches:
            # Clean the source_id
            source_id = source_id.strip()
            
            # Get citation details from session
            if source_id in session.citation_map:
                source = session.citation_map[source_id]
                
                # Assign citation number if not already assigned
                if source_id not in citation_numbers:
                    citation_numbers[source_id] = current_number
                    current_number += 1
                    
                    citation = {
                        'number': citation_numbers[source_id],
                        'source_id': source_id,
                        'type': source.type,
                        'content_excerpt': source.content[:200] + '...' if len(source.content) > 200 else source.content,
                        'metadata': source.metadata
                    }
                    citations.append(citation)
        
        # Replace source IDs with citation numbers in response
        formatted_response = response_text
        for source_id, number in citation_numbers.items():
            formatted_response = formatted_response.replace(
                f"[Source: {source_id}]",
                f"[{number}]"
            )
        
        return citations
    
    def cleanup_session(self, session_id: str):
        """
        Cleanup session - remove from memory
        This ensures no data persists after use
        """
        if session_id in self.active_sessions:
            session = self.active_sessions[session_id]
            session.cleanup()
            del self.active_sessions[session_id]
            logger.info(f"Session {session_id} cleaned up - all data removed from memory")
    
    def process_query(
        self,
        query: str,
        session_id: Optional[str] = None,
        search_types: List[str] = ['cases', 'legislation'],
        cleanup_after: bool = True
    ) -> Dict[str, Any]:
        """
        Complete stateless pipeline:
        1. Fetch data from APIs
        2. Build vector store in memory
        3. Query with citations
        4. Cleanup everything
        """
        import uuid
        
        # Create session if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        try:
            # Create new session
            session = self.create_session(session_id)
            logger.info(f"Created session {session_id}")
            
            # Fetch and process API data
            logger.info(f"Fetching data for query: {query}")
            documents = self.fetch_and_process_api_data(session_id, query, search_types)
            
            # Build vector store in memory
            logger.info(f"Building in-memory vector store")
            vector_store = self.build_vector_store(session_id, documents)
            
            if vector_store:
                # Query with citations
                logger.info(f"Querying with citations")
                result = self.query_with_citations(session_id, query)
            else:
                result = {
                    'response': "No relevant data found for your query.",
                    'citations': [],
                    'sources': []
                }
            
            return result
            
        finally:
            # Always cleanup if requested
            if cleanup_after:
                self.cleanup_session(session_id)
                logger.info(f"Session {session_id} completed and cleaned up")


# Example usage
def example_usage():
    """Example of using the stateless RAG pipeline"""
    
    # Initialize pipeline with chosen embedding model
    pipeline = StatelessRAGPipeline(
        embedding_model=EmbeddingModel.MINILM,  # or OPENAI_SMALL, MPNET, BGE_LARGE
        llm_model="gpt-4o-mini",
        chunk_size=1000,
        chunk_overlap=200
    )
    
    # Process a legal query - completely stateless
    result = pipeline.process_query(
        query="What are the requirements for establishing negligence in UK law?",
        search_types=['cases', 'legislation'],
        cleanup_after=True  # Automatically cleanup after query
    )
    
    print(f"Response: {result['response']}")
    print(f"Citations: {result['citations']}")
    
    # Everything is now cleaned up - no data persists


if __name__ == "__main__":
    example_usage()

'''