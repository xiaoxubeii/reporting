import Link from 'next/link'

export function TodayViewTabs({ active }: { active: 'me' | 'explore' }) {
  return (
    <nav className="mt-4 flex gap-6" aria-label="Today view">
      <Link
        href="/feeds"
        aria-current={active === 'me' ? 'page' : undefined}
        className={`border-b-2 px-1 py-2 text-sm font-medium ${active === 'me' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
      >Me</Link>
      <Link
        href="/feeds?view=explore"
        aria-current={active === 'explore' ? 'page' : undefined}
        className={`border-b-2 px-1 py-2 text-sm font-medium ${active === 'explore' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
      >Explore</Link>
    </nav>
  )
}
