

export interface ThemeDef {
  id: string
  name: string
  
  dark: boolean
  
  vars?: Record<string, string>
  
  className?: string
}

export const THEMES: ThemeDef[] = [
  { id: 'dark', name: 'Midnight', dark: true },
  { id: 'light', name: 'Ivory', dark: false },
  
  {
    id: 'baldi-black',
    name: 'Baldi Orange • Black',
    dark: true,
    vars: {
      '--primary': '26 85% 55%',
      '--primary-foreground': '0 0% 100%',
      '--ring': '26 90% 60%',
      '--accent': '26 55% 20%'
    }
  },
  {
    id: 'baldi-white',
    name: 'Baldi Orange • White',
    dark: false,
    vars: {
      '--primary': '26 85% 42%',
      '--primary-foreground': '0 0% 100%',
      '--ring': '26 85% 50%',
      '--accent': '26 55% 92%'
    }
  },
  {
    id: 'purple-black',
    name: 'Neon Purple • Black',
    dark: true,
    vars: {
      '--primary': '271 91% 62%',
      '--primary-foreground': '0 0% 100%',
      '--ring': '271 91% 66%',
      '--accent': '271 55% 20%'
    }
  },
  {
    id: 'purple-white',
    name: 'Neon Purple • White',
    dark: false,
    vars: {
      '--primary': '271 80% 45%',
      '--primary-foreground': '0 0% 100%',
      '--ring': '271 78% 52%',
      '--accent': '271 55% 92%'
    }
  },
  {
    id: 'ocean-black',
    name: 'Deep Ocean • Black',
    dark: true,
    vars: {
      '--primary': '220 90% 60%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '220 90% 64%',
      '--accent': '220 55% 18%'
    }
  },
  {
    id: 'ocean-white',
    name: 'Deep Ocean • White',
    dark: false,
    vars: {
      '--primary': '220 85% 42%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '220 85% 50%',
      '--accent': '220 60% 92%'
    }
  },
  {
    id: 'forest-black',
    name: 'Forest • Black',
    dark: true,
    vars: {
      '--primary': '150 60% 42%',
      '--primary-foreground': '0 0% 98%',
      '--ring': '150 60% 48%',
      '--accent': '150 45% 16%'
    }
  },
  {
    id: 'forest-white',
    name: 'Forest • White',
    dark: false,
    vars: {
      '--primary': '150 60% 34%',
      '--primary-foreground': '0 0% 98%',
      '--ring': '150 62% 40%',
      '--accent': '150 45% 90%'
    }
  },
  {
    id: 'rose-black',
    name: 'Rose Candy • Black',
    dark: true,
    vars: {
      '--primary': '340 85% 60%',
      '--primary-foreground': '0 0% 100%',
      '--ring': '340 85% 64%',
      '--accent': '340 50% 20%'
    }
  },
  {
    id: 'rose-white',
    name: 'Rose Candy • White',
    dark: false,
    vars: {
      '--primary': '340 75% 45%',
      '--primary-foreground': '0 0% 100%',
      '--ring': '340 80% 52%',
      '--accent': '340 55% 92%'
    }
  },
  {
    id: 'baldi-school',
    name: 'Baldi School',
    dark: false,
    className: 'theme-baldi-school',
    vars: {
      '--background': '45 40% 92%',
      '--foreground': '30 25% 14%',
      '--card': '42 42% 90%',
      '--card-foreground': '30 25% 14%',
      '--popover': '42 42% 92%',
      '--popover-foreground': '30 25% 14%',
      '--primary': '210 40% 38%',
      '--primary-foreground': '0 0% 98%',
      '--secondary': '200 30% 80%',
      '--secondary-foreground': '30 25% 14%',
      '--muted': '45 28% 80%',
      '--muted-foreground': '28 14% 32%',
      '--accent': '35 55% 60%',
      '--accent-foreground': '30 25% 12%',
      '--destructive': '0 78% 56%',
      '--destructive-foreground': '0 0% 98%',
      '--border': '205 35% 42%',
      '--input': '205 35% 48%',
      '--ring': '210 45% 40%'
    }
  }
]

const VARIABLE_KEYS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring'
] as const

export function findTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}


export function applyThemeToDom(id: string): void {
  const def = findTheme(id)
  const root = document.documentElement
  root.classList.toggle('dark', def.dark)
  const style = root.style
  for (const k of VARIABLE_KEYS) {
    const v = def.vars?.[k]
    if (v !== undefined) style.setProperty(k, v)
    else style.removeProperty(k)
  }
  for (const t of THEMES) {
    if (t.className) root.classList.remove(t.className)
  }
  if (def.className) root.classList.add(def.className)
}