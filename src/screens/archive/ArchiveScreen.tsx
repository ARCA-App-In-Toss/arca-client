import { paths, useArcaNavigate } from '../../app/navigation.ts';
import { PixelAppShell, PixelButton, StatePanel } from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';
import { RootHeader, RootTabs } from '../RootTabs.tsx';
export function ArchiveScreen() {
  const navigate = useArcaNavigate();
  return (
    <PixelAppShell tabs={<RootTabs current="archive" />}>
      <RootHeader title={copy['CPY-F20-001']} />
      <StatePanel>
        <p>항해 기록 목록을 준비하고 있어요.</p>
        <p className="arca-text-secondary">오늘 남긴 기록은 오늘 화면에서 확인할 수 있어요.</p>
        <PixelButton onClick={() => navigate(paths.today)}>오늘의 기록 보기</PixelButton>
      </StatePanel>
    </PixelAppShell>
  );
}
