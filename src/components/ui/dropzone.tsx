import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "./button"

type DropZoneProps = {
  onFile: (file: File | null) => void
  disabled?: boolean
  className?: string
}

const DropZone = ({ onFile, disabled = false, className }: DropZoneProps) => {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = React.useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      onFile(null)
      return
    }
    const file = files[0]
    if (file.type !== "application/pdf") {
      onFile(null)
      return
    }
    onFile(file)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    setIsDragActive(false)
    handleFiles(event.dataTransfer?.files ?? null)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (disabled) return
    setIsDragActive(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (disabled) return
    setIsDragActive(false)
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    handleFiles(event.target.files)
    event.target.value = ""
  }

  return (
    <div
      role="presentation"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/50 p-6 text-center text-sm transition",
        isDragActive && "border-primary bg-primary/5",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />
      <p className="font-medium">Drag & drop your resume PDF</p>
      <p className="text-muted-foreground mt-1">or</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="mt-3"
      >
        Select file
      </Button>
    </div>
  )
}

export { DropZone }
