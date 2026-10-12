/** The local dev server's contract with the Vite middleware. Dependency-free so the web project can import it. */
export type DevFault = 'drop-response' | 'provider-down'

export interface LocalResult {
  statusCode: number
  body?: string
}

export interface LocalApp {
  consumeFault(): DevFault | null
  handle(
    method: string,
    path: string,
    authorization: string | undefined,
    rawBody: string | undefined,
    fault?: DevFault | null,
    query?: Record<string, string | undefined>,
  ): Promise<LocalResult | null>
}
