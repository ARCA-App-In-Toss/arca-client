import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router';
import { useCompletions } from '../../app/hooks/writes.ts';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { PixelAppShell, PixelButton, RollingCount, ScenePanel } from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount } from '../../ui/format.ts';
import { MemoryFragment } from '../../ui/pixel.tsx';

const [countLead, countTail] = copy['CPY-F12-012'].split('{memoryCount}');

export function SavedScreen() {
  const routeState = useRouteState();
  const navigate = useArcaNavigate();
  const completions = useCompletions();
  const refs = useAnswerRefs();
  const completion = completions.get(refs.resolve(routeState?.answerRef));
  const resultRef = useRef<HTMLHeadingElement>(null);

  const count = completion?.activeAnswerCount;

  useEffect(() => {
    resultRef.current?.focus({ preventScroll: true });
  }, []);

  if (!completion) return <Navigate to={paths.today} replace />;

  return (
    <PixelAppShell className="arca-page--saved">
      <h1 className="arca-visually-hidden">{copy['CPY-F12-001']}</h1>
      <ScenePanel labelledBy="f12-result" art>
        <div className="arca-formation" aria-hidden="true">
          <MemoryFragment cell={4} />
        </div>
        <h2 ref={resultRef} tabIndex={-1} className="arca-screen-title arca-screen-title--result" id="f12-result">
          {copy['CPY-F12-004']}
        </h2>
        {count ? (
          // biome-ignore lint/a11y/useSemanticElements: 기록 수를 이름 붙은 group으로 묶는다.
          <div role="group" aria-label={copy['CPY-F12-019']} className="arca-memory-count">
            <span className="arca-visually-hidden">
              {fill(copy['CPY-F12-012'], { memoryCount: formatCount(count.count) })}
            </span>
            <span aria-hidden="true">
              {countLead}
              <RollingCount from={formatCount(Math.max(0, count.count - 1))} to={formatCount(count.count)} />
              {countTail}
            </span>
          </div>
        ) : null}
      </ScenePanel>
      <div className="arca-actions">
        <PixelButton
          variant="primary"
          onClick={() => navigate(paths.detail, { answerRef: routeState?.answerRef ?? '' })}
        >
          {copy['CPY-F10-016']}
        </PixelButton>
        <PixelButton onClick={() => navigate(paths.today)}>{copy['CPY-F12-014']}</PixelButton>
      </div>
    </PixelAppShell>
  );
}
