import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useAnswerCommand, usePendingAnswer } from '../../app/hooks/answers.ts';
import { useAnswer, useArchive } from '../../app/hooks/archive.ts';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { DomainFailure } from '../../domain/failures.ts';
import {
  InlineStatus,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  RecordPanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';
import { formatDateKst, isWhitespaceOnly } from '../../ui/format.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';
import { useOfflineOnFailure } from '../shared/offline.ts';
export function AnswerDetailScreen() {
  const state = useRouteState();
  const refs = useAnswerRefs();
  const answerId = refs.resolve(state?.answerRef);
  const detail = useAnswer(answerId);
  const command = useAnswerCommand(answerId);
  const pending = usePendingAnswer(answerId);
  const navigate = useArcaNavigate();
  const { noteDeleted, markStale } = useArchive();
  const offline = useOfflineOnFailure(detail.error);
  const missing = detail.error instanceof DomainFailure && detail.error.code === 'ANSWER_NOT_FOUND';
  const [open, setOpen] = useState(false);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const busy = command.view.kind === 'working';
  const updating =
    (command.view.kind === 'working' || command.view.kind === 'unconfirmed') && command.view.mode === 'UPDATE';
  const deleting =
    (command.view.kind === 'working' || command.view.kind === 'unconfirmed') && command.view.mode === 'DELETE';
  useEffect(() => {
    if (command.view.kind === 'deleted') {
      command.consume();
      noteDeleted();
      navigate(paths.archive, {}, { replace: true });
    }
  }, [command, navigate, noteDeleted]);
  useEffect(() => {
    if (missing) markStale();
  }, [missing, markStale]);
  if (!answerId || missing) return <Navigate to={paths.archive} replace />;
  return (
    <PixelAppShell>
      <div className="arca-screen-header">
        <PixelIconButton label={copy['CPY-COM-005']} icon="back" onClick={() => navigate(paths.archive)} />
        <ScreenTitle>{copy['CPY-F21-001']}</ScreenTitle>
      </div>
      {!detail.data ? (
        detail.isError ? (
          <StatePanel>
            <p>{offline ? copy['CPY-F21-012'] : copy['CPY-F21-011']}</p>
            <PixelButton variant="primary" loading={detail.isFetching} onClick={() => void detail.refetch()}>
              {copy['CPY-F21-013']}
            </PixelButton>
          </StatePanel>
        ) : (
          <PixelPlaceholder />
        )
      ) : (
        <>
          <section className="arca-preface">
            <time className="arca-question-date" dateTime={detail.data.createdDateKst}>
              {formatDateKst(detail.data.createdDateKst)}
            </time>
            <p className="arca-question arca-question--quiet">{detail.data.question.text}</p>
          </section>
          <RecordPanel hero labelledBy="f21-answer-label">
            <p className="arca-label" id="f21-answer-label">
              {copy['CPY-F21-004']}
            </p>
            <p className="arca-user-text arca-user-text--reading">{detail.data.content}</p>
            {isWhitespaceOnly(detail.data.content) && <p>{copy['CPY-COM-004']}</p>}
          </RecordPanel>
          <InlineStatus
            message={
              updating
                ? '수정 결과를 확인하지 못했어요. 수정 화면에서 글을 확인해 주세요.'
                : command.view.kind === 'unconfirmed'
                  ? '삭제 결과를 확인하지 못했어요. 다시 삭제하면 현재 상태를 확인할 수 있어요.'
                  : command.view.kind === 'rejected' || command.view.kind === 'localFailure'
                    ? '삭제하지 못했어요. 다시 시도해 주세요.'
                    : null
            }
          />
          <div className="arca-actions">
            <PixelButton
              disabled={busy || deleting || pending === 'checking'}
              onClick={() => navigate(paths.edit, { answerRef: state?.answerRef ?? '' })}
            >
              {copy['CPY-F21-008']}
            </PixelButton>
            <PixelButton
              ref={deleteRef}
              variant="danger-text"
              disabled={busy || updating || pending === 'checking'}
              onClick={() => setOpen(true)}
            >
              {copy['CPY-F21-009']}
            </PixelButton>
          </div>
          <PixelAlertDialog
            open={open}
            title={copy['CPY-F23-001']}
            description={copy['CPY-F23-005']}
            cancelLabel={copy['CPY-F23-006']}
            actionLabel={command.view.kind === 'unconfirmed' ? '다시 삭제하기' : copy['CPY-F23-007']}
            danger
            busy={busy}
            locked={busy}
            returnFocusRef={deleteRef}
            onCancel={() => setOpen(false)}
            onAction={() => {
              if (command.view.kind === 'unconfirmed') command.retry();
              else command.remove();
            }}
          />
        </>
      )}
    </PixelAppShell>
  );
}
