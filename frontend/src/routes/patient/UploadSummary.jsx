import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patientsApi } from '../../api/patients.js'
import ErrorMessage from '../../components/ErrorMessage.jsx'

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.md'
const MAX_PREVIEW_CHARS = 800

export default function UploadSummary() {
  const qc = useQueryClient()
  const [file, setFile] = useState(null)
  const [sourceHospital, setSourceHospital] = useState('')
  const [preview, setPreview] = useState(null)   // { extracted_text, filename }
  const fileRef = useRef()

  const mutation = useMutation({
    mutationFn: (formData) => patientsApi.uploadSummary(formData),
    onSuccess: (data) => {
      setPreview({
        extracted_text: data.extracted_text || '',
        filename: file?.name || 'file',
      })
      setFile(null)
      setSourceHospital('')
      if (fileRef.current) fileRef.current.value = ''
      qc.invalidateQueries({ queryKey: ['summaries'] })
    },
  })

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null)
    setPreview(null)         // clear old preview when a new file is chosen
    mutation.reset()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)
    if (sourceHospital.trim()) fd.append('source_hospital', sourceHospital.trim())
    mutation.mutate(fd)
  }

  const previewSnippet = preview
    ? preview.extracted_text.length > MAX_PREVIEW_CHARS
      ? preview.extracted_text.slice(0, MAX_PREVIEW_CHARS) + '…'
      : preview.extracted_text
    : null

  return (
    <div>
      <div className="page-header">
        <h1>Upload Medical Records</h1>
        <p>
          Upload a previous hospital report and MediCore will extract and index
          its contents so your doctor's AI can access your full medical history.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="info-box" style={{ marginBottom: '1.5rem' }}>
          <strong>Supported formats:</strong> PDF, DOCX, TXT, MD — up to 20 MB.
          Text is extracted automatically on the server; you don't need to paste anything.
        </div>

        {mutation.isError && <ErrorMessage message={mutation.error?.message || 'Upload failed.'} />}

        {/* ── Success preview ─────────────────────────────────────────── */}
        {preview && (
          <div
            style={{
              marginBottom: '1.5rem',
              borderRadius: '0.75rem',
              border: '1px solid #A7F3D0',
              background: '#ECFDF5',
              padding: '1.25rem',
            }}
          >
            <p style={{ fontWeight: 600, color: '#065F46', marginBottom: '0.5rem' }}>
              ✓ "{preview.filename}" uploaded and indexed!
            </p>
            <p style={{ fontSize: '0.8125rem', color: '#047857', marginBottom: '0.5rem' }}>
              Extracted text preview:
            </p>
            <pre
              style={{
                fontSize: '0.78rem',
                color: '#065F46',
                background: '#D1FAE5',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 220,
                overflowY: 'auto',
                fontFamily: 'ui-monospace, monospace',
                margin: 0,
              }}
            >
              {previewSnippet || '(no text extracted)'}
            </pre>
            {preview.extracted_text.length > MAX_PREVIEW_CHARS && (
              <p style={{ fontSize: '0.75rem', color: '#6EE7B7', marginTop: '0.4rem' }}>
                Showing first {MAX_PREVIEW_CHARS} of {preview.extracted_text.length} characters.
              </p>
            )}
          </div>
        )}

        {/* ── Upload form ─────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="upload-hospital">
              Source hospital / clinic <span style={{ color: 'var(--neutral-400)' }}>(optional)</span>
            </label>
            <input
              id="upload-hospital"
              className="form-input"
              placeholder="e.g. City General Hospital"
              value={sourceHospital}
              onChange={(e) => setSourceHospital(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upload-file">
              Medical record file <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              id="upload-file"
              ref={fileRef}
              className="form-input"
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileChange}
              style={{ padding: '0.45rem' }}
              required
            />
            {file && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--teal-700)', marginTop: '0.25rem', display: 'block' }}>
                📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </span>
            )}
            <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
              PDF, DOCX, TXT or MD · max 20 MB
            </span>
          </div>

          <button
            id="upload-submit"
            type="submit"
            className="btn btn-primary"
            disabled={mutation.isPending || !file}
          >
            {mutation.isPending ? 'Uploading & extracting…' : 'Upload Record'}
          </button>
        </form>
      </div>
    </div>
  )
}
