import { forwardRef, type InputHTMLAttributes, useState } from 'react'
import { cn } from '@/lib/utils'

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  min?: number
  max?: number
  step?: number
  value?: number
  showValue?: boolean
  valueFormatter?: (value: number) => string
  onChange?: (value: number) => void
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      label,
      min = 1,
      max = 10,
      step = 1,
      value: controlledValue,
      showValue = true,
      valueFormatter,
      onChange,
      id,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(controlledValue ?? min)
    const value = controlledValue ?? internalValue

    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value)
      setInternalValue(newValue)
      onChange?.(newValue)
    }

    const displayValue = valueFormatter ? valueFormatter(value) : value

    // Calculate percentage for gradient
    const percentage = ((value - min) / (max - min)) * 100

    return (
      <div className="space-y-2">
        {(label || showValue) && (
          <div className="flex items-center justify-between">
            {label && (
              <label
                htmlFor={inputId}
                className="text-sm font-medium text-foreground"
              >
                {label}
              </label>
            )}
            {showValue && (
              <span className="text-sm font-mono font-semibold text-primary">
                {displayValue}
              </span>
            )}
          </div>
        )}
        <div className="relative">
          <input
            type="range"
            id={inputId}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            className={cn(
              'w-full h-2 rounded-full appearance-none cursor-pointer',
              'bg-secondary',
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:w-5',
              '[&::-webkit-slider-thumb]:h-5',
              '[&::-webkit-slider-thumb]:rounded-full',
              '[&::-webkit-slider-thumb]:bg-primary',
              '[&::-webkit-slider-thumb]:shadow-lg',
              '[&::-webkit-slider-thumb]:transition-transform',
              '[&::-webkit-slider-thumb]:hover:scale-110',
              '[&::-webkit-slider-thumb]:active:scale-95',
              '[&::-moz-range-thumb]:w-5',
              '[&::-moz-range-thumb]:h-5',
              '[&::-moz-range-thumb]:rounded-full',
              '[&::-moz-range-thumb]:bg-primary',
              '[&::-moz-range-thumb]:border-0',
              '[&::-moz-range-thumb]:shadow-lg',
              className
            )}
            style={{
              background: `linear-gradient(to right, rgb(249 115 22) 0%, rgb(249 115 22) ${percentage}%, rgb(39 39 42) ${percentage}%, rgb(39 39 42) 100%)`,
            }}
            ref={ref}
            {...props}
          />
        </div>
        {/* Scale markers */}
        <div className="flex justify-between px-1">
          <span className="text-xs text-muted-foreground">{min}</span>
          <span className="text-xs text-muted-foreground">{max}</span>
        </div>
      </div>
    )
  }
)

Slider.displayName = 'Slider'

export { Slider }
