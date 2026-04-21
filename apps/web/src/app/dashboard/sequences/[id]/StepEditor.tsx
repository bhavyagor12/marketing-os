'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { upsertSequenceStep, deleteSequenceStep } from '../actions';

export type StepInput = {
  id: string | null;
  stepOrder: number;
  delayDaysAfterPrevious: number;
  subjectTemplate: string;
  bodyTemplate: string;
};

export function StepEditor({
  sequenceId,
  existingSteps,
}: {
  sequenceId: string;
  existingSteps: StepInput[];
}) {
  const [steps, setSteps] = useState<StepInput[]>(
    existingSteps.length > 0
      ? existingSteps
      : [blankStep(0)],
  );

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <StepCard
          key={step.id ?? `new-${i}`}
          sequenceId={sequenceId}
          step={step}
          onDeleted={() => {
            if (step.id) setSteps((arr) => arr.filter((_, idx) => idx !== i));
            else setSteps((arr) => arr.filter((_, idx) => idx !== i));
          }}
        />
      ))}
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => setSteps((arr) => [...arr, blankStep(arr.length)])}
      >
        Add step
      </Button>
    </div>
  );
}

function blankStep(order: number): StepInput {
  return {
    id: null,
    stepOrder: order,
    delayDaysAfterPrevious: order === 0 ? 0 : 3,
    subjectTemplate: '',
    bodyTemplate: '',
  };
}

function StepCard({
  sequenceId,
  step,
  onDeleted,
}: {
  sequenceId: string;
  step: StepInput;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(step.subjectTemplate);
  const [body, setBody] = useState(step.bodyTemplate);
  const [delay, setDelay] = useState(step.delayDaysAfterPrevious);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await upsertSequenceStep({
        sequenceId,
        stepOrder: step.stepOrder,
        delayDaysAfterPrevious: delay,
        subjectTemplate: subject,
        bodyTemplate: body,
      });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function onDelete() {
    if (!step.id) {
      onDeleted();
      return;
    }
    if (!confirm('Delete this step?')) return;
    start(async () => {
      const res = await deleteSequenceStep(step.id!);
      if (res?.ok) {
        onDeleted();
        router.refresh();
      }
    });
  }

  const isFirst = step.stepOrder === 0;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-stone-200 bg-white p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-900 text-[11px] font-semibold text-white">
            {step.stepOrder + 1}
          </span>
          <h4 className="text-sm font-semibold text-stone-900">
            {isFirst ? 'First touch' : `Follow-up ${step.stepOrder}`}
          </h4>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending || isFirst}
          className="rounded p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Delete step"
          title={isFirst ? 'First step cannot be deleted' : 'Delete step'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!isFirst ? (
        <Input
          label="Delay (days after previous send)"
          type="number"
          min={0}
          max={90}
          value={delay}
          onChange={(e) => setDelay(Number(e.target.value) || 0)}
        />
      ) : null}

      <Input
        label="Subject template"
        placeholder={`e.g. quick q about \`\`{{company}}''s growth`}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Body template
        </label>
        <textarea
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hi {{firstName}} — use real context about {{company}}. The agent will personalize this for each lead."
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
        <p className="mt-1.5 text-xs text-stone-500">
          Supports <code>{'{{firstName}}'}</code>, <code>{'{{lastName}}'}</code>,{' '}
          <code>{'{{fullName}}'}</code>, <code>{'{{company}}'}</code>,{' '}
          <code>{'{{title}}'}</code>. The agent reads the full lead context and rewrites the
          phrasing to feel natural.
        </p>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !subject.trim() || !body.trim()}
          leadingIcon={<Save className="h-3.5 w-3.5" />}
        >
          {pending ? 'Saving…' : 'Save step'}
        </Button>
      </div>
    </form>
  );
}
