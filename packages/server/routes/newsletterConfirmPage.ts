function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function renderConfirmPage(input: { token: string; email: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Confirm your subscription</title></head><body style="font-family:sans-serif;padding:2rem"><h1>Confirm your subscription</h1><p>Click the button to confirm your Listening Room newsletter subscription.</p><form method="post" action="/api/newsletter/confirm"><input type="hidden" name="token" value="${escapeHtml(input.token)}"><input type="hidden" name="email" value="${escapeHtml(input.email)}"><button type="submit" style="font-size:1rem;padding:0.75rem 1.5rem;cursor:pointer">Confirm subscription</button></form></body></html>`
}
