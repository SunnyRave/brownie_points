/**
 * Public azentio.ai content, taken from the reference site named in the hackathon brief
 * (https://azentio-ai-ipad.ssaha999.chatgpt.site/ — routes /, /products/*, /solutions, /about, /lab,
 * /technology, /media, /insights) and, for company background on /about, from public profiles of
 * Azentio Software (Gartner Peer Insights, Altaroc, Celent). Loaded into the database by the seed;
 * pages render it from the CMS tables. Customer/country/headcount figures are deliberately omitted
 * because public sources disagree.
 */

export const PRODUCT_DISCLAIMER = 'Benefits describe intended outcomes, not verified performance claims.';
export const SITE_DISCLAIMER = 'Product information is indicative and subject to validation.';

export type CatalogueProduct = {
  slug: string;
  name: string;
  family: 'Credit Intelligence' | 'Reporting & Analytics' | 'AI Applications';
  label: string;
  tagline: string;
  summary: string;
  capabilities: string[];
  steps: string[];
  outcomes: string[];
  status: 'Prototype';
};

export const PRODUCTS: CatalogueProduct[] = [
  {
    slug: 'credit-strategy-simulator', name: 'Credit Strategy Simulator', family: 'Credit Intelligence', label: 'Credit Policy Intelligence',
    tagline: 'Test the Strategy. Understand the Impact.',
    summary: 'Simulate credit policy changes before deployment. Explore potential effects on approvals, risk exposure, and portfolio outcomes.',
    capabilities: ['Policy scenario configuration', 'Approval and risk impact comparison', 'Evidence-led simulation'],
    steps: ['Select a portfolio', 'Define a strategy', 'Run scenarios', 'Review impact', 'Refine and approve'],
    outcomes: ['Evaluate strategy before rollout', 'Compare scenarios consistently', 'Support informed policy reviews'],
    status: 'Prototype',
  },
  {
    slug: 'sme-credit-decisioning', name: 'SME Credit Decisioning Workbench', family: 'Credit Intelligence', label: 'Explainable Credit Intelligence',
    tagline: 'Every Decision, Backed by Intelligence.',
    summary: 'Bring financial analysis, policy evaluation, risk review, and credit recommendations into one workbench — with evidence and human oversight.',
    capabilities: ['Policy and exception evaluation', 'Explainable recommendations', 'Human decision controls'],
    steps: ['Capture application', 'Collect evidence', 'Evaluate policies', 'Review recommendation', 'Approve or refer'],
    outcomes: ['Streamline reviews', 'Improve consistency', 'Preserve accountability'],
    status: 'Prototype',
  },
  {
    slug: 'similar-portfolio-intelligence', name: 'Similar Portfolio Intelligence', family: 'Credit Intelligence', label: 'Contextual Portfolio Insights',
    tagline: 'Learn from Similarity. Decide with Context.',
    summary: 'Compare financing applications with relevant historical portfolio segments to understand patterns, risk indicators, and comparable outcomes.',
    capabilities: ['Peer cohort discovery', 'Portfolio comparisons', 'Historical outcome context'],
    steps: ['Select application', 'Identify comparable cohort', 'Compare indicators', 'Review insights'],
    outcomes: ['Add context to underwriting', 'Reveal comparable patterns', 'Support informed review'],
    status: 'Prototype',
  },
  {
    slug: 'rejection-intelligence', name: 'Rejection Intelligence', family: 'Credit Intelligence', label: 'Rejection Analysis & Simulation',
    tagline: 'Understand Every Rejection. Discover Every Opportunity.',
    summary: 'Analyze declined applications, uncover rejection patterns, and simulate changes that could improve eligible approvals.',
    capabilities: ['Reason categorization', 'Trend analysis', 'Scenario simulation'],
    steps: ['Ingest decisions', 'Classify reasons', 'Explore patterns', 'Simulate alternatives'],
    outcomes: ['Understand rejection drivers', 'Identify potential improvements', 'Explore policy changes'],
    status: 'Prototype',
  },
  {
    slug: 'riva', name: 'RIVA', family: 'Reporting & Analytics', label: 'Reporting Intelligence, Validation & Analytics',
    tagline: 'From Complex Data to Confident Reporting.',
    summary: 'A configurable reporting environment connecting data sources, mapping report fields, supporting validation, and simplifying reporting workflows.',
    capabilities: ['Multi-source data mapping', 'Configurable report templates', 'Validation and audit history'],
    steps: ['Connect sources', 'Configure template', 'Map fields', 'Validate', 'Generate report'],
    outcomes: ['Reduce manual mapping', 'Improve traceability', 'Adapt reporting workflows'],
    status: 'Prototype',
  },
  {
    slug: 'financial-analysis', name: 'Financial Analysis Intelligence', family: 'Reporting & Analytics', label: 'Financial Assessment',
    tagline: 'Numbers Tell a Story. Intelligence Reveals It.',
    summary: 'Turn financial statements into structured analysis, ratios, trends, and decision-ready credit insights.',
    capabilities: ['Statement structuring', 'Financial ratios and trends', 'Evidence-linked analysis'],
    steps: ['Upload statements', 'Extract figures', 'Analyze metrics', 'Review insights'],
    outcomes: ['Accelerate review', 'Improve consistency', 'Make trends visible'],
    status: 'Prototype',
  },
  {
    slug: 'document-intelligence', name: 'Document Intelligence', family: 'AI Applications', label: 'Intelligent Extraction & Verification',
    tagline: 'Documents In. Intelligence Out.',
    summary: 'Extract, classify, structure, and validate information from financial documents, identity records, and complex inputs.',
    capabilities: ['Document classification', 'Structured extraction', 'Validation workflows'],
    steps: ['Receive document', 'Classify', 'Extract', 'Validate', 'Publish structured data'],
    outcomes: ['Reduce manual entry', 'Improve information quality', 'Enable downstream workflows'],
    status: 'Prototype',
  },
  {
    slug: 'persona-newsroom', name: 'Persona Newsroom', family: 'AI Applications', label: 'Executive Content Intelligence',
    tagline: 'Relevant News. Distinct Perspectives.',
    summary: 'Discover relevant market news, match stories to executive personas, and generate editable thought-leadership drafts.',
    capabilities: ['Article repository', 'Persona-specific recommendations', 'Editable draft generation'],
    steps: ['Discover news', 'Choose persona', 'Generate draft', 'Review and edit'],
    outcomes: ['Reduce content preparation time', 'Support distinctive viewpoints', 'Preserve editorial control'],
    status: 'Prototype',
  },
];

