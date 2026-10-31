import { hasClientAdmin, hasGrant, isEmployee } from '@/lib/policy/authorize';
import type { Principal } from '@/lib/policy/types';

/**
 * General help: greetings and "how do I use this portal" questions, answered from a static guide that is
 * filtered to what the caller can do. It never answers questions about products, clients or markets —
 * those stay on the grounded, cited path.
 */

export const GENERAL_HELP_LABEL = 'General help — not from approved sources';

type Topic = { keys: string[]; text: string };

const GREETING = /^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you|cheers)\b[\s!.,?]*$/i;
const META = /\b(what can you do|who are you|what are you|help me|how does aira work|what is aira|can you help)\b/i;
const HOW_TO = /\b(how (do|can|should) i|how to|where (do|can|is|are)|what happens (when|if)|can i|is it possible to)\b/i;

export function isHelpIntent(q: string) {
  if (GREETING.test(q) || META.test(q) || /^\s*help\s*[?!.]*\s*$/i.test(q)) return true;
  return HOW_TO.test(q) && PORTAL_WORDS.some((w) => q.toLowerCase().includes(w));
}

const PORTAL_WORDS = [
  'sign in', 'signin', 'log in', 'login', 'sign out', 'logout', 'invite', 'invitation', 'observation', 'contribution', 'submit',
  'draft', 'withdraw', 'share', 'sharing', 'consent', 'bookmark', 'saved search', 'save a search', 'comment', 'report', 'support',
  'ticket', 'attachment', 'attach', 'upload', 'theme', 'follow', 'subscribe', 'digest', 'idea', 'playground', 'sandbox', 'demo',
  'team', 'workspace', 'switch', 'notification', 'federated', 'moderat', 'portal', 'aira', 'search', 'feed', 'community', 'member',
  'role', 'password', 'email', 'link', 'broadcast', 'live', 'recording', 'library', 'experiment', 'prioriti', 'evidence',
];

const PUBLIC: Topic[] = [
  { keys: ['sign in', 'login', 'log in', 'link', 'email', 'password'], text: 'Sign in at /login. There are no passwords: enter your work email and we send a single-use sign-in link that expires in 15 minutes. Azentio employees can also use their Microsoft work account when it is configured.' },
  { keys: ['demo', 'contact'], text: 'To request a product demo, open /demo and fill in the short form. Someone from the team will get in touch.' },
  { keys: ['hackathon', 'event', 'register'], text: 'Register for the hackathon at /hackathon.' },
  { keys: ['client', 'workspace', 'join', 'invite', 'invitation'], text: 'Client workspaces are invitation-only. Your organisation’s administrator sends you an invitation email; you verify your address, review the workspace terms and then join.' },
];

const CLIENT: Topic[] = [
  { keys: ['observation', 'contribution', 'submit', 'draft'], text: 'Open Observations → New observation. Saving always creates a private draft. When ready, choose who may see it (your organisation, or proposed sharing with the community) and give the separate consents, then submit. Community proposals are reviewed and de-identified by a moderator before anyone outside your organisation sees them.' },
  { keys: ['share', 'sharing', 'consent', 'who can see', 'private'], text: 'Every observation starts private to you. You can widen it to your organisation, or propose it to the shared community. Storing, publishing a reviewed copy, showing your organisation’s name and any future model-training programme are four separate consents.' },
  { keys: ['withdraw'], text: 'Open the published observation and use Withdraw. The shared copy is removed from the feed, search and AIRA immediately. Material people already viewed cannot be recalled.' },
  { keys: ['returned', 'amend', 'edit', 'clarification'], text: 'If a moderator returns your observation, it shows the reason on the observation page. Edit it and submit again; edits to a published item create a new version that is reviewed again.' },
  { keys: ['attachment', 'attach', 'upload', 'file'], text: 'On a draft or returned observation you can attach PDF, PNG, JPEG, CSV or TXT files (up to 5 MB each, 5 per observation). Attachments stay private to the record and are never included in the shared community copy.' },
  { keys: ['community', 'feed', 'theme', 'search', 'filter'], text: 'Shared community shows reviewed, de-identified contributions and the theme dashboard. Counts only appear once enough organisations contribute, and some filters are disabled when they would narrow results to too few organisations.' },
  { keys: ['bookmark', 'saved', 'save a search', 'saved search'], text: 'Use the bookmark icon on a community item, or Save search in the feed. Find both under Saved & bookmarks. Saved searches re-run with today’s visibility rules.' },
  { keys: ['follow', 'subscribe', 'digest', 'notification'], text: 'Click Follow theme on the theme dashboard to get in-app notices when new approved contributions arrive, plus a weekly digest. The bell icon at the top shows your notifications.' },
  { keys: ['comment', 'report'], text: 'You can comment on shared community items; comments are visible to community participants and show only your role, not your name. Use Report on an item or comment if it is misleading, confidential or inappropriate.' },
  { keys: ['support', 'ticket', 'problem', 'issue'], text: 'Open Support in the left menu to raise a ticket with Azentio. Tickets are private to your organisation. Please leave out customer names and account numbers.' },
  { keys: ['idea', 'status', 'improvement'], text: 'Improvement ideas shows ideas linked to shared themes, with their plain-language status and last update. A status is not a delivery commitment.' },
  { keys: ['demo', 'sandbox', 'playground'], text: 'Demos & sandboxes lists the products your organisation is entitled to, with guided sandboxes that use synthetic data.' },
  { keys: ['switch', 'workspace', 'organisation'], text: 'If you belong to more than one organisation, use the workspace switcher at the top of the page. Each workspace only shows that organisation’s data.' },
];

