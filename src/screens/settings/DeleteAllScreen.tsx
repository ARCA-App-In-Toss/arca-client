import { paths, useArcaNavigate } from '../../app/navigation.ts';
import { PixelAppShell, PixelButton, PixelIconButton, ScreenTitle, StatePanel } from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';
export function DeleteAllScreen() {
  const navigate = useArcaNavigate();
  return (
    <PixelAppShell>
      <div className="arca-screen-header">
        <PixelIconButton label={copy['CPY-COM-005']} icon="back" onClick={() => navigate(paths.settings)} />
        <ScreenTitle>{copy['CPY-F31-001']}</ScreenTitle>
      </div>
      <StatePanel>
        <p>전체 데이터 삭제 기능을 준비하고 있어요.</p>
        <p className="arca-text-secondary">아직 삭제 요청을 보낼 수 없어요. 저장한 기록은 그대로 유지돼요.</p>
        <PixelButton onClick={() => navigate(paths.settings)}>설정으로 돌아가기</PixelButton>
      </StatePanel>
    </PixelAppShell>
  );
}
