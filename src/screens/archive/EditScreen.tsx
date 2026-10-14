import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useAnswerCommand, usePendingAnswer } from '../../app/hooks/answers.ts';
import { useAnswer } from '../../app/hooks/archive.ts';
import { useCopyText } from '../../app/hooks/device.ts';
import { useDraftSession } from '../../app/hooks/drafts.ts';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import type { UpdateDraftIdentity } from '../../domain/drafts/draftRepository.ts';
import { DomainFailure } from '../../domain/failures.ts';
import type { AnswerDetail } from '../../domain/models.ts';
import {
  InlineStatus,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  PixelTextareaField,
  RecordPanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount, formatDateKst } from '../../ui/format.ts';
import { useAnswerInput } from '../shared/compose.ts';
import { LeaveConfirmDialog, useLeaveGuard } from '../shared/leaveGuard.tsx';
import { useOfflineOnFailure } from '../shared/offline.ts';
export function EditScreen() {
  const state = useRouteState();
  const refs = useAnswerRefs();
  const id = refs.resolve(state?.answerRef);
  const detail = useAnswer(id);
  const offline = useOfflineOnFailure(detail.error);
  const missing = detail.error instanceof DomainFailure && detail.error.code === 'ANSWER_NOT_FOUND';
  if (!id || missing) return <Navigate to={paths.archive} replace />;
  return detail.data ? (
    <EditForm answer={detail.data} />
  ) : (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F22-001']}</ScreenTitle>
      {detail.isError ? (
        <StatePanel>
          <p>{offline ? copy['CPY-F21-012'] : copy['CPY-F21-011']}</p>
          <PixelButton variant="primary" loading={detail.isFetching} onClick={() => void detail.refetch()}>
            {copy['CPY-F21-013']}
          </PixelButton>
        </StatePanel>
      ) : (
        <PixelPlaceholder />
      )}
    </PixelAppShell>
  );
}
function EditForm({ answer }: { answer: AnswerDetail }) {
  const state = useRouteState();
  const navigate = useArcaNavigate();
  const command = useAnswerCommand(answer.answerId);
  const pending = usePendingAnswer(answer.answerId);
  const identity = useMemo<UpdateDraftIdentity>(
    () => ({ kind: 'update', answerId: answer.answerId }),
    [answer.answerId],
  );
  const draft = useDraftSession(identity, undefined, answer.content);
  const input = useAnswerInput(draft);
  const copyText = useCopyText();
  const [copied, setCopied] = useState<string | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const busy = command.view.kind === 'working';
  const unknown = command.view.kind === 'unconfirmed' && command.view.mode === 'UPDATE';
  const deleting =
    (command.view.kind === 'working' || command.view.kind === 'unconfirmed') && command.view.mode === 'DELETE';
  const unchanged = draft.text === answer.content;
  const guard = useLeaveGuard({
    shouldBlock: () => busy || (!unchanged && draft.status.kind !== 'clean' && draft.status.kind !== 'persisted'),
    pending: busy,
    flush: draft.flush,
  });
  useEffect(() => {
    if (command.view.kind === 'succeeded') {
      guard.allowLeave();
      command.consume();
      navigate(paths.detail, { answerRef: state?.answerRef ?? '' }, { replace: true });
    }
  }, [command, guard.allowLeave, navigate, state?.answerRef]);
  return (
    <PixelAppShell className="arca-page--compose">
      <div className="arca-screen-header">
        <PixelIconButton
          label={copy['CPY-COM-005']}
          icon="back"
          buttonRef={backRef}
          onClick={() => navigate(paths.detail, { answerRef: state?.answerRef ?? '' })}
        />
        <ScreenTitle>{copy['CPY-F22-001']}</ScreenTitle>
      </div>
      <section className="arca-preface">
        <time className="arca-question-date">{formatDateKst(answer.createdDateKst)}</time>
        <p className="arca-question arca-question--quiet">{answer.question.text}</p>
      </section>
      <RecordPanel>
        {draft.load.kind === 'loading' ? (
          <PixelPlaceholder />
        ) : (
          <>
            <PixelTextareaField
              id="f22-answer"
              describedBy="f22-count"
              label={copy['CPY-F22-003']}
              value={draft.text}
              readOnly={busy || unknown || deleting || pending === 'checking'}
              invalid={input.measured.overCount > 0 || input.measured.overCodePoints}
              {...input.fieldHandlers}
            />
            <div className="arca-field-help">
              <span>{draft.status.kind === 'persisted' ? copy['CPY-F22-010'] : ''}</span>
              <span id="f22-count">{fill(copy['CPY-F22-007'], { currentCount: formatCount(input.currentCount) })}</span>
            </div>
          </>
        )}
      </RecordPanel>
      {input.measured.overCodePoints && (
        <InlineStatus message="문자 조합이 너무 길어요. 일부 문자를 줄여 주세요." tone="danger" />
      )}
      <InlineStatus
        message={
          unknown
            ? '수정 결과를 확인하지 못했어요. 글을 유지한 채 다시 저장할 수 있어요.'
            : command.view.kind === 'rejected'
              ? '수정하지 못했어요. 입력과 기록을 확인해 주세요.'
              : command.view.kind === 'localFailure'
                ? '임시글을 보관하지 못했어요. 글을 복사해 주세요.'
                : copied
        }
      />
      <div className="arca-actions">
        <PixelButton
          variant="primary"
          loading={busy}
          disabled={
            deleting || pending === 'checking' || (!busy && (!input.measured.savable || (!unknown && unchanged)))
          }
          onClick={() => {
            if (input.composingRef.current) return;
            if (unknown) command.retry();
            else command.saveEdit({ mode: 'UPDATE', answerId: answer.answerId }, draft.flushKept);
          }}
        >
          {unknown ? '다시 저장하기' : copy['CPY-F22-014']}
        </PixelButton>
        <PixelButton
          variant="ghost"
          onClick={() =>
            void copyText(draft.text).then((r) =>
              setCopied(r.kind === 'copied' ? '글을 복사했어요.' : '글을 복사하지 못했어요.'),
            )
          }
        >
          {copy['CPY-F11-029']}
        </PixelButton>
      </div>
      <LeaveConfirmDialog guard={guard} returnFocusRef={backRef} />
    </PixelAppShell>
  );
}
