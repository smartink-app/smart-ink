import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import LandingPage from './LandingPage'
import LoginPage from './LoginPage'
import InvitePage from './InvitePage'
import InviteCodeEntry from './InviteCodeEntry'
import BetaAdminPage from './BetaAdminPage'
import { useBetaAuth } from './auth/useBetaAuth'
import { authMode } from './auth/betaAuthService'
import type { BetaSession } from './auth/types'

/**
 * The workspace (scene list + editor) pulls in three.js, drei and the storage
 * layers. Loading it lazily keeps the landing and login pages light; the
 * public page uses actual render images; the 3D editor loads after approval.
 */
const Workspace = lazy(() => import('./Workspace'))
const ArtistDiscovery = lazy(() => import('./discovery/ArtistDiscovery'))

type GateView = 'landing' | 'artists' | 'login' | 'invite' | 'invite-code' | 'admin' | 'app'

function initialGateView(): { view: GateView; inviteCode: string | null } {
  if (typeof window === 'undefined') return { view: 'landing', inviteCode: null }
  const params = new URLSearchParams(window.location.search)
  if (params.get('admin') === '1') return { view: 'admin', inviteCode: null }
  const invite = params.get('invite')?.trim().toUpperCase() ?? null
  if (invite) return { view: 'invite', inviteCode: invite }
  if (params.get('view') === 'artists') return { view: 'artists', inviteCode: null }
  return { view: 'landing', inviteCode: null }
}

function App() {
  const betaAuth = useBetaAuth()
  const [gateView, setGateView] = useState<GateView>(() => initialGateView().view)
  const [inviteCode, setInviteCode] = useState<string | null>(() => initialGateView().inviteCode)
  const bootedRef = useRef(false)

  // Once the backend has reported the initial session, route past the landing
  // page: straight into the app for a signed-in user, or to the login page
  // with a reason when someone came back from Google without beta access.
  useEffect(() => {
    if (!betaAuth.ready || bootedRef.current) return
    bootedRef.current = true
    const boot = initialGateView()
    if (boot.view === 'invite' || boot.view === 'admin' || boot.view === 'artists') return
    if (betaAuth.session) setGateView('app')
    else if (betaAuth.accessError) setGateView('login')
  }, [betaAuth.ready, betaAuth.session, betaAuth.accessError])

  // Signed out from another tab or via "sign out everywhere".
  useEffect(() => {
    if (betaAuth.ready && gateView === 'app' && !betaAuth.session) setGateView('landing')
  }, [betaAuth.ready, betaAuth.session, gateView])

  const clearInviteQuery = useCallback(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('invite') || url.searchParams.has('admin') || url.searchParams.has('demo') || url.searchParams.has('view')) {
      url.searchParams.delete('invite')
      url.searchParams.delete('admin')
      url.searchParams.delete('demo')
      url.searchParams.delete('view')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
  }, [])

  const setBetaSession = betaAuth.setSession
  const enterApp = useCallback(
    (session?: BetaSession | null) => {
      if (session) setBetaSession(session)
      clearInviteQuery()
      setGateView('app')
    },
    [setBetaSession, clearInviteQuery]
  )

  const clearAccessError = betaAuth.clearAccessError
  const goHome = useCallback(() => {
    clearInviteQuery()
    clearAccessError()
    setGateView('landing')
  }, [clearInviteQuery, clearAccessError])

  const exploreArtists = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'artists')
    window.history.replaceState({}, '', url.pathname + url.search)
    setGateView('artists')
  }

  const betaSignOut = betaAuth.signOut
  const signOut = useCallback(
    async (opts?: { everywhere?: boolean }) => {
      await betaSignOut(opts)
      goHome()
    },
    [betaSignOut, goHome]
  )

  if (!betaAuth.ready) {
    return <div className="app-loading">Checking access…</div>
  }

  if (gateView === 'landing') {
    return <LandingPage signedIn={!!betaAuth.session} onExploreArtists={exploreArtists} onNavigateToLogin={() => betaAuth.session ? enterApp() : setGateView('login')} />
  }

  if (gateView === 'artists') {
    return <Suspense fallback={<div className="app-loading">Finding your next artist…</div>}>
      <ArtistDiscovery signedIn={!!betaAuth.session} onHome={goHome} onStudio={() => { clearInviteQuery(); if (betaAuth.session) enterApp(); else setGateView('login') }} />
    </Suspense>
  }

  if (gateView === 'admin') {
    return (
      <BetaAdminPage
        mode={authMode()}
        session={betaAuth.session}
        unlocked={betaAuth.isAdmin}
        waitlist={betaAuth.waitlist}
        invites={betaAuth.invites}
        activeEmails={betaAuth.activeEmails}
        loadError={betaAuth.adminError}
        onUnlock={betaAuth.unlockAdmin}
        onLock={betaAuth.lockAdmin}
        onRefresh={betaAuth.refreshAdminData}
        onBack={goHome}
        onGoLogin={() => setGateView('login')}
        onSignOut={() => void signOut()}
      />
    )
  }

  if (gateView === 'invite-code') {
    return (
      <InviteCodeEntry
        onBack={() => setGateView('login')}
        onContinue={(code) => {
          setInviteCode(code)
          setGateView('invite')
        }}
      />
    )
  }

  if (gateView === 'invite' && inviteCode) {
    return <InvitePage code={inviteCode} onBack={goHome} onAuthenticated={enterApp} />
  }

  if (gateView === 'login' || (gateView === 'invite' && !inviteCode)) {
    return (
      <LoginPage
        onAuthenticated={enterApp}
        onBackToLanding={goHome}
        onOpenInvite={() => setGateView('invite-code')}
        notice={betaAuth.accessError}
      />
    )
  }

  const session = betaAuth.session
  if (!session) {
    return <LandingPage signedIn={!!betaAuth.session} onExploreArtists={exploreArtists} onNavigateToLogin={() => betaAuth.session ? enterApp() : setGateView('login')} />
  }

  return (
    <Suspense fallback={<div className="app-loading">Loading Smart Ink…</div>}>
      <Workspace session={session} onHome={goHome} onSignOut={(opts) => void signOut(opts)} />
    </Suspense>
  )
}

export default App
