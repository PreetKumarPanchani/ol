"""
Citation Processor - Handles inline citation formatting and source mapping
"""

import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import hashlib


@dataclass
class Citation:
    """Represents a citation with its metadata"""
    number: int
    source_type: str  # 'document', 'case', or 'legislation'
    content: str
    metadata: Dict
    
    def to_inline(self) -> str:
        """Convert to inline citation format [1]"""
        return f"[{self.number}]"
    
    def to_html(self) -> str:
        """Convert to HTML superscript format"""
        return f'<sup><a href="#ref{self.number}" class="citation">[{self.number}]</a></sup>'
    
    def to_reference(self) -> str:
        """Format as reference entry"""
        if self.source_type == 'document':
            return f"[{self.number}] Document - Page {self.metadata.get('page', 'N/A')} ({self.metadata.get('relevance', 0):.0%} relevance)"
        elif self.source_type == 'case':
            return f"[{self.number}] {self.metadata.get('title', 'Unknown Case')} [{self.metadata.get('citation', 'No citation')}] - {self.metadata.get('court', 'Unknown Court')} ({self.metadata.get('date', 'Unknown date')})"
        elif self.source_type == 'legislation':
            return f"[{self.number}] {self.metadata.get('title', 'Unknown Legislation')} - {self.metadata.get('citation', 'No citation')}"
        else:
            return f"[{self.number}] Unknown source type"


class CitationProcessor:
    """Processes text with citations for legal documents"""
    
    def __init__(self):
        self.citations: List[Citation] = []
        self.citation_map: Dict[int, Citation] = {}
        self.content_hash_map: Dict[str, int] = {}  # For deduplication
    
    def add_citation(self, content: str, source_type: str, metadata: Dict) -> int:
        """
        Add a citation and return its number
        Deduplicates based on content hash
        """
        # Create hash of content for deduplication
        content_hash = hashlib.md5(content.encode()).hexdigest()
        
        # Check if we've already cited this exact content
        if content_hash in self.content_hash_map:
            return self.content_hash_map[content_hash]
        
        # Create new citation
        citation_number = len(self.citations) + 1
        citation = Citation(
            number=citation_number,
            source_type=source_type,
            content=content,
            metadata=metadata
        )
        
        self.citations.append(citation)
        self.citation_map[citation_number] = citation
        self.content_hash_map[content_hash] = citation_number
        
        return citation_number
    
    def process_text_with_citations(self, text: str, enforce_citations: bool = True) -> str:
        """
        Process text to ensure proper citation formatting
        
        Args:
            text: The text to process
            enforce_citations: Whether to flag statements without citations
        
        Returns:
            Processed text with properly formatted citations
        """
        # Pattern to find existing citations like [1], [2], etc.
        citation_pattern = r'\[(\d+)\]'
        
        # Pattern to find statements that might need citations (sentences ending with period)
        if enforce_citations:
            sentence_pattern = r'([^.!?]+[.!?])'
            sentences = re.findall(sentence_pattern, text)
            
            missing_citations = []
            for sentence in sentences:
                # Check if sentence has legal/factual content but no citation
                if self._needs_citation(sentence) and not re.search(citation_pattern, sentence):
                    missing_citations.append(sentence.strip())
            
            if missing_citations:
                # Add warning about missing citations
                warning = "\n\n⚠️ Note: The following statements may need citations:\n"
                for stmt in missing_citations[:3]:  # Show first 3
                    warning += f"• {stmt[:100]}...\n" if len(stmt) > 100 else f"• {stmt}\n"
                text = text + warning
        
        # Convert plain citations to HTML format
        text = re.sub(citation_pattern, r'<sup><a href="#ref\1" class="citation">[\1]</a></sup>', text)
        
        return text
    
    def _needs_citation(self, sentence: str) -> bool:
        """
        Determine if a sentence needs a citation
        Returns True for factual/legal statements
        """
        # Lowercase for checking
        lower_sentence = sentence.lower()
        
        # Skip questions, greetings, and meta-statements
        skip_patterns = [
            r'^\s*(hello|hi|welcome|thank)',
            r'^\s*(i can help|i will|let me)',
            r'^\s*(please note|note that|remember)',
            r'^\s*(this is|these are|here is)',
            r'\?$'  # Questions
        ]
        
        for pattern in skip_patterns:
            if re.search(pattern, lower_sentence):
                return False
        
        # Look for legal/factual indicators that need citations
        citation_indicators = [
            r'\b(court|judge|held|ruled|decided|found)\b',
            r'\b(law|statute|regulation|section|article)\b',
            r'\b(requires?|must|shall|prohibited|permitted)\b',
            r'\b(established|determined|concluded|states?)\b',
            r'\b(according to|pursuant to|under)\b',
            r'\b(precedent|principle|doctrine|test)\b',
            r'\b\d{4}\b',  # Years often indicate cases/statutes
            r'\b(v\.|vs\.?|versus)\b',  # Case names
        ]
        
        for pattern in citation_indicators:
            if re.search(pattern, lower_sentence):
                return True
        
        return False
    
    def extract_citations_from_text(self, text: str) -> List[int]:
        """Extract all citation numbers from text"""
        pattern = r'\[(\d+)\]'
        matches = re.findall(pattern, text)
        return [int(m) for m in matches]
    
    def generate_reference_section(self, used_citations: Optional[List[int]] = None) -> str:
        """
        Generate a formatted reference section
        
        Args:
            used_citations: List of citation numbers actually used in text.
                           If None, includes all citations.
        """
        if not self.citations:
            return ""
        
        # Filter citations if specific ones are requested
        citations_to_include = self.citations
        if used_citations is not None:
            citations_to_include = [c for c in self.citations if c.number in used_citations]
        
        if not citations_to_include:
            return ""
        
        # Build reference section
        references = ["", "---", "### References", ""]
        
        for citation in sorted(citations_to_include, key=lambda c: c.number):
            ref_html = f'<span id="ref{citation.number}">{citation.to_reference()}</span>'
            references.append(ref_html)
            references.append("")  # Empty line between references
        
        return "\n".join(references)
    
    def format_with_inline_citations(
        self, 
        text: str, 
        source_chunks: List[Tuple[str, str, Dict]]
    ) -> Tuple[str, List[Dict]]:
        """
        Format text with inline citations based on source chunks
        
        Args:
            text: The text to format
            source_chunks: List of (content, source_type, metadata) tuples
        
        Returns:
            Tuple of (formatted_text, sources_list)
        """
        # Add all source chunks as citations
        for content, source_type, metadata in source_chunks:
            self.add_citation(content, source_type, metadata)
        
        # Process the text to ensure proper citation formatting
        formatted_text = self.process_text_with_citations(text, enforce_citations=True)
        
        # Extract which citations were actually used
        used_citations = self.extract_citations_from_text(formatted_text)
        
        # Add reference section
        if used_citations:
            reference_section = self.generate_reference_section(used_citations)
            formatted_text += reference_section
        
        # Create sources list for frontend
        sources = []
        for citation in self.citations:
            if citation.number in used_citations:
                source = {
                    "citation_num": citation.number,
                    "type": citation.source_type,
                    **citation.metadata
                }
                sources.append(source)
        
        return formatted_text, sources


