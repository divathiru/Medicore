export default function ErrorMessage({ message, onRetry }) {
  return (
    <div className="error-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
      <span>⚠ {message || 'Something went wrong.'}</span>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
