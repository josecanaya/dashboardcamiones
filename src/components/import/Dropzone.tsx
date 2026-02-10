import { useCallback, useState } from 'react'

interface DropzoneProps {
  onFile: (file: File) => void
  accept?: string
}

export function Dropzone({ onFile, accept = '.csv,.xlsx,.xls' }: DropzoneProps) {
  const [drag, setDrag] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDrag(false)
      const f = e.dataTransfer.files[0]
      if (f) onFile(f)
    },
    [onFile]
  )
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDrag(true)
  }, [])
  const handleDragLeave = useCallback(() => setDrag(false), [])
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) onFile(f)
      e.target.value = ''
    },
    [onFile]
  )

  return (
    <label
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        drag ? 'border-primary-500 bg-primary-100/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
      }`}
    >
      <input type="file" accept={accept} onChange={handleChange} className="hidden" />
      <span className="text-slate-600">
        Arrastrá un archivo <strong>CSV</strong> o <strong>Excel</strong> aquí, o hacé click para elegir.
      </span>
    </label>
  )
}
