// Sends an invite email through Resend. Called by the operator console after
// an invite is created; the app falls back to "copy the link" if this fails.
//
// Deploy:   supabase functions deploy send-invite
// Secrets:  supabase secrets set RESEND_API_KEY=re_... INVITE_FROM="Smart Ink <invites@yourdomain>" SITE_URL=https://beta.yourdomain
//
// The caller must be a signed-in admin: the request's JWT is forwarded to a
// Supabase client and checked with the same is_admin() the database uses.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('INVITE_FROM');
  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
  if (!resendKey || !from || !siteUrl) {
    return json(500, { error: 'send-invite is missing RESEND_API_KEY, INVITE_FROM or SITE_URL.' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) return json(403, { error: 'Operator access required.' });

  let code = '';
  try {
    const body = (await req.json()) as { code?: string };
    code = (body.code ?? '').trim().toUpperCase();
  } catch {
    return json(400, { error: 'Expected JSON { code }.' });
  }
  if (!code) return json(400, { error: 'Missing invite code.' });

  const { data: invite, error: inviteErr } = await supabase
    .from('invites')
    .select('code, email, expires_at, redeemed_at')
    .eq('code', code)
    .maybeSingle();
  if (inviteErr) return json(500, { error: inviteErr.message });
  if (!invite) return json(404, { error: 'Invite not found.' });
  if (!invite.email) return json(400, { error: 'This invite has no email; copy the link instead.' });
  if (invite.redeemed_at) return json(400, { error: 'This invite was already used.' });

  if (new Date(invite.expires_at).getTime() <= Date.now()) return json(400, { error: 'This invite has expired. Create a new invitation.' });

  const link = `${siteUrl}/?invite=${encodeURIComponent(invite.code)}`;
  const expires = new Date(invite.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const html = `
    <div style="background:#f5f3ee;padding:32px 16px;font-family:Arial,sans-serif;color:#262623">
      <div style="max-width:520px;margin:auto;background:#fff;padding:36px;border-radius:16px">
        <p style="font-size:12px;letter-spacing:3px;color:#777">SMART INK · PRIVATE BETA</p>
        <h1 style="font-size:32px;line-height:1.15">Your next tattoo starts here.</h1>
        <p style="line-height:1.7">Welcome to Smart Ink. You’re invited to explore your ideas, place your artwork, and bring it to life in the studio.</p>
        <p style="margin:32px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#262623;color:#fff;padding:16px 24px;border-radius:8px;text-decoration:none">Accept your invitation</a></p>
        <p style="line-height:1.7">This invitation is reserved for <strong>${escapeHtml(invite.email)}</strong>. Accept it, then sign in with Google or an email code to get started.</p>
        <p style="font-size:13px;color:#666">Your single-use invitation is valid until ${expires}. If the button doesn’t open, use this link:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
        <p><a href="${escapeHtml(siteUrl)}" style="color:#555">Explore the Smart Ink homepage</a></p>
        <p style="font-size:13px;color:#777">Thanks for helping shape Smart Ink.</p>
      </div>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [invite.email],
      subject: 'Welcome to Smart Ink — you’re invited',
      html,
      text: `Welcome to Smart Ink! Explore your ideas, place your artwork, and bring it to life in the studio.\n\nAccept your invite: ${link}\nCode: ${invite.code} (valid until ${expires})\n\nAccept your invitation, then sign in with Google or an email code.\n\nExplore Smart Ink: ${siteUrl}\n`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json(502, { error: `Resend rejected the email (${res.status}): ${detail.slice(0, 300)}` });
  }

  return json(200, { sent: true, to: invite.email });
});
