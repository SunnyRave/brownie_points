import Link from 'next/link';
import { Denied, EmployeeLabel, EmptyState, PageHeader, cx, fmtDate } from '@/components/ui';
import { CreateSpaceForm } from '@/components/teams/TeamSpaceControls';
import { SPACE_STATUS_LABELS, SPACE_STATUS_TONE } from '@/components/teams/labels';
import { requirePrincipal, guarded } from '@/lib/page';
import { listSpaces } from '@/lib/services/teams';

export default async function TeamSpaces() {
  const p = await requirePrincipal('/hub/teams');
  const r = await guarded(() => listSpaces(p));
  if (!r.ok) return <Denied status={r.status} />;
  return (
    <>
      <PageHeader
        eyebrow="Hackathon"
        title="Team spaces"
        description={<span className="flex flex-wrap items-center gap-2">Form teams, share progress and submit your hackathon entry. Never indexed for clients, the public or AIRA. <EmployeeLabel /></span>}
        actions={<Link className="btn btn-ghost" href="/hackathon">Public event page</Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {r.data.length === 0 ? (
          <EmptyState title="No team spaces yet" body="Start the first one." />
        ) : (
          <ul className="grid content-start gap-4 md:grid-cols-2">
            {r.data.map((s) => (
              <li key={s.id}>
                <Link href={`/hub/teams/${s.id}`} className="panel-solid block h-full p-5 transition hover:border-accent/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cx('chip', SPACE_STATUS_TONE[s.status])}>{SPACE_STATUS_LABELS[s.status]}</span>
                    {s.myRole && <span className="chip border-teal/40 text-teal">{s.myRole === 'owner' ? 'You own this' : 'You’re a member'}</span>}
                  </div>
                  <h2 className="mt-3 font-semibold">{s.name}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-ink-2">{s.challenge}</p>
                  <p className="mt-3 text-xs text-ink-3">{s.memberCount} member{s.memberCount === 1 ? '' : 's'} · {s.postCount} post{s.postCount === 1 ? '' : 's'} · updated {fmtDate(s.updatedAt)}</p>
                  <p className="mt-1 truncate text-xs text-muted">{s.memberNames.join(', ')}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <aside><CreateSpaceForm /></aside>
      </div>
    </>
  );
}
