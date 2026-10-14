import type { WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import { copy } from '../../ui/copy.ts';
import { type CopyResult, copyResultMessage, type KeepState } from '../shared/compose.ts';
export interface WriteStatusInput {
  view: WriteView;
  workingShown: boolean;
  loading: boolean;
  semaStopped: boolean;
  keep: KeepState;
  switchBlocked: boolean;
  restoredClean: boolean;
  announcement: string | null;
  copyResult: CopyResult;
  saveProblem: boolean;
}
export function writeStatus(input: WriteStatusInput) {
  const parts: string[] = [];
  let announcement: string | null = null;
  if (input.loading) parts.push(copy['CPY-F11-009']);
  if (input.semaStopped) parts.push(copy['CPY-F11-033']);
  else if (input.view.kind === 'working' && input.workingShown)
    parts.push(input.view.stage === 'confirming' ? copy['CPY-F11-024'] : copy['CPY-F11-019']);
  else if (input.view.kind === 'unconfirmed')
    parts.push('저장 결과를 확인하지 못했어요. 글은 기기에 남아 있어요. 오늘 기록을 확인하거나 다시 저장해 주세요.');
  else if (input.view.kind === 'rejected')
    parts.push(
      input.view.code === 'ANSWER_ALREADY_EXISTS'
        ? '오늘의 기록이 이미 있어요. 작성한 글을 복사해 두고 오늘 기록을 확인해 주세요.'
        : copy['CPY-F11-020'],
    );
  else if (input.view.kind === 'localFailure' || input.keep.failed) parts.push(copy['CPY-F11-013']);
  else if (input.switchBlocked) parts.push(copy['CPY-F11-017']);
  else announcement = input.restoredClean ? copy['CPY-F11-012'] : input.announcement;
  const copied = copyResultMessage(input.copyResult);
  if (copied) parts.push(copied);
  return {
    message: parts.length ? parts.join(' ') : null,
    danger: input.saveProblem || input.keep.failed || input.copyResult === 'failed',
    announcement,
  };
}
