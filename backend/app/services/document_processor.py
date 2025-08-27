import hashlib
from typing import List, Dict, Any, Tuple
import pypdf
from langchain.text_splitter import RecursiveCharacterTextSplitter
from ..models.database import Document, DocumentChunk, SessionLocal
from ..config import settings
import tiktoken
import re

class DocumentProcessor:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=self._tiktoken_len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        self.tokenizer = tiktoken.encoding_for_model("gpt-4")
    
    def _tiktoken_len(self, text: str) -> int:
        return len(self.tokenizer.encode(text))
    
    def extract_text_from_pdf(self, pdf_path: str) -> List[Dict[str, Any]]:
        """Extract text from PDF with page information"""
        pages_data = []
        
        with open(pdf_path, 'rb') as file:
            pdf_reader = pypdf.PdfReader(file)
            
            for page_num, page in enumerate(pdf_reader.pages, 1):
                text = page.extract_text()
                
                # Clean the text
                text = self._clean_text(text)
                
                pages_data.append({
                    'page_number': page_num,
                    'content': text,
                    'char_count': len(text)
                })
        
        return pages_data
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove special characters but keep legal citations
        text = re.sub(r'[^\w\s\[\]\(\)§\.\,\;\:\-\/]', '', text)
        # Fix common OCR issues
        text = text.replace('ﬁ', 'fi').replace('ﬂ', 'fl')
        return text.strip()
    
    def create_chunks_with_context(self, pages_data: List[Dict]) -> List[Dict]:
        """Create chunks with contextual information"""
        chunks = []
        
        for page_data in pages_data:
            page_chunks = self.text_splitter.split_text(page_data['content'])
            
            for i, chunk in enumerate(page_chunks):
                # Calculate character positions
                char_start = sum(len(c) + 1 for c in page_chunks[:i]) if i > 0 else 0
                char_end = char_start + len(chunk)
                
                chunk_data = {
                    'content': chunk,
                    'page_number': page_data['page_number'],
                    'chunk_index': i,
                    'char_start': char_start,
                    'char_end': char_end,
                    'hash': self._generate_hash(chunk),
                    'doc_metadata': {
                        'has_citation': bool(re.search(r'\[\d{4}\]|\d{4}\s\w+\s\d+', chunk)),
                        'has_section': bool(re.search(r'§\s*\d+|Section\s+\d+', chunk, re.I)),
                        'word_count': len(chunk.split()),
                    }
                }
                chunks.append(chunk_data)
        
        return chunks
    
    def _generate_hash(self, text: str) -> str:
        """Generate hash for deduplication"""
        # Normalize text for hashing
        normalized = re.sub(r'\s+', ' ', text.lower().strip())
        return hashlib.md5(normalized.encode()).hexdigest()
    
    def deduplicate_chunks(self, chunks: List[Dict]) -> List[Dict]:
        """Remove duplicate or near-duplicate chunks"""
        seen_hashes = set()
        unique_chunks = []
        
        for chunk in chunks:
            chunk_hash = chunk['hash']
            
            if chunk_hash not in seen_hashes:
                seen_hashes.add(chunk_hash)
                unique_chunks.append(chunk)
            else:
                # Merge metadata if duplicate found
                for unique_chunk in unique_chunks:
                    if unique_chunk['hash'] == chunk_hash:
                        # Keep reference to all pages where content appears
                        if 'duplicate_pages' not in unique_chunk['doc_metadata']:
                            unique_chunk['doc_metadata']['duplicate_pages'] = []
                        unique_chunk['doc_metadata']['duplicate_pages'].append(chunk['page_number'])
                        break
        
        return unique_chunks
    
    def process_document(self, file_path: str, filename: str) -> Document:
        """Main document processing pipeline"""
        db = SessionLocal()
        
        try:
            # Extract text from PDF
            pages_data = self.extract_text_from_pdf(file_path)
            
            # Create chunks with context
            chunks = self.create_chunks_with_context(pages_data)
            
            # Deduplicate
            unique_chunks = self.deduplicate_chunks(chunks)
            
            # Create document record
            document = Document(
                filename=filename,
                content_type='application/pdf',
                total_chunks=len(unique_chunks),
                doc_metadata={
                    'total_pages': len(pages_data),
                    'total_chunks_before_dedup': len(chunks),
                    'deduplication_ratio': 1 - (len(unique_chunks) / len(chunks)) if chunks else 0
                }
            )
            db.add(document)
            db.commit()
            
            # Store chunks
            for chunk_data in unique_chunks:
                chunk = DocumentChunk(
                    document_id=document.id,
                    chunk_index=chunk_data['chunk_index'],
                    content=chunk_data['content'],
                    page_number=chunk_data['page_number'],
                    char_start=chunk_data['char_start'],
                    char_end=chunk_data['char_end'],
                    hash=chunk_data['hash'],
                    doc_metadata=chunk_data['doc_metadata']
                )
                db.add(chunk)
            
            db.commit()
            return document
            
        finally:
            db.close()