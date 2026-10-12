/** Element ids that announcements move focus to. Components that render them import these. */
export const PLAY_TITLE_ID = 'play-title'
export const RECEIPT_HEADING_ID = 'receipt-heading'

export function focusById(id: string): void {
  document.getElementById(id)?.focus()
}
