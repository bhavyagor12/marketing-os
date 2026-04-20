// The full taxonomy of events in the Marketing OS. Every write path (server action,
// worker job, agent run, external webhook) emits one or more of these. This is the
// contract between instrumentation sites and consumers (dashboards, analytics, attribution).

export const EventType = {
  // --- Organization / members ---
  OrgCreated: 'org.created',
  MemberJoined: 'member.joined',
  MemberLeft: 'member.left',

  // --- Brand / org context ingestion ---
  BrandSourceAdded: 'brand.source.added',
  BrandSourceProcessing: 'brand.source.processing',
  BrandSourceCompleted: 'brand.source.completed',
  BrandSourceFailed: 'brand.source.failed',
  BrandSourceDeleted: 'brand.source.deleted',
  BrandProfileGenerated: 'brand.profile.generated',

  // --- Campaign lifecycle ---
  CampaignCreated: 'campaign.created',
  CampaignBriefUpdated: 'campaign.brief_updated',
  CampaignStatusChanged: 'campaign.status_changed',
  CampaignArchived: 'campaign.archived',

  // --- Asset + version (the core of Git-for-marketing) ---
  AssetCreated: 'asset.created',
  AssetEdited: 'asset.edited',
  AssetDeleted: 'asset.deleted',
  CommitCreated: 'commit.created',
  CommitMerged: 'commit.merged',
  BranchCreated: 'branch.created',

  // --- Collaboration ---
  CommentCreated: 'comment.created',
  CommentResolved: 'comment.resolved',
  ApprovalRequested: 'approval.requested',
  ApprovalGranted: 'approval.approved',
  ApprovalChangesRequested: 'approval.changes_requested',

  // --- Agents ---
  AgentRunStarted: 'agent.run.started',
  AgentRunCompleted: 'agent.run.completed',
  AgentRunFailed: 'agent.run.failed',

  // --- Publishing ---
  PublishScheduled: 'publish.scheduled',
  PublishSent: 'publish.sent',
  PublishFailed: 'publish.failed',

  // --- External signals (social + tracking pixel) ---
  ExternalImpression: 'external.impression',
  ExternalLike: 'external.like',
  ExternalReply: 'external.reply',
  ExternalClick: 'external.click',
  ExternalSignup: 'external.signup',
  ExternalConversion: 'external.conversion',
  ExternalRevenue: 'external.revenue',

  // --- Integrations / settings ---
  AiKeyConnected: 'integration.ai_key.connected',
  AiKeyRevoked: 'integration.ai_key.revoked',
  SocialConnected: 'integration.social.connected',
  SocialDisconnected: 'integration.social.disconnected',

  // --- Outreach (for future AI SDR agent) ---
  OutreachSent: 'outreach.sent',
  OutreachReplied: 'outreach.replied',
  OutreachBounced: 'outreach.bounced',
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

export const EventSubjectType = {
  Asset: 'asset',
  Commit: 'commit',
  Branch: 'branch',
  Campaign: 'campaign',
  BrandSource: 'brand_source',
  BrandProfile: 'brand_profile',
  Publish: 'publish',
  AgentRun: 'agent_run',
  Comment: 'comment',
  Approval: 'approval',
  Member: 'member',
  Organization: 'organization',
  AiCredential: 'ai_credential',
  SocialConnection: 'social_connection',
  Outreach: 'outreach',
} as const;

export type EventSubjectTypeValue =
  (typeof EventSubjectType)[keyof typeof EventSubjectType];
