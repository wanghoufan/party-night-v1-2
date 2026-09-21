import Image from "next/image";

export function PartyNightLogo({ compact = false }: { compact?: boolean }) {
  return <Image src={compact ? "/brand/party-night-mark.svg" : "/brand/party-night-logo.svg"} alt="Party Night" width={compact ? 72 : 320} height={compact ? 72 : 75} priority />;
}
