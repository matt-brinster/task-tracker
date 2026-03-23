type Props = {
  label: string
}

export default function SectionDivider({ label }: Props) {
  return (
    <div className="flex items-center gap-3 px-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}
