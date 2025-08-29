import openai
from typing import List, Dict, Any, Optional
from ..config import settings
from ..services.embeddings import EmbeddingService
from ..services.caselaw import CaseLawService
from ..models.database import ChatMessage, ChatSession, SessionLocal
import logging

logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self):
        openai.api_key = settings.OPENAI_API_KEY
        self.embedding_service = EmbeddingService()
        self.caselaw_service = CaseLawService()
        self.model = settings.OPENAI_MODEL
    
    def generate_response(
        self,
        query: str,
        session_id: str,
        search_documents: bool = True
    ) -> Dict[str, Any]:
        """Generate chat response with context"""
        
        # Search relevant documents
        context = ""
        sources = []
        
        if search_documents:
            # Semantic search in uploaded documents
            doc_results = self.embedding_service.semantic_search(query, limit=5)
            
            # Rerank results
            doc_results = self.embedding_service.rerank_results(query, doc_results)
            
            # Search case law
            case_results = self.caselaw_service.search_cases(query, max_results=5)
            
            # Combine context
            context = self._build_context(doc_results, case_results)
            sources = self._format_sources(doc_results, case_results)
        
        # Get chat history
        history = self._get_chat_history(session_id)
        
        # Build system prompt
        system_prompt = self._build_system_prompt(context)
        
        # Generate response
        messages = [
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": query}
        ]
        
        response = openai.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.1,
            max_tokens=2000
        )
        
        assistant_message = response.choices[0].message.content
        
        # Save to database
        self._save_messages(session_id, query, assistant_message, sources)
        
        return {
            "response": assistant_message,
            "sources": sources,
            "session_id": session_id
        }
    
    def _build_context(self, doc_results: List[Dict], case_results: List[Dict]) -> str:
        """Build context from search results"""
        context_parts = []
        
        # Add document context
        if doc_results:
            context_parts.append("RELEVANT DOCUMENT EXCERPTS:")
            for i, result in enumerate(doc_results[:3], 1):
                context_parts.append(
                    f"\n[Document {i}] (Page {result['page_number']}, "
                    f"Relevance: {result['similarity']:.2%}):\n{result['content']}\n"
                )
        
        # Add case law context
        if case_results:
            context_parts.append("\nRELEVANT CASE LAW:")
            for i, case in enumerate(case_results[:3], 1):
                context_parts.append(
                    f"\n[Case {i}] {case['title']} [{case.get('citation', 'No citation')}]"
                    f"\nCourt: {case['court']}"
                    f"\nDate: {case['date']}"
                    f"\nSummary: {case.get('summary', 'No summary available')}\n"
                )
        
        return "\n".join(context_parts)
    
    def _build_system_prompt(self, context: str) -> str:
        """Build system prompt for the LLM"""
        return f"""You are an expert legal research assistant specializing in UK law. Your role is to:
1. Provide accurate legal information based on provided documents and case law
2. Cite specific sources with page numbers and case citations
3. Clearly distinguish between statutory law, case law, and legal principles
4. Use precise legal terminology while remaining accessible
5. Always clarify that you provide legal information, not legal advice

IMPORTANT INSTRUCTIONS:
- When referencing documents, always cite [Document X, Page Y]
- When referencing cases, always provide the full citation
- If information is not available in the context, clearly state this
- Highlight any uncertainties or areas requiring further research

CONTEXT:
{context}

Provide a comprehensive response that directly addresses the user's query using the available context."""
    
    def _format_sources(self, doc_results: List[Dict], case_results: List[Dict]) -> List[Dict]:
        """Format sources for response"""
        sources = []
        
        for result in doc_results[:3]:
            sources.append({
                "type": "document",
                "id": result['chunk_id'],
                "document_id": result['document_id'],
                "page": result['page_number'],
                "relevance": result['similarity'],
                "excerpt": result['content'][:200] + "..."
            })
        
        for case in case_results[:3]:
            sources.append({
                "type": "case",
                "title": case['title'],
                "citation": case.get('citation'),
                "court": case['court'],
                "date": case['date'],
                "url": case.get('url'),
                "summary": case.get('summary', '')[:200] + "..."
            })
        
        return sources
    
    def _save_messages(self, session_id: str, user_message: str, assistant_message: str, sources: List[Dict]):
        """Save messages to database only if storage is enabled"""
        
        # Only save if chat message storage is enabled
        if not settings.STORE_CHAT_MESSAGES:
            logger.info("Chat message storage disabled - skipping save")
            return
        
        db = SessionLocal()
        try:
            # Save user message
            user_msg = ChatMessage(
                session_id=session_id,
                role="user",
                content=user_message
            )
            db.add(user_msg)
            
            # Save assistant message
            assistant_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=assistant_message,
                sources=sources
            )
            db.add(assistant_msg)
            
            db.commit()
            logger.info(f"Chat messages saved for session: {session_id}")
            
        except Exception as e:
            logger.error(f"Error saving chat messages: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _get_chat_history(self, session_id: str, limit: int = 10) -> List[Dict]:
        """Get chat history only if storage is enabled"""
        
        # Return empty history if storage is disabled
        if not settings.STORE_CHAT_MESSAGES:
            logger.info("Chat message storage disabled - returning empty history")
            return []
        
        db = SessionLocal()
        try:
            messages = db.query(ChatMessage).filter(
                ChatMessage.session_id == session_id
            ).order_by(ChatMessage.timestamp.desc()).limit(limit).all()
            
            history = []
            for msg in reversed(messages):
                history.append({
                    "role": msg.role,
                    "content": msg.content
                })
            
            return history
            
        finally:
            db.close()
    
    def generate_summary(self, document_id: str) -> str:
        """Generate summary of uploaded document"""
        db = SessionLocal()
        try:
            # Get all chunks for document
            from ..models.database import DocumentChunk
            chunks = db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id
            ).order_by(DocumentChunk.chunk_index).all()
            
            # Combine first few chunks for summary
            text = " ".join([chunk.content for chunk in chunks[:5]])
            
            # Generate summary
            response = openai.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": """Create a comprehensive legal document summary that includes:
                        1. Document type and purpose
                        2. Key parties involved
                        3. Main legal issues or points
                        4. Important dates and deadlines
                        5. Critical terms and conditions
                        6. Legal implications
                        
                        Format the summary with clear sections and bullet points."""
                    },
                    {
                        "role": "user",
                        "content": f"Summarize this legal document:\n\n{text}"
                    }
                ],
                temperature=0.1,
                max_tokens=1000
            )
            
            return response.choices[0].message.content
            
        finally:
            db.close()