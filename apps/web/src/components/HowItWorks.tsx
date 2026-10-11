import { ChevronDown } from 'lucide-react'

/**
 * Collapsible explainer using a native <details> element.
 * No JS state — the browser handles open/close for free.
 */
export function HowItWorks() {
  return (
    <section className="card">
      <details className="how">
        <summary>
          How it works
          <ChevronDown className="ic" size={18} aria-hidden="true" />
        </summary>

        <ol className="howsteps">
          <li>
            <div>
              <b>See the live price</b>
              The current BTC/USD rate from Coinbase Exchange updates every few seconds.
            </div>
          </li>
          <li>
            <div>
              <b>Make your call</b>
              Tap <em>Up</em> or <em>Down</em>. We lock in the current price as your entry price.
            </div>
          </li>
          <li>
            <div>
              <b>Wait at least 60 seconds</b>
              Once the deadline passes, we fetch the next trade price that differs from your entry.
            </div>
          </li>
          <li>
            <div>
              <b>Score</b>
              Correct call adds 1 point. Wrong call subtracts 1.
              If the price is still equal, we retry until it moves.
            </div>
          </li>
        </ol>

        <div className="rulebox">
          <strong>Rules</strong>
          <ul style={{ marginTop: 6, paddingLeft: 14, listStyle: 'disc', color: 'var(--muted)', fontSize: 'var(--t-small)' }}>
            <li>One active prediction at a time.</li>
            <li>Score starts at 0. No money involved.</li>
            <li>Your anonymous session is saved in this browser.</li>
            <li>Prices are for game purposes only — not financial advice.</li>
          </ul>
        </div>
      </details>
    </section>
  )
}
