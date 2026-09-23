import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SoundToggle } from "@/components/audio/SoundToggle";
import { IntensitySelector } from "@/components/party/IntensitySelector";
import { PlayerManager } from "./PlayerManager";
import type { Intensity, Player } from "@/lib/domain/schemas";

export function InGameSettings({ open, intensity, players, paused, onIntensity, onPlayers, onPause, onFinish, onClose }: { open: boolean; intensity: Intensity; players: Player[]; paused: boolean; onIntensity: (value: Intensity) => void; onPlayers: (value: Player[]) => void; onPause: () => void; onFinish: () => void; onClose: () => void }) {
  return <Modal open={open} title="局中设置" onClose={onClose}><div className="in-game-settings"><IntensitySelector value={intensity} onChange={onIntensity} /><PlayerManager players={players} onChange={onPlayers} /><SoundToggle /><div className="in-game-settings__actions"><Button variant="secondary" type="button" onClick={onPause}>{paused ? "继续本局" : "暂停本局"}</Button><Button variant="danger" type="button" onClick={onFinish}>结束本局</Button></div></div></Modal>;
}
