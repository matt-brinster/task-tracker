type Props = {
  onClick: () => void
  className?: string
}

export default function ParentBackButton({ onClick, className = '' }: Props) {
  return (
    <button
      onClick={onClick}
      className={`text-gray-600 hover:text-gray-900 ${className}`}
      aria-label="Back to parent task"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
