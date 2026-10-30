/** Hosted feedback adapter used by the account-scoped delivery queue.
 * Caller supplies an authenticated Supabase client; RLS establishes ownership.
 * Draft text never crosses this boundary. No service credentials are used.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Report, ReviewSession } from './store';
export function createHostedFeedback(client: SupabaseClient, owner?: string) {
  return {
    async saveSession(session: ReviewSession) {
      const values = { status: session.status, is_test: session.isTest, steps: session.steps.map(({id,outcome,hasDraft}) => ({id,outcome,hasDraft})) };
      const { error } = await client.from('beta_review_sessions').insert({id:session.id,...values,...(owner ? {owner_id:owner} : {})});
      if (error?.code === '23505') {
        const result = await client.from('beta_review_sessions').update(values).eq('id',session.id).eq('owner_id',owner || session.tester).select('id').single();
        if (result.error) throw new Error(`Review could not be updated: ${result.error.message}`);
      } else if (error) throw new Error(`Review could not be saved: ${error.message}`);
    },
    async submitReport(report: Report) {
      // Ignore client-supplied email, owner, timestamps, status and operator notes.
      // Updating only editable columns also prevents changing a report's identity.
      const { error } = await client.from('beta_feedback_reports').insert({
        ...(owner ? {owner_id:owner} : {}), id: report.id, session_id: report.sessionId ?? null, step_id: report.stepId ?? null,
        kind: report.kind, screen: report.screen, target: report.target, message: report.message,
        expected: report.expected, goal: report.goal, progress: report.progress,
        version: report.version, is_test: report.isTest ?? false,
      });
      if (error?.code === '23505') {
        const result = await client.from('beta_feedback_reports').update({ message: report.message, expected: report.expected, goal: report.goal, progress: report.progress, is_test: report.isTest ?? false }).eq('id',report.id).eq('owner_id',owner || report.tester).select('id').single();
        if (result.error) throw new Error(`Feedback could not be updated: ${result.error.message}`);
      } else if (error) throw new Error(`Feedback could not be saved: ${error.message}`);
    },
    async readInbox() {
      const [reports,sessions,triage] = await Promise.all([
        client.from('beta_feedback_reports').select('*').order('created_at',{ascending:false}).limit(500),
        client.from('beta_review_sessions').select('*').order('created_at',{ascending:false}).limit(500),
        client.from('beta_feedback_triage').select('*').limit(500),
      ]);
      const error = reports.error || sessions.error || triage.error;
      if (error) throw new Error(`Feedback inbox could not be loaded: ${error.message}`);
      return { reports: reports.data, sessions: sessions.data, triage: triage.data };
    },
    async triage(reportId: string, status: Report['status'], notes: string) {
      const {error} = await client.from('beta_feedback_triage').insert({report_id:reportId,status,notes});
      if (error?.code === '23505') {
        const result = await client.from('beta_feedback_triage').update({status,notes}).eq('report_id',reportId).select('report_id').single();
        if (result.error) throw new Error(`Operator notes could not be updated: ${result.error.message}`);
      } else if (error) throw new Error(`Operator notes could not be saved: ${error.message}`);
    },
  };
}
