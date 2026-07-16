export default function LoadingSpinner({ fullPage = false }) {
  if (fullPage) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }
  return (
    <div className="spinner-wrapper">
      <div className="spinner" />
    </div>
  )
}