export const HOME = {
  hero: {
    headline: 'Build Intelligence.',
    highlight: 'Create Impact.',
    sub: 'From ideas to intelligent products. From complexity to clarity. From AI potential to meaningful outcomes.',
  },
  whoWeAre: {
    title: 'Intelligence, Engineered for the Real World.',
    body: 'We build intelligent applications that combine domain understanding, advanced AI, intuitive experiences, and enterprise-grade engineering.',
  },
  capabilitiesTitle: 'Intelligence in Every Layer.',
  capabilities: [
    { title: 'Intelligent Decisioning', body: 'Turn policies, evidence, and data into recommendations.' },
    { title: 'Document Intelligence', body: 'Extract, interpret, and validate complex information.' },
    { title: 'AI Agents & Automation', body: 'Connect intelligence with workflows and human oversight.' },
    { title: 'Analytics & Insights', body: 'Turn data into actionable insights.' },
    { title: 'Configurable AI Platforms', body: 'Adapt solutions to changing business requirements.' },
    { title: 'Trusted Enterprise AI', body: 'Designed for security, accountability, and traceability.' },
  ],
  productsTitle: 'Built to Work. Designed to Evolve.',
  inAction: { title: 'Don’t Just Imagine What AI Can Do. See It.', cta: 'Watch Product Showcases' },
  trustTitle: 'Innovation Without Compromising Trust.',
  // Each pillar is paired with how this portal implements it (verifiable in the code and tests).
  trust: [
    { title: 'Identity & SSO', body: 'Microsoft Entra ID sign-in, single-tenant, keyed on the immutable object ID.' },
    { title: 'Role-Based Access', body: 'Separate, individually assigned grants checked on the server for every request.' },
    { title: 'Auditability', body: 'Append-only audit of sign-ins, grants, moderation, publication, withdrawal and denials.' },
    { title: 'Data Protection', body: 'Tenant isolation with Postgres row-level security and short-lived signed media links.' },
    { title: 'Human Oversight', body: 'Moderators review every shared contribution; sandbox outputs are never decisions.' },
    { title: 'Secure Deployment', body: 'CSP, HSTS, CSRF origin checks and server-side sessions with idle and absolute expiry.' },
  ],
  happeningTitle: 'Ideas in Motion.',
  happening: [
    { title: 'AI Lab', body: 'Experiment boldly. Engineer purposefully.', href: '/lab' },
    { title: 'azentio.ai LIVE', body: 'Hackathons, working sessions and opportunities to build together.', href: '/hackathon' },
    { title: 'Perspectives', body: 'Ideas on explainability, reporting and applied AI.', href: '/insights' },
  ],
  cta: { eyebrow: 'Build What’s Next', title: 'The Next Intelligent Idea Starts Here.', body: 'Explore our products, share a challenge, or collaborate to turn ambitious ideas into working AI solutions.', label: 'Start a Conversation' },
};

