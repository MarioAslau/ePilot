import { CircleHelp, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { OFFER_RULES, pairTotals } from 'contracts'
import { REDEMPTION_NAME } from '../featureNames'
import { signedPoints } from '../format'
import { EXTENSION_SECONDS, OFFER_SECONDS, WAIT_SECONDS } from '../timing'

const dd = OFFER_RULES.DOUBLE_DOWN.payout
const ddPair = pairTotals(dd)
const rd = OFFER_RULES.REDEMPTION.payout
const rdPair = pairTotals(rd)

interface Props {
  doubleDown?: boolean
  redemption?: boolean
}

function setPageScroll(locked: boolean) {
  document.documentElement.classList.toggle('modal-open', locked)
}

export function HowItWorks({ doubleDown = false, redemption = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const unlock = () => setPageScroll(false)
    el.addEventListener('close', unlock)
    return () => {
      el.removeEventListener('close', unlock)
      setPageScroll(false)
    }
  }, [])

  function open() {
    const el = dialog.current
    if (!el) return
    try {
      el.showModal()
    } catch {
      el.setAttribute('open', '')
    }
    setPageScroll(true)
  }

  function close() {
    const el = dialog.current
    if (!el) return
    if (el.open && typeof el.close === 'function') el.close()
    el.removeAttribute('open')
    setPageScroll(false)
  }

  return (
    <>
      <button type="button" className="help-fab" aria-label="How it works" onClick={open}>
        <CircleHelp className="ic" size={22} aria-hidden="true" />
      </button>
      <dialog ref={dialog} className="how-dialog" aria-labelledby="how-title">
        <div className="how-head">
          <h2 className="h2" id="how-title">How it works</h2>
          <button type="button" className="how-close" aria-label="Close" onClick={close}>
            <X className="ic" size={16} aria-hidden="true" />
          </button>
        </div>
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
              <b>Wait at least {WAIT_SECONDS} seconds</b>
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
          <li>
            <div>
              <b>Your rounds</b>
              Each settled round stays in the list with its direction, entry price, compared price, and point change.
            </div>
          </li>
          {doubleDown && (
            <li>
              <div>
                <b>Double Down</b>
                After a correct standard round, you can play one bonus round in the same direction.
                Your {signedPoints(dd.parentDelta)} stays. A correct bonus adds {dd.win} (pair {signedPoints(ddPair.win)}). A miss subtracts {Math.abs(dd.loss)} (pair {signedPoints(ddPair.loss)}). The offer lasts {OFFER_SECONDS} seconds, and Need more time adds {EXTENSION_SECONDS} seconds.
              </div>
            </li>
          )}
          {redemption && (
            <li>
              <div>
                <b>{REDEMPTION_NAME}</b>
                After a standard loss, the −1 stays. You can choose Up or Down for one fresh round.
                Right adds {rd.win} (pair {signedPoints(rdPair.win)}). Wrong subtracts {Math.abs(rd.loss)} (pair {signedPoints(rdPair.loss)}). Decline or expiry keeps the −1. The offer lasts {OFFER_SECONDS} seconds, and Need more time adds {EXTENSION_SECONDS} seconds.
              </div>
            </li>
          )}
        </ol>
        <div className="rulebox">
          <strong>Rules</strong>
          <ul>
            <li>One active prediction at a time.</li>
            <li>Score starts at 0. No money involved.</li>
            <li>Your score is saved on our server. This browser remembers your anonymous player.</li>
            <li>Prices are for game purposes only — not financial advice.</li>
          </ul>
        </div>
      </dialog>
    </>
  )
}
