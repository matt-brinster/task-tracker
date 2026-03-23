type Props = {
  checked: boolean
  onClick: () => void
  displayTitle: string
}

export default function Checkbox({ checked, onClick, displayTitle }: Props) {
  const label = checked ? `Reopen "${displayTitle}"` : `Complete "${displayTitle}"`
  return (
    <button onClick={onClick} aria-label={label}>
      <span className={`inline-block w-5 h-5 border-2 rounded ${
        checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
      }`}>
        {checked && (
          <svg className="w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </span>
    </button>
  )
}
