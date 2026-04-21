'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { CheckCircle2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cx } from '@/lib/cx';
import {
  addCommitComment,
  resolveCommitComment,
  deleteCommitComment,
} from '../../../comments-actions';

export type CommentNode = {
  id: string;
  authorUserId: string;
  body: string;
  resolved: boolean;
  parentCommentId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function CommentsPanel({
  commitId,
  currentUserId,
  comments,
  users,
}: {
  commitId: string;
  currentUserId: string;
  comments: CommentNode[];
  users: { id: string; name: string }[];
}) {
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, CommentNode[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const arr = repliesByParent.get(c.parentCommentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentCommentId, arr);
    }
  }

  return (
    <div className="space-y-4">
      <NewCommentForm commitId={commitId} parentCommentId={null} />

      {topLevel.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-stone-300 bg-stone-50/60 px-4 py-3 text-sm text-stone-500">
          <MessageSquare className="h-4 w-4" />
          No comments yet. Start the conversation.
        </div>
      ) : (
        <ul className="space-y-3">
          {topLevel.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesByParent.get(c.id) ?? []}
              currentUserId={currentUserId}
              userMap={userMap}
              commitId={commitId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  userMap,
  commitId,
}: {
  comment: CommentNode;
  replies: CommentNode[];
  currentUserId: string;
  userMap: Map<string, string>;
  commitId: string;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [pending, start] = useTransition();
  const author = userMap.get(comment.authorUserId) ?? 'Someone';
  const isMine = comment.authorUserId === currentUserId;
  const initials = author
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <li
      className={cx(
        'rounded-md border bg-white',
        comment.resolved ? 'border-stone-200 opacity-60' : 'border-stone-200',
      )}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[10px] font-semibold text-white">
            {initials || 'U'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-stone-900">{author}</span>
              <span className="text-xs text-stone-400">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
              {comment.resolved ? <Badge tone="success">Resolved</Badge> : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{comment.body}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setReplyOpen((v) => !v)}
                className="text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                {replyOpen ? 'Cancel reply' : 'Reply'}
              </button>
              {!comment.resolved ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await resolveCommitComment(comment.id);
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-emerald-700"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Resolve
                </button>
              ) : null}
              {isMine ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm('Delete this comment?')) return;
                    start(async () => {
                      await deleteCommitComment(comment.id);
                    });
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {replyOpen ? (
          <div className="ml-10 mt-3">
            <NewCommentForm
              commitId={commitId}
              parentCommentId={comment.id}
              onSubmit={() => setReplyOpen(false)}
              autoFocus
            />
          </div>
        ) : null}
      </div>

      {replies.length > 0 ? (
        <ul className="border-t border-stone-100 bg-stone-50/40 px-3 py-2">
          {replies.map((r) => {
            const replyAuthor = userMap.get(r.authorUserId) ?? 'Someone';
            return (
              <li key={r.id} className="py-2">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-700 text-[10px] font-semibold text-white">
                    {replyAuthor
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase() || 'U'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-900">{replyAuthor}</span>
                      <span className="text-xs text-stone-400">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">{r.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function NewCommentForm({
  commitId,
  parentCommentId,
  onSubmit,
  autoFocus,
}: {
  commitId: string;
  parentCommentId: string | null;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addCommitComment({ commitId, body, parentCommentId });
      if (res?.error) setError(res.error);
      else {
        setBody('');
        onSubmit?.();
      }
    });
  }

  return (
    <form onSubmit={handle} className="space-y-2">
      <textarea
        autoFocus={autoFocus}
        rows={parentCommentId ? 2 : 3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentCommentId ? 'Reply…' : 'Add a comment…'}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !body.trim()}
          leadingIcon={<Send className="h-3.5 w-3.5" />}
        >
          {pending ? 'Posting…' : parentCommentId ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </form>
  );
}
