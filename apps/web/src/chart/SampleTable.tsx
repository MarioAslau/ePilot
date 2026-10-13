import { useState } from 'react'
import { readout, type ChartRound } from './model'
import type { PriceSample } from './samples'

/**
 * "View as table": the samples in view, newest first, as rows of time, price and move against the entry.
 * Rows are built only while it is open.
 */
export function SampleTable({ samples, round }: { samples: PriceSample[]; round?: ChartRound }) {
  const [open, setOpen] = useState(false)
  const rows = open ? [...samples].reverse() : []
  return (
    <details className="ch-table" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>View as table</summary>
      {open && (
        rows.length === 0 ? <p className="fine">No prices in this view yet.</p> : (
          <div className="ch-table-scroll">
            <table>
              <caption className="sr-only">{round ? 'Prices during this round, newest first' : 'Prices over the last 2 minutes, newest first'}</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Price</th>
                  {round && <th scope="col">Vs entry</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((sample) => {
                  const row = readout(sample, round)
                  const vs = row.vs
                  return (
                    <tr key={sample.time}>
                      <td>{row.time}</td>
                      <td className="num">{row.price}</td>
                      {round && (
                        <td className={vs && vs !== 'before' ? `num stance ${vs.tone}` : 'muted'}>
                          {vs === 'before' ? 'Before entry' : vs ? `${vs.up === null ? '' : vs.up ? '+' : '−'}${vs.amount}` : ''}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </details>
  )
}
