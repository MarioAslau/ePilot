export class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new HttpError(response.status)
  return response.json()
}
