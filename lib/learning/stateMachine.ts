/**
 * Observation lifecycle. Any transition not in this table is rejected server-side.
 *
 * draft ──submit──▶ submitted ──claim──▶ in_review
 * draft ──share_org──▶ org_shared                    (organisation-only; never enters moderation)
 * org_shared ──submit──▶ submitted                   (explicit broadening with consent)
 * in_review ──return──▶ returned ──resubmit──▶ submitted
 * in_review ──reject──▶ rejected
 * in_review ──approve──▶ published                   (creates/updates the shared_insights copy)
 * published ──report──▶ under_report ──unpublish──▶ unpublished ──restore──▶ published
 *                        ├─dismiss──▶ published       └─remove──▶ removed
 *                        └─remove──▶ removed
 * published ──edit──▶ submitted (version+1; previous shared copy stays as-is until re-approved)
 * {submitted, in_review, returned, published, under_report, unpublished, org_shared} ──withdraw──▶ withdrawn
 * draft ──delete──▶ (row deleted)
 */
export type ObservationState =
  | 'draft' | 'org_shared' | 'submitted' | 'in_review' | 'returned' | 'rejected'
  | 'published' | 'under_report' | 'unpublished' | 'removed' | 'withdrawn';

export type TransitionEvent =
  | 'submit' | 'share_org' | 'claim' | 'return' | 'resubmit' | 'reject' | 'approve'
  | 'report' | 'unpublish' | 'restore' | 'dismiss' | 'remove' | 'edit' | 'withdraw' | 'delete';

export type Actor = 'author' | 'moderator' | 'reporter';

type Rule = { from: ObservationState[]; to: ObservationState | null; actor: Actor };

export const TRANSITIONS: Record<TransitionEvent, Rule> = {
  submit: { from: ['draft', 'org_shared'], to: 'submitted', actor: 'author' },
  share_org: { from: ['draft'], to: 'org_shared', actor: 'author' },
  claim: { from: ['submitted'], to: 'in_review', actor: 'moderator' },
  return: { from: ['in_review'], to: 'returned', actor: 'moderator' },
  resubmit: { from: ['returned'], to: 'submitted', actor: 'author' },
  reject: { from: ['in_review'], to: 'rejected', actor: 'moderator' },
  approve: { from: ['in_review'], to: 'published', actor: 'moderator' },
  report: { from: ['published'], to: 'under_report', actor: 'reporter' },
  unpublish: { from: ['under_report'], to: 'unpublished', actor: 'moderator' },
  dismiss: { from: ['under_report'], to: 'published', actor: 'moderator' },
  restore: { from: ['unpublished'], to: 'published', actor: 'moderator' },
  remove: { from: ['under_report', 'unpublished'], to: 'removed', actor: 'moderator' },
  edit: { from: ['published'], to: 'submitted', actor: 'author' },
  withdraw: { from: ['submitted', 'in_review', 'returned', 'published', 'under_report', 'unpublished', 'org_shared'], to: 'withdrawn', actor: 'author' },
  delete: { from: ['draft'], to: null, actor: 'author' },
};

export class TransitionError extends Error {
  constructor(public event: TransitionEvent, public from: string, public actor: Actor) {
    super(`Transition '${event}' not allowed from '${from}' by ${actor}`);
  }
}

export function nextState(from: string, event: TransitionEvent, actor: Actor): ObservationState | null {
  const rule = TRANSITIONS[event];
  if (!rule || rule.actor !== actor || !rule.from.includes(from as ObservationState)) throw new TransitionError(event, from, actor);
  return rule.to;
}

export function canTransition(from: string, event: TransitionEvent, actor: Actor) {
  const rule = TRANSITIONS[event];
  return !!rule && rule.actor === actor && rule.from.includes(from as ObservationState);
}

export const STATE_LABELS: Record<ObservationState, string> = {
  draft: 'Private draft',
  org_shared: 'Shared with organisation',
  submitted: 'Submitted for review',
  in_review: 'In review',
  returned: 'Returned for clarification',
  rejected: 'Not published',
  published: 'Published to community',
  under_report: 'Under review (reported)',
  unpublished: 'Temporarily unpublished',
  removed: 'Removed',
  withdrawn: 'Withdrawn',
};

/** Who can see a given state of the author's record — powers the "who can see this" preview. */
export function whoCanSee(intent: 'private' | 'org' | 'propose_shared', state: ObservationState | 'draft') {
  if (state === 'draft' || intent === 'private') return { label: 'Only you', rings: 1 };
  if (state === 'withdrawn' || state === 'rejected' || state === 'removed') return { label: 'You and your organisation (source record)', rings: 2 };
  if (intent === 'org') return { label: 'You and members of your organisation', rings: 2 };
  if (state === 'published' || state === 'under_report')
    return { label: 'Your organisation sees the source; approved community members see only the reviewed, de-identified copy', rings: 3 };
  return { label: 'Your organisation and learning moderators (reviewing). Not yet visible to the community', rings: 2 };
}