const CLIENT_ADMIN: Topic[] = [
  { keys: ['invite', 'member', 'role', 'team', 'revoke'], text: 'Open Team & invitations to invite colleagues as Member or Administrator, revoke invitations and change roles within your own organisation.' },
  { keys: ['federated', 'training', 'programme'], text: 'At the bottom of Team & invitations you can enrol your organisation in the optional federated model-learning programme, or withdraw. It is separate from workspace membership and from publishing consent; only model updates leave your environment.' },
];

const EMPLOYEE: Topic[] = [
  { keys: ['playground', 'sandbox', 'demo'], text: 'Open Playground in the employee hub, pick an offering and scenario, run it on synthetic data, review the evidence and leave structured feedback. Outputs are simulations, not credit or business decisions.' },
  { keys: ['live', 'broadcast', 'recording'], text: 'Live & recordings lists internal sessions and recordings for employees.' },
  { keys: ['experiment', 'library', 'release'], text: 'Experiments and Knowledge library hold internal notes with owners and review dates. They are never shown to clients or the public.' },
  { keys: ['team', 'hackathon', 'space'], text: 'Open Hackathon team spaces to create a team, join one and post updates. Owners move the team through forming, building and submitted.' },
  { keys: ['community', 'theme', 'feed'], text: 'Collective learning shows the shared community feed and theme dashboard, the same de-identified view clients see.' },
  { keys: ['idea', 'improvement'], text: 'Improvement ideas lists ideas and their status. Creating and updating ideas needs the product-owner grant.' },
  { keys: ['bookmark', 'saved', 'saved search'], text: 'Saved & bookmarks lists your bookmarks, saved searches and followed themes.' },
  { keys: ['federated', 'model', 'training'], text: 'Federated programme (P2) shows the separate, opt-in model-learning programme: participants, rounds, metrics and the model registry.' },
];

const MODERATOR: Topic[] = [
  { keys: ['moderat', 'queue', 'review', 'approve', 'reject', 'duplicate', 'report'], text: 'Open Moderation → Review queue. Each item shows sensitive-content flags, suggested redactions and possible duplicates. Approve with a reason, return for clarification or reject. Reports and held comments have their own pages.' },
];
const OWNER: Topic[] = [
  { keys: ['idea', 'prioriti', 'evidence'], text: 'In Improvement ideas, create an idea linked to approved evidence and update its status with a public update. The prioritisation panel offers an assistive ranking only; you set priority.' },
];
const SUPPORT_AGENT: Topic[] = [
  { keys: ['support', 'ticket', 'desk'], text: 'Client support desk lists client tickets. Reply, change status, and the client is notified. You see ticket threads only, not the organisation’s other content.' },
];
const ADMIN: Topic[] = [
  { keys: ['grant', 'admin', 'organisation', 'entitlement', 'audit', 'settings'], text: 'Administration covers organisations, people and access, grants, settings and the audit log. Privileged actions are audited.' },
];

/** The guide entries this caller may see. Clients never get employee-only features described. */
export function guideFor(p: Principal | null): Topic[] {
  const topics = [...PUBLIC];
  if (!p) return topics;
  if (isEmployee(p)) {
    topics.push(...EMPLOYEE);
    if (hasGrant(p, 'moderator')) topics.push(...MODERATOR);
    if (hasGrant(p, 'product_owner')) topics.push(...OWNER);
    if (hasGrant(p, 'support_agent')) topics.push(...SUPPORT_AGENT);
    if (hasGrant(p, 'portal_admin')) topics.push(...ADMIN);
  } else if (p.activeTenantId) {
    topics.push(...CLIENT);
    if (hasClientAdmin(p, p.activeTenantId)) topics.push(...CLIENT_ADMIN);
  }
  return topics;
}

export function introFor(p: Principal | null) {
  const where = !p ? 'public azentio.ai content' : isEmployee(p) ? 'public, community and employee-only content' : 'public content and approved community insights';
  return `Hi, I'm AIRA. I answer questions about ${where}, citing approved sources — try “What themes mention seasonality?”. I can also help you find your way around the portal, e.g. “How do I withdraw a contribution?”.`;
}

/** Best-matching guide entries by keyword overlap. */
export function matchTopics(q: string, topics: Topic[], limit = 2) {
  const s = q.toLowerCase();
  return topics
    .map((t) => ({ t, score: t.keys.filter((k) => s.includes(k)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}

export const isGreetingOrMeta = (q: string) => GREETING.test(q) || META.test(q) || /^\s*help\s*[?!.]*\s*$/i.test(q);
