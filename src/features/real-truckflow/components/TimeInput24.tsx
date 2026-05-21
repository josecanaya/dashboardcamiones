type TimeInput24Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

/** Campo HH:MM en 24 h (sin AM/PM del navegador). */
export function TimeInput24({
  value,
  onChange,
  disabled,
  placeholder = '00:00',
  className = 'mt-1 block w-[5.5rem] rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 disabled:bg-slate-100',
}: TimeInput24Props) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      maxLength={5}
      title="Formato 24 h: HH:MM"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    />
  )
}
