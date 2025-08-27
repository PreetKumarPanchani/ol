import httpx
from typing import List, Dict, Any
import xml.etree.ElementTree as ET
from datetime import datetime
from ..config import settings

class LegislationService:
    def __init__(self):
        self.base_url = settings.LEGISLATION_API_URL
        self.client = httpx.Client(timeout=30.0)
    
    def search_legislation(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search UK legislation"""
        try:
            response = self.client.get(
                f"{self.base_url}/search",
                params={
                    'text': query,
                    'results-count': max_results
                }
            )
            response.raise_for_status()
            
            return self._parse_legislation_results(response.text)
            
        except Exception as e:
            print(f"Legislation search error: {e}")
            return []
    
    def _parse_legislation_results(self, xml_content: str) -> List[Dict]:
        """Parse legislation search results"""
        root = ET.fromstring(xml_content)
        
        results = []
        for result in root.findall('.//result'):
            legislation = {
                'title': result.find('.//title').text if result.find('.//title') is not None else '',
                'type': result.find('.//type').text if result.find('.//type') is not None else '',
                'year': result.find('.//year').text if result.find('.//year') is not None else '',
                'number': result.find('.//number').text if result.find('.//number') is not None else '',
                'url': result.find('.//url').text if result.find('.//url') is not None else '',
                'summary': self._extract_summary(result)
            }
            results.append(legislation)
        
        return results
    
    def _extract_summary(self, result_elem) -> str:
        """Extract summary from legislation result"""
        summary_elem = result_elem.find('.//summary')
        if summary_elem is not None:
            return summary_elem.text[:500]
        return "No summary available"