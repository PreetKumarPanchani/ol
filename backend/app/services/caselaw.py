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
            
            # Parse XML response
            cases = self._parse_atom_feed(response.text)
            
            # Fetch detailed information for each case
            detailed_cases = []
            for case in cases[:5]:  # Limit detailed fetching
                details = self._fetch_case_details(case['uri'])
                case.update(details)
                detailed_cases.append(case)
            
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
                'url': None
            }
            
            # Get URL from link element
            link = entry.find('atom:link[@rel="alternate"]', ns)
            if link is not None:
                case['url'] = link.get('href')
            
            # Get citation
            identifier = entry.find('tna:identifier', ns)
            if identifier is not None:
                case['citation'] = identifier.text
            
            cases.append(case)
        
        return cases
    
    def _fetch_case_details(self, uri: str) -> Dict:
        """Fetch detailed case information"""
        try:
            response = self.client.get(f"{self.base_url}/{uri}/data.xml")
            response.raise_for_status()
            
            # Parse LegalDocML
            details = self._parse_legal_docml(response.text)
            return details
            
        except Exception as e:
            print(f"Error fetching case details: {e}")
            return {}
    
    def _parse_legal_docml(self, xml_content: str) -> Dict:
        """Parse LegalDocML format"""
        try:
            root = ET.fromstring(xml_content)
            
            # Extract key information
            details = {
                'full_text': self._extract_text(root),
                'judges': self._extract_judges(root),
                'keywords': self._extract_keywords(root)
            }
            
            return details
            
        except Exception as e:
            print(f"Error parsing LegalDocML: {e}")
            return {}
    # Extract 2000 charcters from full_text only, rest of the title and other details remain as it is 
    def _extract_text(self, root) -> str:
        """Extract main text content from XML"""
        text_elements = root.findall('.//*[@eId]')
        text = ' '.join([elem.text for elem in text_elements if elem.text])
        #return text[:2000]  # Limit to first 2000 chars
        return text
    
    def _extract_judges(self, root) -> List[str]:
        """Extract judge names"""
        judges = []
        for judge_elem in root.findall('.//*[@as="#judge"]'):
            if judge_elem.text:
                judges.append(judge_elem.text)
        return judges
    
    def _extract_keywords(self, root) -> List[str]:
        """Extract keywords or topics"""
        keywords = []
        for keyword_elem in root.findall('.//*[@class="keyword"]'):
            if keyword_elem.text:
                keywords.append(keyword_elem.text)
        return keywords