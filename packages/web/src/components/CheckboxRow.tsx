import Checkbox from './Checkbox.tsx'

type Props = {
  title: string
  completedAt: string | null
  onCheck: () => void
  onClick: () => void
}

export default function CheckboxRow({ title, completedAt, onCheck, onClick }: Props) {
  const completed = completedAt !== null
  const displayTitle = title || '(unnamed)'
  return (
    <>
      <div className="px-4 pt-2.75 shrink-0">
        <Checkbox
          checked={completed}
          onClick={onCheck}
          displayTitle={displayTitle}
        />
      </div>
      <button
        onClick={onClick}
        className="flex-1 text-left py-2 min-w-0 overflow-hidden"
      >
        <span className="block whitespace-nowrap overflow-hidden [mask-image:linear-gradient(to_right,black_94%,transparent)] text-gray-900">
          {displayTitle}
        </span>
      </button>
    </>
  )
}
