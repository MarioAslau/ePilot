interface Props {
  score: number
}

/**
 * Top navigation bar: Hunch wordmark + score chip (mobile-only, hidden at desk breakpoint).
 * Matches the appbar + wordmark + chip pattern in the design system.
 */
export function AppHeader({ score }: Props) {
  return (
    <header className="appbar">
      <a href="/" className="wordmark" aria-label="Hunch — home">
        {/* Simple H-mark logo placeholder */}
        <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect width="28" height="28" rx="7" fill="#F2C14E" />
          <path d="M7 7v14M21 7v14M7 14h14" stroke="#1A1408" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
        Hunch
      </a>

      <div className="appbar-right">
        {/* Score chip — visible on mobile, hidden at 960 px (shown in ScoreCard on desktop) */}
        <div className="chip chip-score" aria-label={`Score: ${score}`}>
          <span className="chip-long">Score</span>
          <strong className="num">{score}</strong>
        </div>
      </div>
    </header>
  )
}
