
import httpx
from typing import List, Dict, Any
import xml.etree.ElementTree as ET
from datetime import datetime
from ..config import settings

class CaseLawService:
    def __init__(self):
        self.base_url = settings.CASELAW_API_URL
        self.client = httpx.Client(timeout=30.0)
    
    def search_cases(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search for cases using Find Case Law API"""
        try:
            print(f"\n=== DEBUG: Searching for cases with query: {query} ===")
            
            # Search using the API
            response = self.client.get(
                f"{self.base_url}/atom.xml",
                params={
                    'query': query,
                    'order': '-date',
                    'per_page': max_results
                }
            )
            response.raise_for_status()
            
            print(f"API Response status: {response.status_code}")
            print(f"API Response content length: {len(response.text)}")
            
            # Parse XML response
            cases = self._parse_atom_feed(response.text)
            print(f"Parsed {len(cases)} cases from feed")
            
            # Fetch detailed information for each case
            detailed_cases = []
            for i, case in enumerate(cases[:5]):  # Limit detailed fetching
                print(f"\n--- Fetching details for case {i+1}: {case.get('title', 'Unknown')} ---")
                details = self._fetch_case_details(case)
                print(f"Details fetched: {list(details.keys())}")
                case.update(details)
                detailed_cases.append(case)
            
            print(f"Total detailed cases: {len(detailed_cases)}")
            return detailed_cases
            
        except Exception as e:
            print(f"Case law search error: {e}")
            return []
    
    def _parse_atom_feed(self, xml_content: str) -> List[Dict]:
        """Parse Atom XML feed"""
        root = ET.fromstring(xml_content)
        ns = {'atom': 'http://www.w3.org/2005/Atom', 'tna': 'https://caselaw.nationalarchives.gov.uk'}
        
        cases = []
        for entry in root.findall('atom:entry', ns):
            case = {
                'title': entry.find('atom:title', ns).text if entry.find('atom:title', ns) is not None else '',
                'uri': entry.find('tna:uri', ns).text if entry.find('tna:uri', ns) is not None else '',
                'court': entry.find('.//atom:name', ns).text if entry.find('.//atom:name', ns) is not None else '',
                'date': entry.find('atom:published', ns).text if entry.find('atom:published', ns) is not None else '',
                'summary': entry.find('atom:summary', ns).text if entry.find('atom:summary', ns) is not None else '',
                'url': None,
                'xml_url': None
            }
            
            # Get URL from link element
            link = entry.find('atom:link[@rel="alternate"]', ns)
            if link is not None:
                case['url'] = link.get('href')
            
            # Get XML URL from link with type="application/akn+xml"
            xml_link = entry.find('atom:link[@type="application/akn+xml"]', ns)
            if xml_link is not None:
                case['xml_url'] = xml_link.get('href')
            
            # Get citation
            identifier = entry.find('tna:identifier', ns)
            if identifier is not None:
                case['citation'] = identifier.text
            
            cases.append(case)
        
        return cases
    
    def _fetch_case_details(self, case: Dict) -> Dict:
        """Fetch detailed case information"""
        try:
            # First try to use the XML URL from the feed
            if case.get('xml_url'):
                print(f"Fetching details from XML URL: {case['xml_url']}")
                response = self.client.get(case['xml_url'])
                response.raise_for_status()
                
                print(f"Case details response status: {response.status_code}")
                print(f"Case details content length: {len(response.text)}")
                
                # Parse LegalDocML
                details = self._parse_legal_docml(response.text)
                print(f"Parsed details keys: {list(details.keys())}")
                return details
            
            # Fallback: try to construct the URL manually
            else:
                uri = case.get('uri', '')
                if uri:
                    print(f"Fallback: Fetching details from: {self.base_url}/{uri}/data.xml")
                    response = self.client.get(f"{self.base_url}/{uri}/data.xml")
                    response.raise_for_status()
                    
                    print(f"Case details response status: {response.status_code}")
                    print(f"Case details content length: {len(response.text)}")
                    
                    # Parse LegalDocML
                    details = self._parse_legal_docml(response.text)
                    print(f"Parsed details keys: {list(details.keys())}")
                    return details
            
            return {}
            
        except Exception as e:
            print(f"Error fetching case details: {e}")
            return {}
    
    def _parse_legal_docml(self, xml_content: str) -> Dict:
        """Parse LegalDocML format"""
        try:
            root = ET.fromstring(xml_content)
            print(f"XML root tag: {root.tag}")
            
            ns = {
                'akn': 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0',
                'uk': 'https://caselaw.nationalarchives.gov.uk/akn',
                'html': 'http://www.w3.org/1999/xhtml'
            }
            
            # Extract key information
            full_text = self._extract_text(root, ns)
            judges = self._extract_judges(root, ns)
            keywords = self._extract_keywords(root, ns)
            
            print(f"Extracted text length: {len(full_text)}")
            print(f"Extracted judges: {judges}")
            print(f"Extracted keywords: {keywords}")
            
            details = {
                'full_text': full_text,
                'judges': judges,
                'keywords': keywords
            }
            
            return details
            
        except Exception as e:
            print(f"Error parsing LegalDocML: {e}")
            return {}

    def _extract_text(self, root, ns) -> str:
        """Extract main text content from XML"""
        judgment_body = root.find('.//akn:judgmentBody', ns)
        if judgment_body is not None:
            # Collect text from all paragraphs and levels, preserving some structure
            text_parts = []
            for elem in judgment_body.findall('.//akn:p', ns) + judgment_body.findall('.//akn:paragraph//akn:p', ns) + judgment_body.findall('.//akn:level//akn:p', ns):
                para_text = ''.join(elem.itertext()).strip()
                if para_text:
                    text_parts.append(para_text)
            return '\n\n'.join(text_parts)
        else:
            # Fallback: extract all text from the document
            return ' '.join(t.strip() for t in root.itertext() if t.strip()).replace('\n', ' ').replace('\t', ' ')
    
    def _extract_judges(self, root, ns) -> List[str]:
        """Extract judge names"""
        judges = set()
        
        # Structured extraction from header/judge
        header = root.find('.//akn:header', ns)
        if header:
            for judge_elem in header.findall('.//akn:judge', ns):
                judge_name = ''.join(judge_elem.itertext()).strip()
                if judge_name:
                    judges.add(judge_name)
        
        # Fallback: text-based extraction for judge mentions
        for p in root.findall('.//akn:p', ns):
            text = ''.join(p.itertext()).strip().upper()
            if 'BEFORE THE HON' in text or 'MR JUSTICE' in text or 'MRS JUSTICE' in text:
                # Extract name after "BEFORE"
                if 'BEFORE' in text:
                    judge_name = text.split('BEFORE')[-1].strip().split('.')[0].strip()
                    if judge_name:
                        judges.add(judge_name)
        
        # Additional patterns for experts or other roles if needed
        return list(judges) if judges else []
    
    def _extract_keywords(self, root, ns) -> List[str]:
        """Extract keywords or topics"""
        keywords = set()
        
        # From classification or keyword elements
        for keyword_elem in root.findall('.//akn:keyword', ns) + root.findall('.//uk:keyword', ns):
            if keyword_elem.text:
                keywords.add(keyword_elem.text.strip())
        
        # From proprietary metadata
        proprietary = root.find('.//akn:proprietary', ns)
        if proprietary:
            for elem in proprietary.findall('.//uk:*', ns):
                if elem.text:
                    keywords.add(f"{elem.tag.split('}')[-1]}: {elem.text.strip()}")
        
        # Inferred from text (e.g., sections, acts)
        for p in root.findall('.//akn:p', ns):
            text = ''.join(p.itertext()).strip()
            if 'Section ' in text:
                parts = text.split('Section ')[1:]
                for part in parts:
                    section = part.split()[0].rstrip(',')
                    if section.isdigit():
                        keywords.add(f"Section {section}")
            # Add more generic patterns as needed, e.g., for acts
            if 'Act' in text:
                # Simple pattern for acts like "Financial Services and Markets Act"
                act_phrases = [word for word in text.split() if 'Act' in word]
                for act in act_phrases:
                    keywords.add(act.strip(',.'))
        
        return list(keywords) if keywords else []


