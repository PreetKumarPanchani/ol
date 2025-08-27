'use client'

import { useState } from 'react'
import { Search, Scale, Calendar, ExternalLink, ChevronRight, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiClient } from '@/lib/api-client'

interface Case {
  title: string
  citation: string
  court: string
  date: string
  summary: string
  url: string
  full_text?: string
  judges?: string[]
  keywords?: string[]
}

export default function CaseSearch() {
  const [query, setQuery] = useState('')
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCase, setSelectedCase] = useState<Case | null>(null)

  const searchCases = async () => {
    if (!query.trim()) return
    
    setLoading(true)
    try {
      const response = await apiClient.searchCases({query, limit: 10})
      setCases(response.data.results)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Search Panel */}
      <div className="w-full max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Case Law Research
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Search UK case law from the National Archives
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchCases()}
            placeholder="Enter case name, citation, or legal topic..."
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
          />
          <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
          <button
            onClick={searchCases}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-2 px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </div>

        {/* Search Suggestions */}
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Try:</span>
          {['contract breach', 'negligence', 'intellectual property', 'employment law'].map(suggestion => (
            <button
              key={suggestion}
              onClick={() => {
                setQuery(suggestion)
                searchCases()
              }}
              className="text-sm px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="space-y-3">
          <AnimatePresence>
            {cases.map((caseItem, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                      {caseItem.title}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <span className="flex items-center gap-1">
                        <Scale className="w-3 h-3" />
                        {caseItem.court}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(caseItem.date).toLocaleDateString()}
                      </span>
                      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {caseItem.citation}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                      {caseItem.summary}
                    </p>
                    
                    {caseItem.keywords && caseItem.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {caseItem.keywords.map((keyword, kidx) => (
                          <span 
                            key={kidx}
                            className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedCase(caseItem)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        View Details
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      {caseItem.url && (
                        <a
                          href={caseItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                        >
                          Open Original
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {cases.length === 0 && !loading && (
          <div className="text-center py-12">
            <Scale className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              No cases found. Try a different search term.
            </p>
          </div>
        )}
      </div>

      {/* Case Details Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-lg max-w-3xl max-h-[80vh] overflow-y-auto p-6"
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedCase.title}
              </h2>
              <button
                onClick={() => setSelectedCase(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Citation</h3>
                <p className="text-gray-900 dark:text-white">{selectedCase.citation}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Court</h3>
                <p className="text-gray-900 dark:text-white">{selectedCase.court}</p>
              </div>
              
              {selectedCase.judges && selectedCase.judges.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Judges</h3>
                  <p className="text-gray-900 dark:text-white">{selectedCase.judges.join(', ')}</p>
                </div>
              )}
              
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Summary</h3>
                <p className="text-gray-900 dark:text-white">{selectedCase.summary}</p>
              </div>
              
              {selectedCase.full_text && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Excerpt</h3>
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300">
                    {selectedCase.full_text}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}