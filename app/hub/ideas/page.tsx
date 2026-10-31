import Link from 'next/link';
import { PageHeader, fmtDate } from '@/components/ui';
import { IdeaCreate } from '@/components/ideas/IdeaCreate';
import { PrioritisationPanel } from '@/components/assist/PrioritisationPanel';
import { requirePrincipal } from '@/lib/page';
import { listIdeasForEmployee, listLinkableEvidence } from '@/lib/services/ideas';
import { allOfferings } from '@/lib/services/workspace';
import { hasGrant } from '@/lib/policy/authorize';
import { IDEA_STATUS_LABELS } from '@/lib/validation';

export default async function HubIdeas() {
  const p = await requirePrincipal();
  const ideas = await listIdeasForEmployee(p);
  const isOwner = hasGrant(p, 'product_owner');
  const [evidence, offerings] = isOwner ? await Promise.all([listLinkableEvidence(p), allOfferings()]) : [[], []];
  return (
    <>
      <PageHeader eyebrow="Improvement loop" title="Improvement ideas" description="Ideas link to approved shared evidence only — never raw submissions. Status changes are audited and notify contributors." />
      {isOwner && <IdeaCreate evidence={evidence} offerings={offerings} />}
      <ul className="mt-6 grid gap-3">
        {ideas.map((i) => (
          <li key={i.id} className="panel-solid flex flex-wrap items-center justify-between gap-3 p-5">
            <div><p className="font-semibold">{i.title}</p><p className="text-xs text-ink-3">{i.offering ?? 'Cross-offering'} · {i.ownerTeam} · priority {i.priority} · updated {fmtDate(i.updatedAt)}</p></div>
            <div className="flex items-center gap-2"><span className="chip">{IDEA_STATUS_LABELS[i.status]}</span>{isOwner && <Link className="btn btn-ghost btn-sm" href={`/hub/ideas/${i.id}`}>Manage</Link>}</div>
          </li>
        ))}
      </ul>
      {isOwner && <PrioritisationPanel principal={p} />}
    </>
  );
}
