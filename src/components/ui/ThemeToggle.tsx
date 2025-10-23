"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "./button"

const STORAGE_KEY = "specmatch-theme"

type ThemeMode = "light" | "dark"

const ThemeToggle = () => {
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>("light")

  useEffect(() => {
    if (typeof window === "undefined") return

    const root = document.documentElement
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const initial: ThemeMode = stored ?? (prefersDark ? "dark" : "light")

    root.classList.toggle("dark", initial === "dark")
    setTheme(initial)
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark"
    setTheme(next)
    if (typeof window !== "undefined") {
      const root = document.documentElement
      root.classList.toggle("dark", next === "dark")
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  if (!mounted) {
    return (
      <Button type="button" variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

export default ThemeToggle
