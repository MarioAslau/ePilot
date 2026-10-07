import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'

// In dev, load the fixture runner if ?fixture= is present in the URL.
// The conditional import keeps the fixture system out of production builds.
async function boot() {
  const rootEl = document.getElementById('root')!

  if (import.meta.env.DEV && new URLSearchParams(location.search).get('fixture')) {
    const { FixtureApp } = await import('./FixtureApp')
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <FixtureApp />
      </React.StrictMode>,
    )
    return
  }

  const { App } = await import('./App')
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

boot()
