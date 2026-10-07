interface Props {
  score: number
  wins: number
  losses: number
  /** Flash class applied briefly after settlement: 'win' | 'loss' | null */
  flash?: 'win' | 'loss' | null
}

/**
 * Right-column score display.
 * Shows total score + win/loss counts + accuracy percentage (after ≥1 settled round).
 * Accuracy % is display-only; score is the game currency.
 */
export function ScoreCard({ score, wins, losses, flash }: Props) {
  const settled = wins + losses
  const accuracy = settled > 0
    ? Math.round((wins / settled) * 100)
    : null

  const scoreClass = [
    'score-num num',
    score < 0 ? 'neg' : '',
    flash === 'win'  ? 'flash-win'  : '',
    flash === 'loss' ? 'flash-loss' : '',
  ].filter(Boolean).join(' ')

  return (
    <section className="card" aria-label="Your score">
      <p className="label">Your score</p>

      <div className="score-row">
        <div>
          <div
            className={scoreClass}
            aria-live="polite"
            aria-atomic="true"
            aria-label={`Score: ${score} point${score === 1 ? '' : 's'}`}
          >
            {score > 0 ? `+${score}` : score}
          </div>
        </div>

        <div className="score-stats">
          <div>
            <span className="fine">Correct</span>
            <b className="num up-t">{wins}</b>
          </div>
          <div>
            <span className="fine">Wrong</span>
            <b className="num down-t">{losses}</b>
          </div>
          {accuracy !== null && (
            <div>
              <span className="fine">Accuracy</span>
              <b className="num">{accuracy}%</b>
            </div>
          )}
        </div>
      </div>

      {settled === 0 && (
        <p className="fine" style={{ marginTop: 8 }}>
          Make your first prediction to start scoring.
        </p>
      )}
    </section>
  )
}
