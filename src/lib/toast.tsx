import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

type ToastType = 'success' | 'error'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm shadow-lg backdrop-blur-md animate-slide-in ${
              toast.type === 'error'
                ? 'bg-red-500/20 border border-red-500/30 text-red-700 dark:text-red-200'
                : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-200'
            }`}
          >
            {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            <span className="max-w-xs truncate">{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} className="ml-1 opacity-60 hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
