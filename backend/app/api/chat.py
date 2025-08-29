import openai
from typing import List, Dict, Any, Optional, Tuple
import re
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
        """Generate chat response with inline citations"""
        
        # Search relevant documents
        context = ""
        sources = []
        source_map = {}  # Map for citation references
        
        if search_documents:
            # Semantic search in uploaded documents
            doc_results = self.embedding_service.semantic_search(query, limit=5)
            
            # Rerank results
            doc_results = self.embedding_service.rerank_results(query, doc_results)
            
            # Search case law
            case_results = self.caselaw_service.search_cases(query, max_results=5)
            
            # DEBUG: Print what case law service returned
            print(f"\n=== DEBUG: ChatService received {len(case_results)} case results ===")
            for i, case in enumerate(case_results):
                print(f"\n--- Case {i+1} ---")
                print(f"Title: {case.get('title', 'No title')}")
                print(f"Citation: {case.get('citation', 'No citation')}")
                print(f"Court: {case.get('court', 'No court')}")
                print(f"Date: {case.get('date', 'No date')}")
                print(f"Summary: {case.get('summary', 'No summary')}")
                print(f"Full text length: {len(case.get('full_text', ''))}")
                print(f"Full text preview: {case.get('full_text', 'No text')[:200]}...")
                print(f"Judges: {case.get('judges', [])}")
                print(f"Keywords: {case.get('keywords', [])}")
                print(f"URL: {case.get('url', 'No URL')}")
            
            # Build context with citation markers
            context, source_map = self._build_context_with_citations(doc_results, case_results)
            sources = self._format_sources(doc_results, case_results)
            
            # DEBUG: Print the built context and source map
            print(f"\n=== DEBUG: Built context length: {len(context)} ===")
            print(f"Context preview: {context[:1000]}...")
            print(f"Source map keys: {list(source_map.keys())}")
            for key, source in source_map.items():
                print(f"Source {key}: {source}")
        
        # Get chat history
        history = self._get_chat_history(session_id)
        
        # Build enhanced system prompt with citation instructions
        system_prompt = self._build_citation_system_prompt(context, source_map)
        
        # DEBUG: Print the system prompt
        print(f"\n=== DEBUG: System prompt length: {len(system_prompt)} ===")
        print(f"System prompt preview: {system_prompt[:1000]}...")
        
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
        
        # Post-process to ensure citations are properly formatted
        assistant_message = self._format_inline_citations(assistant_message, source_map)
        
        # Save to database
        self._save_messages(session_id, query, assistant_message, sources)
        
        return {
            "response": assistant_message,
            "sources": sources,
            "session_id": session_id,
            "source_map": source_map  # Include for frontend reference
        }
    
    def _build_context_with_citations(self, doc_results: List[Dict], case_results: List[Dict]) -> Tuple[str, Dict]:
        """Build context with numbered citation markers"""
        context_parts = []
        source_map = {}
        citation_counter = 1
        
        # Add document context with citation markers
        if doc_results:
            context_parts.append("RELEVANT DOCUMENT EXCERPTS:")
            for result in doc_results[:3]:
                citation_id = f"[{citation_counter}]"
                source_map[citation_counter] = {
                    "type": "document",
                    "page": result['page_number'],
                    "document_id": result['document_id'],
                    "relevance": result['similarity']
                }
                
                context_parts.append(
                    f"\n{citation_id} Document Page {result['page_number']} "
                    f"(Relevance: {result['similarity']:.2%}):\n"
                    f"{result['content']}\n"
                )
                citation_counter += 1
        
        # Add case law context with citation markers
        if case_results:
            context_parts.append("\nRELEVANT CASE LAW:")
            for case in case_results[:3]:
                citation_id = f"[{citation_counter}]"
                source_map[citation_counter] = {
                    "type": "case",
                    "title": case['title'],
                    "citation": case.get('citation', 'No citation'),
                    "court": case['court'],
                    "date": case['date']
                }
                
                context_parts.append(
                    f"\n{citation_id} {case['title']} [{case.get('citation', 'No citation')}]"
                    f"\nCourt: {case['court']}"
                    f"\nDate: {case['date']}"
                    f"\nSummary: {case.get('summary', 'No summary available')}\n"
                )
                citation_counter += 1
        
        return "\n".join(context_parts), source_map
    
    def _build_citation_system_prompt(self, context: str, source_map: Dict) -> str:
        """Build system prompt with strict citation instructions"""
        citation_guide = self._create_citation_guide(source_map)
        
        return f"""You are an expert legal research assistant specializing in UK law. Your role is to:
1. Provide accurate legal information based on provided documents and case law
2. ALWAYS include inline citations using [1], [2], [3] format immediately after each claim
3. Cite specific sources for every statement of fact or law
4. Clearly distinguish between statutory law, case law, and legal principles
5. Use precise legal terminology while remaining accessible
6. Always clarify that you provide legal information, not legal advice

CRITICAL CITATION REQUIREMENTS:
- You MUST cite sources using square brackets [1], [2], etc. immediately after each statement
- Every factual claim MUST have at least one citation
- Place citations at the end of the sentence, before the period [1].
- For multiple sources supporting the same point, use [1][2] or [1, 2]
- When paraphrasing or summarizing, still include the citation [3]
- Example: "The court held that negligence requires a duty of care [1], which was established in Donoghue v Stevenson [2]."

AVAILABLE CITATIONS:
{citation_guide}

CONTEXT WITH NUMBERED SOURCES:
{context}

INSTRUCTIONS FOR RESPONSE:
1. Answer the user's query comprehensively
2. Include [#] citations for EVERY factual statement
3. Use the exact citation numbers provided above
4. If information is not in the context, clearly state this
5. Highlight any uncertainties or areas requiring further research

Remember: Every statement of law or fact must have a citation. No exceptions."""
    
    def _create_citation_guide(self, source_map: Dict) -> str:
        """Create a guide of available citations for the LLM"""
        guide_parts = []
        for num, source in source_map.items():
            if source['type'] == 'document':
                guide_parts.append(f"[{num}] - Document, Page {source['page']}")
            elif source['type'] == 'case':
                guide_parts.append(f"[{num}] - {source['title']} ({source['citation']})")
        return "\n".join(guide_parts)
    
    def _format_inline_citations(self, text: str, source_map: Dict) -> str:
        """Post-process to ensure citations are properly formatted and add superscript HTML"""
        # First, ensure all citations are in standard [#] format
        text = re.sub(r'\[(\d+)\]', r'[[\1]]', text)  # Temporary double brackets
        text = re.sub(r'\[\[(\d+)\]\]', r'<sup>[<a href="#ref\1">\1</a>]</sup>', text)
        
        # Add a reference section if it doesn't exist
        if source_map and '<references>' not in text.lower():
            text += self._create_reference_section(source_map)
        
        return text
    
    def _create_reference_section(self, source_map: Dict) -> str:
        """Create a formatted reference section"""
        if not source_map:
            return ""
        
        references = ["\n\n---\n### References\n"]
        for num, source in sorted(source_map.items()):
            if source['type'] == 'document':
                ref = f"[{num}] Document - Page {source['page']} (Relevance: {source['relevance']:.0%})"
            elif source['type'] == 'case':
                ref = f"[{num}] {source['title']} [{source['citation']}] - {source['court']} ({source['date']})"
            references.append(f"<span id='ref{num}'>{ref}</span>")
        
        return "\n".join(references)
    
    def _format_sources(self, doc_results: List[Dict], case_results: List[Dict]) -> List[Dict]:
        """Format sources for response with citation numbers"""
        sources = []
        citation_num = 1
        
        for result in doc_results[:3]:
            sources.append({
                "type": "document",
                "citation_num": citation_num,
                "id": result['chunk_id'],
                "document_id": result['document_id'],
                "page": result['page_number'],
                "relevance": result['similarity'],
                "excerpt": result['content'][:200] + "..."
            })
            citation_num += 1
        
        for case in case_results[:3]:
            sources.append({
                "type": "case",
                "citation_num": citation_num,
                "title": case['title'],
                "citation": case.get('citation'),
                "court": case['court'],
                "date": case['date'],
                "url": case.get('url'),
                "summary": case.get('summary', '')[:200] + "..."
            })
            citation_num += 1
        
        return sources
    
    def _save_messages(self, session_id: str, user_message: str, assistant_message: str, sources: List[Dict]):
        """Save messages to database only if storage is enabled"""
        
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
            
            # Save assistant message with formatted citations
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
            from ..models.database import DocumentChunk
            chunks = db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id
            ).order_by(DocumentChunk.chunk_index).all()
            
            text = " ".join([chunk.content for chunk in chunks[:5]])
            
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