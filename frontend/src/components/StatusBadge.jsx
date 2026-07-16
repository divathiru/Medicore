const STATUS_MAP = {
  booked: 'booked',
  paid: 'paid',
  in_queue: 'in_queue',
  completed: 'completed',
  cancelled: 'cancelled',
}

const LABELS = {
  booked: 'Booked',
  paid: 'Paid',
  in_queue: 'In Queue',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function StatusBadge({ status }) {
  const cls = STATUS_MAP[status] || 'booked'
  return (
    <span className={`badge badge-${cls}`}>
      {LABELS[status] || status}
    </span>
  )
}