// The source page lists the six areas without product links; the `products` mapping is ours.
export const SOLUTIONS = [
  { title: 'Smarter Credit Decisions', body: 'Improve transparency and efficiency across credit assessment.', products: ['sme-credit-decisioning', 'financial-analysis'] },
  { title: 'Adaptive Credit Strategies', body: 'Evaluate policy scenarios before implementation.', products: ['credit-strategy-simulator', 'rejection-intelligence'] },
  { title: 'Intelligent Reporting', body: 'Simplify data mapping, validation, and reporting preparation.', products: ['riva'] },
  { title: 'Portfolio Intelligence', body: 'Use historical patterns to strengthen decision context.', products: ['similar-portfolio-intelligence'] },
  { title: 'Operational Intelligence', body: 'Connect fragmented information and repetitive workflows.', products: ['document-intelligence'] },
  { title: 'Knowledge & Content Intelligence', body: 'Turn information into relevant, contextual outputs.', products: ['persona-newsroom'] },
];

export const ABOUT = {
  tagline: 'Intelligence Begins With Imagination.',
  mission: 'Engineer practical, responsible, and impactful AI products that simplify complexity and enable better decisions.',
  vision: 'A future where intelligence is seamlessly embedded into everyday enterprise experiences.',
  principles: [
    { title: 'Build with Purpose', body: 'Begin with genuine problems and track outcomes that matter.' },
    { title: 'Engineer for Trust', body: 'Treat security, accountability, and human oversight as core foundations.' },
  ],
  approach: 'azentio.ai combines domain expertise, product strategy, AI engineering, and experimentation to build intelligent solutions — across products, solutions, an AI Lab, technology, hackathons, media and insights.',
  company: {
    title: 'Part of Azentio Software',
    facts: [
      'Headquartered in Singapore.',
      'Formed in 2020 as a carve-out of 3i Infotech; backed by funds advised by Apax Partners.',
      'Mission-critical software for banking, financial services, insurance and capital markets, plus ERP for small and mid-sized enterprises.',
      'Serves institutions across Asia Pacific, the Middle East, Africa and India.',
    ],
    sources: ['Gartner Peer Insights vendor profile', 'Altaroc portfolio profile', 'Celent vendor directory'],
  },
};

export const LAB = {
  title: 'Experiment Boldly. Engineer Purposefully.',
  intro: 'Where emerging technologies meet practical challenges. We experiment, prototype, validate, and refine ideas.',
  sections: [
    { title: 'Inside the Lab', body: 'Explore how we approach rapid prototyping and real-world experimentation.' },
    { title: 'What We’re Exploring', body: 'Agentic AI, small language models, multimodal intelligence, and AI-assisted engineering.' },
    { title: 'Build Stories', body: 'From problem statements and experiments to working prototypes and lessons learned.' },
    { title: 'Hackathons & Collaboration', body: 'Innovation challenges, working sessions, and opportunities to build together.' },
  ],
};

export const TECHNOLOGY = {
  title: 'Built for Intelligence. Engineered for Trust.',
  intro: 'Our approach to AI rests on reliable data, orchestration, secure integration, controlled execution, and transparent governance.',
  pillars: [
    { title: 'Enterprise Integration', body: 'Connect applications, data sources, business rules, and enterprise services through controlled interfaces.' },
    { title: 'AI Orchestration', body: 'Combine models, workflows, agents, deterministic logic, and human approvals.' },
    { title: 'Security by Design', body: 'Institutional single sign-on, role-based access, encrypted transport, audit trails, and secure deployment.' },
    { title: 'Responsible AI', body: 'Explainability, model oversight, traceability, and human control. Security testing claims require verified evidence.' },
  ],
  architectureTitle: 'Intelligence with Governance at Every Layer.',
  layers: [
    { title: 'User Experience', body: 'Workbenches, copilots, APIs' },
    { title: 'AI Orchestration & Business Logic', body: 'Workflows, agents, rules, approvals' },
    { title: 'Model Intelligence, Enterprise Data & Integration', body: 'Models, data, system integration' },
    { title: 'Trust, Security & Governance', body: 'SSO, RBAC, encryption, audit, monitoring' },
  ],
};

export const INSIGHTS = [
  { title: 'Why Explainability Matters in Credit Decisions', summary: 'How evidence, oversight, and transparent recommendations shape responsible decision support.', topic: 'Responsible AI' },
  { title: 'From Reporting Automation to Intelligence', summary: 'Moving beyond templates to configurable, validated, and traceable reporting.', topic: 'Reporting' },
  { title: 'Small Language Models in Financial Services', summary: 'Considerations for privacy, performance, deployment, and governance.', topic: 'Applied AI' },
  { title: 'Engineering Notes', summary: 'Lessons from experiments, prototypes, and production-oriented design.', topic: 'Engineering' },
];

export const MEDIA = [
  { title: 'The azentio.ai Story', kind: 'Brand', summary: 'Introducing our approach to applied AI.' },
  { title: 'Product Showreel', kind: 'Products', summary: 'An overview of intelligent products in action.' },
  { title: 'Credit Decisioning Deep Dive', kind: 'Product Demo', summary: 'Explore evidence-backed credit decisioning.' },
  { title: 'Inside the AI Lab', kind: 'AI Lab', summary: 'Experiments, prototypes, and lessons learned.' },
];
