import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patientsApi } from '../../api/patients.js'
import ErrorMessage from '../../components/ErrorMessage.jsx'

export default function UploadSummary() {
  const qc = useQueryClient()
  const [file, setFile] = useState(null)
  const [extractedText, setExtractedText] = useState('')
  const [sourceHospital, setSourceHospital] = useState('')
  const [success, setSuccess] = useState(false)
  const fileRef = useRef()

  const mutation = useMutation({
    mutationFn: (formData) => patientsApi.uploadSummary(formData),
    onSuccess: () => {
      setSuccess(true)
      setFile(null)
      setExtractedText('')
      setSourceHospital('')
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setSuccess(false), 5000)
    },
  })

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    setFile(f || null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!extractedText.trim()) return

    const fd = new FormData()
    fd.append('extracted_text', extractedText.trim())
    if (sourceHospital.trim()) fd.append('source_hospital', sourceHospital.trim())
    if (file) fd.append('file', file)
    mutation.mutate(fd)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Upload Medical Records</h1>
        <p>Share previous hospital records so your doctor's AI can access your full medical history.</p>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="info-box" style={{ marginBottom: '1.5rem' }}>
          <strong>How this works:</strong> Paste the text content from your old medical reports below.
          The AI assistant will use this to provide context during your doctor consultation.
        </div>

        {mutation.isError && <ErrorMessage message={mutation.error.message} />}
        {success && (
          <div className="info-box" style={{ marginBottom: '1rem', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46' }}>
            ✓ Medical record uploaded and sent to AI for indexing!
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="upload-hospital">Source hospital / clinic (optional)</label>
            <input
              id="upload-hospital"
              className="form-input"
              placeholder="e.g. City General Hospital"
              value={sourceHospital}
              onChange={(e) => setSourceHospital(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upload-text">
              Medical record text <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <textarea
              id="upload-text"
              className={`form-input form-textarea${!extractedText.trim() && mutation.isError ? ' error' : ''}`}
              rows={8}
              placeholder="Paste the full text of your medical report here (lab results, discharge summaries, prescriptions, etc.)…"
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              required
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--neutral-400)' }}>
              {extractedText.length} characters
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upload-file">Attach file (optional — PDF/JPEG/PNG, max 20MB)</label>
            <input
              id="upload-file"
              ref={fileRef}
              className="form-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              style={{ padding: '0.45rem' }}
            />
            {file && <span style={{ fontSize: '0.8125rem', color: 'var(--teal-700)' }}>📎 {file.name}</span>}
          </div>

          <button
            id="upload-submit"
            type="submit"
            className="btn btn-primary"
            disabled={mutation.isPending || !extractedText.trim()}
          >
            {mutation.isPending ? 'Uploading…' : 'Upload Record'}
          </button>
        </form>
      </div>
    </div>
  )
}
