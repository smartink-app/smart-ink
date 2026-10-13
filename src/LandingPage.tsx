import React, { useId, useState, type FormEvent } from 'react';
import { authMode, requestBetaAccess } from './auth/betaAuthService';
import type { RequestAccessResult } from './auth/types';
import {
  CONTACT_EMAIL,
  isWaitlistEndpointConfigured,
  submitWaitlistRequest,
} from './auth/waitlistSubmit';
import './landing/phase-one-landing.css';
import HeroPreview from './landing/HeroPreview';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  signedIn?: boolean;
}

const WORKFLOW = [
  { number: '01', title: 'Place your artwork.', copy: 'Upload a design and project it onto the skin. Turn the body, find the right angle, and adjust the scale until the placement feels right.' },
  { number: '02', title: 'Make the body theirs.', copy: 'Start with a body preset, adjust its proportions, or follow the measurement guide. See your idea on a body that better represents your client.' },
  { number: '03', title: 'Give it a studio finish.', copy: 'Choose a considered shot, set the light, and create an image for your client presentation. Keep the tattoo at the centre of the frame.' },
];
const SHOTS = [
  { src: '/renders/presets/editorial.jpg', label: 'Editorial', copy: 'The design in context.' },
  { src: '/renders/presets/detail.jpg', label: 'Close detail', copy: 'A closer look at the placement.' },
  { src: '/renders/presets/sculpted.jpg', label: 'Sculpted light', copy: 'Shape, contrast, and atmosphere.' },
];

type SubmitState = 'idle' | 'sending' | 'joined' | 'already' | 'undelivered' | 'error';

const RequestAccessForm: React.FC<{ source: string; buttonLabel: string }> = ({
  source,
  buttonLabel,
}) => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const inputId = useId();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'sending') return;

    setState('sending');
    setMessage('');
    // A published page must never claim a browser-only request reached us.
    if (authMode() === 'unconfigured' && !isWaitlistEndpointConfigured()) {
      setState('error');
      setMessage(CONTACT_EMAIL ? `Requests are temporarily unavailable. Email ${CONTACT_EMAIL} to request access.` : 'Access requests are temporarily unavailable. Please try again later.');
      return;
    }

    let recorded: RequestAccessResult;
    try {
      recorded = await requestBetaAccess(email, { source, referrer: document.referrer });
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Could not send your request.');
      return;
    }

    // A browser-local entry is not proof that the hosted form received it.
    // After a delivery failure, submitting again must actually retry delivery.
    if (recorded.already && (authMode() === 'supabase' || !isWaitlistEndpointConfigured() || recorded.status === 'active' || recorded.status === 'invited')) {
      const hasAccess = recorded.status === 'active' || recorded.status === 'invited';
      setState('already');
      setMessage(
        hasAccess
          ? 'You already have access — log in with that email.'
          : authMode() === 'demo' && !isWaitlistEndpointConfigured() ? 'This request is stored in this browser only. No email was sent.' : 'You’re already on the list. We’ll be in touch when a seat opens.'
      );
      return;
    }

    // With the hosted backend the request is already in the database.
    if (authMode() === 'supabase') {
      setState('joined');
      setMessage('You’re on the list. We’ll email an invite when a seat opens.');
      setEmail('');
      return;
    }

    if (!isWaitlistEndpointConfigured()) {
      console.warn(
        '[Smart Ink] VITE_WAITLIST_ENDPOINT is not set — this beta request was only stored in this browser and will not reach you. See .env.example.'
      );
      setState('joined');
      setMessage('Saved for this local preview only. No email was sent.');
      setEmail('');
      return;
    }

    try {
      await submitWaitlistRequest({ email, source, referrer: document.referrer });
      setState('joined');
      setMessage('You’re on the list. We’ll email an invite when a seat opens.');
      setEmail('');
    } catch (err) {
      console.error('[Smart Ink] Waitlist delivery failed:', err);
      setState('undelivered');
      setMessage(
        CONTACT_EMAIL
          ? `We couldn’t reach our server just now. Email ${CONTACT_EMAIL} and we’ll add you by hand.`
          : 'We couldn’t reach our server just now. Please try again in a moment.'
      );
    }
  };

  const tone =
    state === 'error' || state === 'undelivered'
      ? 'request-note request-note--warn'
      : state === 'joined'
        ? 'request-note request-note--ok'
        : 'request-note';

  return (
    <div className="request-block">
      <form className="request-form" onSubmit={handleSubmit} noValidate>
        <label className="request-form-label" htmlFor={inputId}>
          Email address
        </label>
        <input
          id={inputId}
          className="request-input"
          type="email"
          required
          autoComplete="email"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : buttonLabel}
        </button>
      </form>
      <p className={message ? tone : 'request-note'} role={message ? 'status' : undefined}>
        {message || 'One email when a seat opens. No newsletter, no sharing your address.'}
      </p>
    </div>
  );
};

