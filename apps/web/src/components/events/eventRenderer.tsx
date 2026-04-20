import type { ReactNode } from 'react';
import {
  Globe,
  FileText,
  Sparkles,
  Trash2,
  Building2,
  UserPlus,
  Megaphone,
  FileEdit,
  GitCommit,
  GitBranch,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Bot,
  Send,
  Eye,
  ThumbsUp,
  Reply,
  MousePointerClick,
  UserCheck,
  DollarSign,
  KeyRound,
  Plug,
  Cog,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { EventType, type EventTypeValue } from '@marketing-os/shared';

export type EventLike = {
  id: string;
  type: EventTypeValue;
  message: string | null;
  properties: Record<string, unknown> | null;
  occurredAt: Date | string;
  actorUserId: string | null;
  actorSystem: boolean;
  actorAgentRunId: string | null;
  campaignId: string | null;
  commitId: string | null;
  assetId: string | null;
  subjectType: string | null;
  subjectId: string | null;
};

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'agent';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-blue-50 text-blue-600',
  agent: 'bg-violet-50 text-violet-600',
};

const TYPE_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  [EventType.OrgCreated]: { icon: Building2, tone: 'info' },
  [EventType.MemberJoined]: { icon: UserPlus, tone: 'success' },
  [EventType.MemberLeft]: { icon: UserPlus, tone: 'neutral' },

  [EventType.BrandSourceAdded]: { icon: Globe, tone: 'info' },
  [EventType.BrandSourceProcessing]: { icon: Activity, tone: 'info' },
  [EventType.BrandSourceCompleted]: { icon: CheckCircle2, tone: 'success' },
  [EventType.BrandSourceFailed]: { icon: XCircle, tone: 'danger' },
  [EventType.BrandSourceDeleted]: { icon: Trash2, tone: 'neutral' },
  [EventType.BrandProfileGenerated]: { icon: Sparkles, tone: 'agent' },

  [EventType.CampaignCreated]: { icon: Megaphone, tone: 'info' },
  [EventType.CampaignBriefUpdated]: { icon: FileEdit, tone: 'neutral' },
  [EventType.CampaignStatusChanged]: { icon: Megaphone, tone: 'neutral' },
  [EventType.CampaignArchived]: { icon: Megaphone, tone: 'neutral' },

  [EventType.AssetCreated]: { icon: FileEdit, tone: 'info' },
  [EventType.AssetEdited]: { icon: FileEdit, tone: 'neutral' },
  [EventType.AssetDeleted]: { icon: Trash2, tone: 'neutral' },
  [EventType.CommitCreated]: { icon: GitCommit, tone: 'info' },
  [EventType.CommitMerged]: { icon: GitCommit, tone: 'success' },
  [EventType.BranchCreated]: { icon: GitBranch, tone: 'info' },

  [EventType.CommentCreated]: { icon: MessageSquare, tone: 'neutral' },
  [EventType.CommentResolved]: { icon: CheckCircle2, tone: 'success' },
  [EventType.ApprovalRequested]: { icon: AlertCircle, tone: 'warning' },
  [EventType.ApprovalGranted]: { icon: CheckCircle2, tone: 'success' },
  [EventType.ApprovalChangesRequested]: { icon: AlertCircle, tone: 'warning' },

  [EventType.AgentRunStarted]: { icon: Bot, tone: 'agent' },
  [EventType.AgentRunCompleted]: { icon: Bot, tone: 'agent' },
  [EventType.AgentRunFailed]: { icon: XCircle, tone: 'danger' },

  [EventType.PublishScheduled]: { icon: Send, tone: 'info' },
  [EventType.PublishSent]: { icon: Send, tone: 'success' },
  [EventType.PublishFailed]: { icon: XCircle, tone: 'danger' },

  [EventType.ExternalImpression]: { icon: Eye, tone: 'neutral' },
  [EventType.ExternalLike]: { icon: ThumbsUp, tone: 'success' },
  [EventType.ExternalReply]: { icon: Reply, tone: 'info' },
  [EventType.ExternalClick]: { icon: MousePointerClick, tone: 'info' },
  [EventType.ExternalSignup]: { icon: UserCheck, tone: 'success' },
  [EventType.ExternalConversion]: { icon: UserCheck, tone: 'success' },
  [EventType.ExternalRevenue]: { icon: DollarSign, tone: 'success' },

  [EventType.AiKeyConnected]: { icon: KeyRound, tone: 'success' },
  [EventType.AiKeyRevoked]: { icon: KeyRound, tone: 'neutral' },
  [EventType.SocialConnected]: { icon: Plug, tone: 'success' },
  [EventType.SocialDisconnected]: { icon: Plug, tone: 'neutral' },
};

const DEFAULT_META = { icon: Cog, tone: 'neutral' as Tone };

export function eventVisual(type: EventTypeValue): { icon: LucideIcon; tone: Tone } {
  return TYPE_META[type] ?? DEFAULT_META;
}

export function EventIcon({ type }: { type: EventTypeValue }) {
  const { icon: Icon, tone } = eventVisual(type);
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${toneClasses[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d ago`;
  return d.toLocaleDateString();
}

export function actorLabel(
  e: EventLike,
  userLookup: Map<string, { name: string }>,
): ReactNode {
  if (e.actorSystem) return <span className="text-stone-500">System</span>;
  if (e.actorAgentRunId)
    return <span className="text-violet-600">Agent</span>;
  if (e.actorUserId) {
    const u = userLookup.get(e.actorUserId);
    return <span className="font-medium text-stone-900">{u?.name ?? 'Someone'}</span>;
  }
  return <span className="text-stone-500">Unknown</span>;
}