# Example usage function for the ChatService
def apply_citation_processor(context_data: Dict, response_text: str) -> Tuple[str, List[Dict]]:
    """
    Apply citation processing to a chat response
    
    Args:
        context_data: Dictionary containing search results
        response_text: The LLM's response text
    
    Returns:
        Tuple of (formatted_text, sources)
    """
    processor = CitationProcessor()
    
    # Add document sources
    for doc in context_data.get('documents', []):
        processor.add_citation(
            content=doc['content'],
            source_type='document',
            metadata={
                'page': doc['page_number'],
                'document_id': doc['document_id'],
                'relevance': doc['similarity']
            }
        )
    
    # Add case law sources
    for case in context_data.get('cases', []):
        processor.add_citation(
            content=case.get('summary', ''),
            source_type='case',
            metadata={
                'title': case['title'],
                'citation': case.get('citation'),
                'court': case['court'],
                'date': case['date'],
                'url': case.get('url')
            }
        )
    
    # Process the response text
    formatted_text = processor.process_text_with_citations(response_text)
    
    # Get used citations
    used_citations = processor.extract_citations_from_text(formatted_text)
    
    # Generate sources list
    sources = []
    for num in used_citations:
        if num in processor.citation_map:
            citation = processor.citation_map[num]
            sources.append({
                'citation_num': citation.number,
                'type': citation.source_type,
                **citation.metadata
            })
    
    return formatted_text, sources