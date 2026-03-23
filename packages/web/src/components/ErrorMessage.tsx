type Props = {
  message: string
}

export default function ErrorMessage({ message }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center text-red-500 px-4">
      <p>{message}</p>
    </div>
  )
}
