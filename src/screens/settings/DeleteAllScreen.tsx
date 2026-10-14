import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import { useAllDataDelete } from '../../app/hooks/settings.ts';
import { paths, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import type { AllDataDeleteView } from '../../domain/deletion/allDataDelete.ts';
import {
  InlineStatus,
  InsetPanel,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  RecordPanel,
  ScreenTitle,
} from '../../ui/components.tsx';
import { type CopyId, copy } from '../../ui/copy.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';

function pageStatus(view: AllDataDeleteView): { id: CopyId | null; tone: 'danger' | 'neutral' } {
  switch (view.kind) {
    case 'working':
      return { id: 'CPY-F31-015', tone: 'neutral' };
    case 'deleted':
      return { id: 'CPY-F31-019', tone: 'neutral' };
    case 'failed':
      return { id: 'CPY-F31-016', tone: 'danger' };
    case 'unconfirmed':
      return { id: 'CPY-F31-027', tone: 'neutral' };
    case 'idle':
      return { id: null, tone: 'neutral' };
  }
}

function openerLabel(view: AllDataDeleteView): string {
  if (view.kind === 'unconfirmed') return copy['CPY-F31-029'];
  if (view.kind === 'failed') return copy['CPY-F31-018'];
  return copy['CPY-F31-010'];
}

export function DeleteAllScreen() {
  const { view, enter, start, recheck } = useAllDataDelete();
  const routeState = useRouteState();
  const routerNavigate = useNavigate();
  const navigate = useArcaNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const working = view.kind === 'working';
  const settled = view.kind === 'deleted';
  const locked = working || settled;

  useEffect(() => {
    enter();
  }, [enter]);

  useEffect(() => {
    if (view.kind !== 'working') setDialogOpen(false);
  }, [view.kind]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname === nextLocation.pathname) return false;
    return locked;
  });
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const leave = () => {
    if (locked) return;
    if (routeState) routerNavigate(-1);
    else navigate(paths.settings, {}, { replace: true });
  };

  const { id: status, tone } = pageStatus(view);
  const onOpener = () => {
    if (view.kind === 'unconfirmed') recheck();
    else setDialogOpen(true);
  };

  return (
    <PixelAppShell>
      <div className="arca-screen-header">
        {!locked && <PixelIconButton label={copy['CPY-COM-005']} icon="back" onClick={leave} />}
        <ScreenTitle>{copy['CPY-F31-001']}</ScreenTitle>
      </div>
      <RecordPanel labelledBy="f31-scope">
        <h2 className="arca-label" id="f31-scope">
          {copy['CPY-F31-002']}
        </h2>
        <ul className="arca-list arca-list--bullets">
          <li>{copy['CPY-F31-020']}</li>
          <li>{copy['CPY-F31-021']}</li>
          <li>{copy['CPY-F31-022']}</li>
        </ul>
      </RecordPanel>
      <InsetPanel>
        <h2 className="arca-label">{copy['CPY-F31-004']}</h2>
        <p className="arca-text-secondary">{copy['CPY-F31-023']}</p>
      </InsetPanel>
      <p className="arca-user-text">{copy['CPY-F31-008']}</p>
      <InlineStatus message={status && !dialogOpen ? copy[status] : null} tone={tone} />
      {!settled && (
        <div className="arca-actions arca-actions--pair">
          <PixelButton disabled={working} onClick={leave}>
            {copy['CPY-F31-009']}
          </PixelButton>
          <PixelButton
            ref={openerRef}
            variant="danger"
            disabled={working}
            loading={working && !dialogOpen}
            onClick={onOpener}
          >
            {openerLabel(view)}
          </PixelButton>
        </div>
      )}
      <PixelAlertDialog
        open={dialogOpen}
        title={copy['CPY-F31-011']}
        description={copy['CPY-F31-012']}
        cancelLabel={copy['CPY-F31-013']}
        actionLabel={copy['CPY-F31-014']}
        danger
        pairActions
        locked={working}
        busy={working}
        status={working ? copy['CPY-F31-015'] : null}
        returnFocusRef={openerRef}
        onCancel={() => setDialogOpen(false)}
        onAction={start}
      />
    </PixelAppShell>
  );
}
