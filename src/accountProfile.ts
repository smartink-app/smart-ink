import type { BetaSession } from './auth/types';
import { authMode } from './auth/betaAuthService';
import { getSupabase } from './auth/supabaseClient';
import { updateDemoDisplayName } from './auth/localDemoBackend';

export type AccountProfile = { displayName: string; studioName: string; website: string; bio: string };
export function readProfile(data: Record<string, unknown>, fallback: string): AccountProfile {
  const text = (key: string) => typeof data[key] === 'string' ? data[key] as string : '';
  return { displayName: text('full_name') || fallback, studioName: text('studio_name'), website: text('website'), bio: text('bio') };
}
export function validateProfile(profile: AccountProfile): AccountProfile {
  const clean = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value.trim()])) as AccountProfile;
  if (!clean.displayName || clean.displayName.length > 80) throw new Error('Enter a display name of 1–80 characters.');
  if (clean.studioName.length > 120 || clean.bio.length > 500 || clean.website.length > 300) throw new Error('One of your profile fields is too long.');
  if (clean.website) {
    let url: URL;
    try { url = new URL(clean.website); } catch { throw new Error('Enter a complete website address, starting with https://.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an http or https website address without login details.');
  }
  return clean;
}
const profileKey = (session: BetaSession) => `smartink:profile:${session.email.toLowerCase()}`;
async function currentUser(session: BetaSession) {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== session.userId) throw new Error('Please sign in again.');
  return data.user;
}
export async function loadAccountProfile(session: BetaSession) {
  if (authMode() === 'unconfigured') throw new Error('Account services are unavailable.');
  const data = authMode() === 'supabase' ? (await currentUser(session)).user_metadata : JSON.parse(localStorage.getItem(profileKey(session)) ?? '{}');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Your saved profile could not be read.');
  return readProfile(data, session.displayName);
}
export async function saveAccountProfile(session: BetaSession, profile: AccountProfile) {
  const clean = validateProfile(profile);
  const data = { full_name: clean.displayName, studio_name: clean.studioName, website: clean.website, bio: clean.bio };
  if (authMode() === 'supabase') {
    await currentUser(session);
    const result = await getSupabase().auth.updateUser({ data });
    if (result.error) throw result.error;
  } else if (authMode() === 'demo') {
    const existing = JSON.parse(localStorage.getItem(profileKey(session)) ?? '{}');
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) throw new Error('Your saved profile could not be read.');
    localStorage.setItem(profileKey(session), JSON.stringify({ ...existing, ...data }));
    updateDemoDisplayName(session.email, clean.displayName);
  } else throw new Error('Account services are unavailable.');
  return clean;
}
export async function updateAccountPassword(session: BetaSession, password: string) {
  if (authMode() !== 'supabase') throw new Error('Password management requires a hosted account.');
  if (password.length < 12) throw new Error('Use at least 12 characters for your password.');
  await currentUser(session);
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
}
