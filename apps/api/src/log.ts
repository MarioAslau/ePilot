/** One structured log line per event. Never pass tokens or hashes. */
export function log(event: string, fields: Record<string, string | number | undefined> = {}): void {
  console.log(JSON.stringify({ event, ...fields }))
}
