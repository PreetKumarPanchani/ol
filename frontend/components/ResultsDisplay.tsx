'use client'

interface Source {
  type: 'document' | 'case' | 'legislation'
  id?: string
  title?: string
  page?: number
  relevance?: number
  excerpt?: string
  citation?: string
  court?: string
  date?: string
  url?: string
}

interface ResultsDisplayProps {
  sources: Source[]
  title?: string
}

export default function ResultsDisplay({ sources, title = "Sources & References" }: ResultsDisplayProps) {
  const documentSources = sources.filter(s => s.type === 'document')
  const caseSources = sources.filter(s => s.type === 'case')
  const legislationSources = sources.filter(s => s.type === 'legislation')

  if (sources.length === 0) {
    return null
  }
  
  return (
    <div className="bg-gray-50 rounded-lg p-4 mt-3">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
      
      <div className="space-y-4">
        {/* Document Sources */}
      {documentSources.length > 0 && (
        <div>
            <h5 className="text-xs font-medium text-gray-600 mb-2 flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Document References ({documentSources.length})
            </h5>
          <div className="space-y-2">
            {documentSources.map((source, idx) => (
                <div key={idx} className="bg-white rounded border p-3 text-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {source.title && (
                          <span className="font-medium text-gray-900">{source.title}</span>
                        )}
                        {source.page && (
                          <span className="text-gray-500 text-xs bg-gray-100 px-2 py-1 rounded">
                            Page {source.page}
                          </span>
                        )}
                        {source.relevance && (
                          <span className="text-blue-600 text-xs font-medium">
                            {Math.round(source.relevance * 100)}% relevant
                    </span>
                        )}
                      </div>
                      {source.excerpt && (
                        <p className="text-gray-700 text-xs leading-relaxed">{source.excerpt}</p>
                      )}
                    </div>
                  </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
        {/* Case Law Sources */}
      {caseSources.length > 0 && (
        <div>
            <h5 className="text-xs font-medium text-gray-600 mb-2 flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              Case Law ({caseSources.length})
            </h5>
          <div className="space-y-2">
            {caseSources.map((source, idx) => (
                <div key={idx} className="bg-white rounded border p-3 text-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {source.title && (
                          <span className="font-medium text-gray-900">{source.title}</span>
                        )}
                        {source.citation && (
                          <span className="text-gray-500 text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                            {source.citation}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-gray-600 mb-2">
                        {source.court && <span>{source.court}</span>}
                        {source.date && <span>{new Date(source.date).toLocaleDateString()}</span>}
                        {source.relevance && (
                          <span className="text-blue-600 font-medium">
                            {Math.round(source.relevance * 100)}% relevant
                          </span>
                        )}
                      </div>
                      {source.excerpt && (
                        <p className="text-gray-700 text-xs leading-relaxed">{source.excerpt}</p>
                      )}
                    </div>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 ml-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legislation Sources */}
        {legislationSources.length > 0 && (
          <div>
            <h5 className="text-xs font-medium text-gray-600 mb-2 flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              Legislation ({legislationSources.length})
            </h5>
            <div className="space-y-2">
              {legislationSources.map((source, idx) => (
                <div key={idx} className="bg-white rounded border p-3 text-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {source.title && (
                          <span className="font-medium text-gray-900">{source.title}</span>
                        )}
                        {source.citation && (
                          <span className="text-gray-500 text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                            {source.citation}
                          </span>
                        )}
                      </div>
                      {source.date && (
                        <span className="text-xs text-gray-600">
                          Enacted: {new Date(source.date).toLocaleDateString()}
                        </span>
                      )}
                      {source.excerpt && (
                        <p className="text-gray-700 text-xs leading-relaxed mt-2">{source.excerpt}</p>
                      )}
                  </div>
                  {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 ml-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}