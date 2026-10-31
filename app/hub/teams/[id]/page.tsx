import Link from 'next/link';
import { Denied, EmployeeLabel, PageHeader, cx, fmtDateTime } from '@/components/ui';
import { MembershipButton, OwnerStatus, PostComposer, RemoveMemberButton } from '@/components/teams/TeamSpaceControls';
import { POST_KIND_LABELS, SPACE_STATUS_LABELS, SPACE_STATUS_TONE } from '@/components/teams/labels';
import { requirePrincipal, guarded } from '@/lib/page';
import { getSpace } from '@/lib/services/teams';

const linkOf = (body: string) => {
  const first = body.split(/\s+/)[0];
  return /^https?:\/\//i.test(first) ? { href: first, rest: body.slice(first.length).trim() } : null;
};

export default async function TeamSpace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requirePrincipal(`/hub/teams/${id}`);
  const r = await guarded(() => getSpace(p, id));
  if (!r.ok) return <Denied status={r.status} message={r.status === 404 ? 'Team space not found.' : undefined} />;
  const { space: s, members, posts, myRole, nextStatuses } = r.data;
  const archived = s.status === 'archived';
  return (
    <>
      <PageHeader
        eyebrow="Hackathon team space"
        title={s.name}
        description={<span className="flex flex-wrap items-center gap-2"><span className={cx('chip', SPACE_STATUS_TONE[s.status])}>{SPACE_STATUS_LABELS[s.status]}</span><EmployeeLabel /></span>}
        actions={<><Link className="btn btn-ghost" href="/hub/teams">All teams</Link><MembershipButton spaceId={s.id} myRole={myRole} archived={archived} /></>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="panel-solid p-6">
            <h2 className="font-semibold">Challenge</h2>
            <p className="mt-2 whitespace-pre-wrap text-ink-2">{s.challenge}</p>
          </section>
          {myRole && !archived ? <PostComposer spaceId={s.id} /> : <p className="panel-deep p-4 text-sm text-ink-3">{archived ? 'This space is archived; posting is closed.' : 'Join the team to post updates, notes and links.'}</p>}
          <section aria-label="Posts">
            <ol className="space-y-3">
              {posts.map((post) => {
                const link = post.kind === 'link' ? linkOf(post.body) : null;
                return (
                  <li key={post.id} className="panel-solid p-4 text-sm">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3"><span className="chip">{POST_KIND_LABELS[post.kind]}</span>{post.authorName} · <span className="font-mono">{fmtDateTime(post.createdAt)}</span></p>
                    {link ? (
                      <p className="mt-2"><a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline-offset-4 hover:underline">{link.href}</a>{link.rest && <span className="block text-ink-2">{link.rest}</span>}</p>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-ink-2">{post.body}</p>
                    )}
                  </li>
                );
              })}
              {posts.length === 0 && <li className="text-sm text-ink-3">No posts yet.</li>}
            </ol>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="panel-solid p-5">
            <h2 className="font-semibold">Members ({members.length})</h2>
            <ul className="mt-3 space-y-2">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{m.name}{m.isMe && <span className="text-ink-3"> (you)</span>} <span className="chip ml-1">{m.role}</span></span>
                  {myRole === 'owner' && !m.isMe && <RemoveMemberButton spaceId={s.id} userId={m.userId} name={m.name} />}
                </li>
              ))}
            </ul>
          </section>
          {myRole === 'owner' && <section className="panel-solid p-5"><OwnerStatus spaceId={s.id} nextStatuses={nextStatuses} /></section>}
          <p className="panel-deep p-4 text-xs text-ink-3">Employee-only. Team spaces are not indexed for public or client search and are never used in AIRA answers.</p>
        </aside>
      </div>
    </>
  );
}
