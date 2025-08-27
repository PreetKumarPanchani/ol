'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, File, X, CheckCircle, AlertCircle, FileText, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { apiClient } from '@/lib/api-client'

interface UploadedDocument {
  id: string
  filename: string
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  summary?: string
  totalChunks?: number
  metadata?: any
  error?: string
}

export default function DocumentUpload({ onUpload }: { onUpload: (docs: any[]) => void }) {
  const [documents, setDocuments] = useState<UploadedDocument[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const processFile = async (file: File) => {
    const docId = Date.now().toString()
    
    // Add to documents list
    const newDoc: UploadedDocument = {
      id: docId,
      filename: file.name,
      status: 'uploading',
      progress: 0
    }
    
    setDocuments(prev => [...prev, newDoc])
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      // Upload with progress tracking
      const response = await apiClient.uploadDocument(
        formData,
        (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total!)
          setDocuments(prev => prev.map(doc => 
            doc.id === docId 
              ? { ...doc, progress, status: progress === 100 ? 'processing' : 'uploading' }
              : doc
          ))
        }
      )
      
      // Update with results
      setDocuments(prev => prev.map(doc => 
        doc.id === docId 
          ? { 
              ...doc, 
              status: 'completed',
              summary: response.data.summary,
              totalChunks: response.data.total_chunks,
              metadata: response.data.metadata,
              id: response.data.document_id
            }
          : doc
      ))
      
      // Notify parent
      onUpload(documents.filter(d => d.status === 'completed'))
      
    } catch (error: any) {
      setDocuments(prev => prev.map(doc => 
        doc.id === docId 
          ? { ...doc, status: 'error', error: error.message }
          : doc
      ))
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      if (file.type === 'application/pdf') {
        processFile(file)
      }
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true
  })

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id))
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Upload Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Document Management
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Upload legal documents for AI-powered analysis and search
            </p>
          </div>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-all duration-200
              ${isDragActive 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }
            `}
          >
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {isDragActive ? 'Drop files here' : 'Drag & drop PDF files'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              or click to browse from your computer
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Maximum file size: 50MB
            </p>
          </div>

          {/* Documents List */}
          <div className="mt-6 space-y-3">
            <AnimatePresence>
              {documents.map(doc => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0">
                        {doc.status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : doc.status === 'error' ? (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        ) : doc.status === 'processing' ? (
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : (
                          <FileText className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                            {doc.filename}
                          </h3>
                          <button
                            onClick={() => removeDocument(doc.id)}
                            className="text-gray-400 hover:text-gray-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {/* Progress Bar */}
                        {(doc.status === 'uploading' || doc.status === 'processing') && (
                          <div className="mt-2">
                            <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div 
                                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${doc.progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {doc.status === 'uploading' ? 'Uploading' : 'Processing'}... {doc.progress}%
                            </p>
                          </div>
                        )}
                        
                        {/* Summary */}
                        {doc.status === 'completed' && doc.summary && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              {doc.totalChunks} chunks processed • 
                              {doc.metadata?.total_pages} pages • 
                              {doc.metadata?.deduplication_ratio 
                                ? ` ${(doc.metadata.deduplication_ratio * 100).toFixed(1)}% deduplication`
                                : ''}
                            </p>
                            <details className="mt-2">
                              <summary className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                                View Summary
                              </summary>
                              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300">
                                {doc.summary}
                              </div>
                            </details>
                          </div>
                        )}
                        
                        {/* Error */}
                        {doc.status === 'error' && (
                          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                            {doc.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {documents.length === 0 && (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                No documents uploaded yet
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}