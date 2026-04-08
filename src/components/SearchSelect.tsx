import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

interface SearchSelectProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  style?: React.CSSProperties
}

/**
 * SearchSelect — Select com campo de busca integrado.
 * Substitui o <Select> do shadcn em situações com muitas opções.
 * Padrão visual consistente com o sistema ConstrutorRH.
 */
export function SearchSelect({
  options, value, onChange, placeholder = 'Selecione…',
  disabled, style, className,
}: SearchSelectProps) {
  const [open, setOpen]       = useState(false)
  const [busca, setBusca]     = useState('')
  const ref                   = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  const filtered = busca.trim()
    ? options.filter(o => o.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .includes(busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')))
    : options

  // Fechar ao clicar fora
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Focar no input ao abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else setBusca('')
  }, [open])

  const label = value || placeholder

  return (
    <div ref={ref} style={{ position: 'relative', ...style }} className={className}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          width: '100%', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px', borderRadius: 6, border: '1px solid hsl(var(--border))',
          background: disabled ? '#f8fafc' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 14, color: value ? 'hsl(var(--foreground))' : '#9ca3af',
          outline: 'none', gap: 6,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        {value ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <X size={12}/>
          </button>
        ) : (
          <ChevronDown size={14} color="#9ca3af" style={{ flexShrink: 0 }}/>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 200, left: 0, right: 0, top: '100%', marginTop: 4,
          background: '#fff', border: '1px solid hsl(var(--border))', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          {/* Campo de busca */}
          <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }}/>
            <input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Pesquisar…"
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent',
                color: 'hsl(var(--foreground))',
              }}
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9ca3af' }}>
                <X size={11}/>
              </button>
            )}
          </div>

          {/* Lista */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                Nenhum resultado
              </div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); setBusca('') }}
                  style={{
                    width: '100%', padding: '9px 14px', textAlign: 'left', fontSize: 13,
                    background: opt === value ? 'hsl(var(--primary)/.08)' : 'transparent',
                    color: opt === value ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                    fontWeight: opt === value ? 600 : 400,
                    border: 'none', cursor: 'pointer', display: 'block',
                    borderBottom: '1px solid #f8fafc',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (opt !== value) (e.target as HTMLElement).style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (opt !== value) (e.target as HTMLElement).style.background = 'transparent' }}
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