const LandingPage: React.FC<LandingPageProps> = ({ onNavigateToLogin, signedIn = false }) => {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  return (
    <div className="landing phase-one-landing">
      <a className="phase-skip" href="#main-content">Skip to content</a>
      <header className="landing-nav">
        <a className="landing-brand" href="#top"><span className="landing-mark" aria-hidden />Smart Ink</a>
        <nav className="landing-nav-links" aria-label="Discover Smart Ink">
          <a href="#workflow">How it works</a>
          <a href="#render">Preview the results</a>
        </nav>
        <div className="landing-nav-actions">

          <button type="button" className="btn-quiet" onClick={onNavigateToLogin}>{signedIn ? 'Open studio' : 'Log in'}</button>
          {!signedIn && <button type="button" className="btn-primary btn-primary--sm" onClick={() => scrollTo('request')}>Request access</button>}
        </div>
      </header>

      <main id="main-content">
        <section className="phase-hero" id="top" aria-labelledby="hero-title">
          <div className="phase-hero-copy">
            <p className="phase-eyebrow"><span aria-hidden />A studio for tattoo artists</p>
            <h1 id="hero-title">Your art.<br />Their body.<br /><em>Before the ink.</em></h1>
            <p className="phase-hero-lead">A tattoo belongs on a body. Project your design onto skin, explore its placement with your client, and turn the idea into a studio image.</p>
            <div className="phase-hero-actions">
              <button type="button" className="btn-primary" onClick={signedIn ? onNavigateToLogin : () => scrollTo('request')}>{signedIn ? 'Open your studio' : 'Request beta access'}<span aria-hidden>↗</span></button>
              <a href="#workflow" className="phase-text-link">See how it works <span aria-hidden>↓</span></a>
            </div>
            <p className="phase-access-note">Private beta. Approved artists get the full studio.</p>
          </div>
          <div className="phase-hero-visualizer">
            <HeroPreview />
          </div>
        </section>

        <section className="phase-workflow" id="workflow" aria-labelledby="workflow-title">
          <header className="phase-section-heading"><p className="phase-eyebrow">From the first idea to the final presentation</p><h2 id="workflow-title">Keep the tattoo in focus.</h2><p>One place to shape the body, explore your artwork, and frame the result.</p></header>
          <ol className="phase-step-grid">{WORKFLOW.map(step => <li key={step.number}><span className="phase-step-number">{step.number}</span><h3>{step.title}</h3><p>{step.copy}</p></li>)}</ol>
        </section>

        <section className="phase-render-section" id="render" aria-labelledby="render-title">
          <header className="phase-section-heading"><p className="phase-eyebrow">Your own photo studio</p><h2 id="render-title">The right light.<br />The right point of view.</h2><p>Start with a composed shot. Explore soft studio light, a close crop, or a stronger contrast without building a scene from scratch.</p></header>
          <div className="phase-shot-grid">{SHOTS.map(shot => <figure key={shot.label}><img src={shot.src} alt={`${shot.label} view of a rose tattoo on a 3D torso, rendered in Blender.`} width="384" height="480" loading="lazy" decoding="async" /><figcaption><strong>{shot.label}</strong><span>{shot.copy}</span></figcaption></figure>)}</div>
          <p className="phase-render-note">Actual Smart Ink Blender studies. These are digital visualisations, not photographs of completed tattoos.</p>
        </section>

        <section className="phase-request" id="request" aria-labelledby="request-title">
          <div className="phase-request-copy"><p className="phase-eyebrow">Private beta · for working artists</p><h2 id="request-title">Bring your next<br />idea to the studio.</h2><p>Leave your email to request access. We review requests personally and invite artists into the full studio to work with their own designs.</p></div>
          <div className="phase-request-form">
            <RequestAccessForm source="phase-one-landing" buttonLabel="Request beta access" />
            <ol className="phase-access-steps"><li>Request with your email</li><li>Receive an invitation after approval</li><li>Verify your email and open the studio</li></ol>
            <p className="request-login">Already invited? <button type="button" className="link-button" onClick={onNavigateToLogin}>{signedIn ? 'Open studio' : 'Log in'}</button></p>
          </div>
        </section>
      </main>
      <footer className="landing-footer"><span className="landing-mark landing-mark--sm" aria-hidden /><p>© {new Date().getFullYear()} Smart Ink</p><span>Made for the work before the ink.</span></footer>
    </div>
  );
};

export default LandingPage;
