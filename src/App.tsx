import type { PortfolioImage } from './discovery/artists'
import type { StudioSection } from './StudioRail'
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
const MoodboardPortal = lazy(() => import('./moodboard/MoodboardPortal'))

type GateView = 'landing' | 'artists' | 'moodboard' | 'client' | 'login' | 'invite' | 'invite-code' | 'admin' | 'app'

function initialGateView(): { view: GateView; inviteCode: string | null } {
  if (typeof window === 'undefined') return { view: 'landing', inviteCode: null }
  const params = new URLSearchParams(window.location.search)
  if (params.get('admin') === '1') return { view: 'admin', inviteCode: null }
  const invite = params.get('invite')?.trim().toUpperCase() ?? null
  if (invite) return { view: 'invite', inviteCode: invite }
  if (params.get('view') === 'client') return { view: 'client', inviteCode: null }
  if (params.get('view') === 'moodboard') return { view: 'moodboard', inviteCode: null }
  if (params.get('view') === 'artists') return { view: 'artists', inviteCode: null }
  return { view: 'landing', inviteCode: null }
}

function App() {
  const betaAuth = useBetaAuth()
  const [gateView, setGateView] = useState<GateView>(() => initialGateView().view)
  const [inviteCode, setInviteCode] = useState<string | null>(() => initialGateView().inviteCode)
  const bootedRef = useRef(false)
  const returnToClient = useRef(initialGateView().view === 'client')
  const [clientProjectId, setClientProjectId] = useState<string | undefined>()
  const returnToMoodboard = useRef(initialGateView().view === 'moodboard')
  const [pendingInspiration, setPendingInspiration] = useState<PortfolioImage | null>(null)
  const [workspaceSection, setWorkspaceSection] = useState<StudioSection>(initialGateView().view === 'client' ? 'client' : 'projects')

  // Once the backend has reported the initial session, route past the landing
  // page: straight into the app for a signed-in user, or to the login page
  // with a reason when someone came back from Google without beta access.
  useEffect(() => {
    if (!betaAuth.ready || bootedRef.current) return
    bootedRef.current = true
    const boot = initialGateView()
    if (boot.view === 'invite' || boot.view === 'admin' || boot.view === 'artists' || boot.view === 'moodboard' || boot.view === 'client') return
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
      if (returnToClient.current) {
        clearInviteQuery()
        const url = new URL(window.location.href); url.searchParams.set('view', 'client')
        window.history.replaceState({}, '', url.pathname + url.search)
        setWorkspaceSection('client'); setGateView('client'); return
      }
      if (returnToMoodboard.current) {
        clearInviteQuery()
        const url = new URL(window.location.href); url.searchParams.set('view', 'moodboard')
        window.history.replaceState({}, '', url.pathname + url.search)
        setGateView('moodboard'); return
      }
      clearInviteQuery()
      setGateView('app')
    },
    [setBetaSession, clearInviteQuery]
  )

  const clearAccessError = betaAuth.clearAccessError
  const goHome = useCallback(() => {
    returnToClient.current = false
    returnToMoodboard.current = false
    clearInviteQuery()
    clearAccessError()
    setGateView('landing')
  }, [clearInviteQuery, clearAccessError])

  const exploreArtists = () => {
    returnToClient.current = false
    returnToMoodboard.current = false
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'artists')
    window.history.replaceState({}, '', url.pathname + url.search)
    setGateView('artists')
  }

  const openMoodboard = (image?: PortfolioImage) => {
    if (image) setPendingInspiration(image)
    returnToClient.current = false
    returnToMoodboard.current = true
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'moodboard')
    window.history.replaceState({}, '', url.pathname + url.search)
    setGateView('moodboard')
  }

  const openClientSpace = (projectId?: string) => {
    returnToMoodboard.current = false; returnToClient.current = true
    setClientProjectId(projectId); setWorkspaceSection('client')
    const url = new URL(window.location.href); url.searchParams.set('view', 'client')
    window.history.replaceState({}, '', url.pathname + url.search)
    setGateView('client')
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
      <ArtistDiscovery onMoodboard={openMoodboard} signedIn={!!betaAuth.session} onHome={goHome} onStudio={() => { clearInviteQuery(); if (betaAuth.session) enterApp(); else setGateView('login') }} />
    </Suspense>
  }

  if (gateView === 'moodboard' && betaAuth.session) {
    return <Suspense fallback={<div className="app-loading">Gathering your inspiration…</div>}>
      <MoodboardPortal key={betaAuth.session.userId ?? betaAuth.session.email} owner={betaAuth.session.userId ?? betaAuth.session.email}
        pending={pendingInspiration} onCollected={() => setPendingInspiration(null)} onArtists={exploreArtists}
        onStudio={() => { returnToClient.current = false; returnToMoodboard.current = false; setWorkspaceSection('projects'); enterApp() }}
        onClientSpace={openClientSpace}
        onDesk={() => { returnToClient.current = false; returnToMoodboard.current = false; setWorkspaceSection('artist'); enterApp() }} />
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

  if (gateView === 'login' || gateView === 'moodboard' || (gateView === 'client' && !betaAuth.session) || (gateView === 'invite' && !inviteCode)) {
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
      <Workspace initialSection={workspaceSection} initialClientProject={clientProjectId} onMoodboard={() => openMoodboard()} session={session} onHome={goHome} onSignOut={(opts) => void signOut(opts)} />
    </Suspense>
  )
}

export default App
