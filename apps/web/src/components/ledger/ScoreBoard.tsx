import type { RefObject } from 'react'
import { scoreSeries } from '../../state/history'

function ScoreChart({ current, deltas }: { current: number; deltas: number[] }) {
  const series = scoreSeries(current, deltas)
  const rounds = deltas.length
  const min = Math.min(0, ...series)
  const max = Math.max(0, ...series)
  const span = max - min || 1
  const width = 240
  const height = 48
  const yOf = (value: number) => 6 + (1 - (value - min) / span) * (height - 12)
  const xOf = (index: number) => (index / (series.length - 1 || 1)) * width
  let path = `M 0 ${yOf(series[0] ?? 0)}`
  series.forEach((value, index) => {
    if (index === 0) return
    path += ` H ${xOf(index)} V ${yOf(value)}`
  })
  const zeroY = yOf(0)
  const from = series[0] ?? current
  const to = series[series.length - 1] ?? current
  return (
    <div className="score-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Score over your last ${rounds} rounds, from ${from} to ${to}`}>
        <line className="score-zero" x1="0" y1={zeroY} x2={width} y2={zeroY} />
        <text className="score-zero-label" x="2" y={zeroY < 12 ? zeroY + 9 : zeroY - 3}>0</text>
        <path d={path} fill="none" stroke="#D5DAE1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="score-dot" style={{ top: `${(yOf(to) / height) * 100}%` }} />
      <div className="spark-axis">
        <span>{rounds} rounds ago</span>
        <span>Now</span>
      </div>
    </div>
  )
}

export function ScoreBoard({
  score,
  wins,
  losses,
  flash,
  stale,
  deltas,
  scoreRef,
}: {
  score: number
  wins: number
  losses: number
  flash: 'win' | 'loss' | null
  stale: boolean
  /** Listed round deltas, newest first. */
  deltas: number[]
  scoreRef: RefObject<HTMLDivElement>
}) {
  const settled = wins + losses
  const accuracy = settled > 0 ? Math.round((wins / settled) * 100) : null
  const scoreClass = ['score-num num', score < 0 ? 'neg' : '', flash ? `flash-${flash}` : ''].filter(Boolean).join(' ')

  return (
    <div className="ledger-score" ref={scoreRef}>
      <div className="score-board">
        <div>
          <h2 className="label" id="ledger-title">{stale ? 'Last confirmed' : 'Your score'}</h2>
          <div className={scoreClass} aria-label={stale ? `Last confirmed score: ${score}` : `Score: ${score}`}>
            {score > 0 ? `+${score}` : score}
          </div>
        </div>
        {settled > 0 && (
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
        )}
      </div>
      {settled === 0 && (
        <p className="fine score-start">Everyone starts at 0, and scores can go below zero. Saved to this browser, no account needed.</p>
      )}
      {deltas.length >= 2 && <ScoreChart current={score} deltas={deltas} />}
    </div>
  )
}
