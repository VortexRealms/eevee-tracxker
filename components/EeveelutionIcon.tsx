import type { ReactNode } from "react";
import type { PokemonName } from "../types";

const DEFAULT_SIZE = 22;
const DARK = "#1a120e";
const OUTLINE = "#3a2a18";
const GOLD = "#f0c84a";
const CREAM = "#f3d7b0";

function IconFrame({
  size = DEFAULT_SIZE,
  children,
}: {
  size?: number;
  children: ReactNode;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11.2" fill="rgba(244, 217, 182, 0.22)" />
      {children}
    </svg>
  );
}

function Eyes({ fill = DARK }: { fill?: string }) {
  return (
    <>
      <circle cx="9.3" cy="13.2" r="1.05" fill={fill} />
      <circle cx="14.7" cy="13.2" r="1.05" fill={fill} />
    </>
  );
}

function Head({
  fill,
  outline = false,
}: {
  fill: string;
  outline?: boolean;
}) {
  return (
    <circle
      cx="12"
      cy="13.5"
      r="6.8"
      fill={fill}
      stroke={outline ? OUTLINE : undefined}
      strokeWidth={outline ? 0.85 : undefined}
    />
  );
}

function EeveeIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <ellipse cx="7.1" cy="7.4" rx="3.1" ry="4.1" fill="#c48a4a" />
      <ellipse cx="16.9" cy="7.4" rx="3.1" ry="4.1" fill="#c48a4a" />
      <Head fill="#c48a4a" />
      <path
        d="M6.4 16.4 C8.2 20.6 15.8 20.6 17.6 16.4 C15.4 19 8.6 19 6.4 16.4Z"
        fill={CREAM}
      />
      <Eyes />
    </IconFrame>
  );
}

function VaporeonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M10.6 12.2 L5.4 2.2 L3.8 11.8 Z" fill="#4aa4d6" />
      <path d="M13.4 12.2 L18.6 2.2 L20.2 11.8 Z" fill="#4aa4d6" />
      <Head fill="#4aa4d6" />
      <path d="M7.6 17.6 L12 21.4 L16.4 17.6 Z" fill="#f4d27a" />
      <Eyes />
    </IconFrame>
  );
}

function JolteonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path
        d="M12 1.6 L14.6 8.4 H9.4 Z M4.8 5.2 L9.6 10.2 L3.6 11.4 Z M19.2 5.2 L20.4 11.4 L14.4 10.2 Z"
        fill="#f0c84a"
        stroke={OUTLINE}
        strokeWidth="0.85"
        strokeLinejoin="round"
      />
      <Head fill="#f0c84a" outline />
      <Eyes />
    </IconFrame>
  );
}

function FlareonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path
        d="M10.8 11.4 C6.2 2.4 2.4 4.8 6.2 12.2 C7.4 12 9.4 11.8 10.8 11.4Z"
        fill="#e07038"
      />
      <path
        d="M13.2 11.4 C17.8 2.4 21.6 4.8 17.8 12.2 C16.6 12 14.6 11.8 13.2 11.4Z"
        fill="#e07038"
      />
      <Head fill="#e07038" />
      <ellipse cx="6.6" cy="15.2" rx="2.4" ry="3.1" fill={CREAM} />
      <ellipse cx="17.4" cy="15.2" rx="2.4" ry="3.1" fill={CREAM} />
      <Eyes />
    </IconFrame>
  );
}

function EspeonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M10.8 11.6 L6.6 1.8 L4.8 12 Z" fill="#c989e0" />
      <path d="M13.2 11.6 L17.4 1.8 L19.2 12 Z" fill="#c989e0" />
      <Head fill="#c989e0" />
      <path d="M12 8.6 L13.35 10.35 L12 12 L10.65 10.35 Z" fill="#e07070" />
      <Eyes />
    </IconFrame>
  );
}

function UmbreonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path
        d="M10.8 11.8 L6.8 2.2 L4.6 12.2 Z"
        fill="#1c1713"
        stroke={GOLD}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 11.8 L17.2 2.2 L19.4 12.2 Z"
        fill="#1c1713"
        stroke={GOLD}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M6.4 3.6 L8.1 7.2 L5.4 7.6 Z" fill={GOLD} />
      <path d="M17.6 3.6 L18.6 7.6 L15.9 7.2 Z" fill={GOLD} />
      <circle
        cx="12"
        cy="13.5"
        r="6.8"
        fill="#1c1713"
        stroke={GOLD}
        strokeWidth="1.15"
      />
      <circle
        cx="8.35"
        cy="15.15"
        r="2.15"
        fill="none"
        stroke={GOLD}
        strokeWidth="1.2"
      />
      <circle
        cx="15.65"
        cy="15.15"
        r="2.15"
        fill="none"
        stroke={GOLD}
        strokeWidth="1.2"
      />
      <Eyes fill={GOLD} />
    </IconFrame>
  );
}

function LeafeonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path
        d="M10.8 11.8 C10.4 7.2 7.2 2.8 4.8 5.6 C2.8 8.2 7.2 13.4 10.8 11.8Z"
        fill="#7cbc4a"
      />
      <path
        d="M13.2 11.8 C13.6 7.2 16.8 2.8 19.2 5.6 C21.2 8.2 16.8 13.4 13.2 11.8Z"
        fill="#7cbc4a"
      />
      <Head fill="#7cbc4a" />
      <Eyes />
    </IconFrame>
  );
}

function GlaceonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path
        d="M10.6 11.4 L3.4 4.2 L7.2 12.4 Z"
        fill="#7ec8e8"
        stroke={OUTLINE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M13.4 11.4 L20.6 4.2 L16.8 12.4 Z"
        fill="#7ec8e8"
        stroke={OUTLINE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path d="M12 3.8 L13.45 6.7 L12 8.1 L10.55 6.7 Z" fill="#d7f3fb" />
      <Head fill="#7ec8e8" outline />
      <Eyes />
    </IconFrame>
  );
}

function SylveonIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path
        d="M10.8 11.6 L6.8 2 L5 12 Z"
        fill="#f2b6c8"
        stroke={OUTLINE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 11.6 L17.2 2 L19 12 Z"
        fill="#f2b6c8"
        stroke={OUTLINE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M2.8 12.4 C2.8 8.8 7.4 8.6 7.6 12.4 C7.6 15.6 2.8 15.8 2.8 12.4Z"
        fill="#f2b6c8"
        stroke={OUTLINE}
        strokeWidth="0.8"
      />
      <path
        d="M16.4 12.4 C16.4 8.6 21.2 8.8 21.2 12.4 C21.2 15.8 16.4 15.6 16.4 12.4Z"
        fill="#7ec8e8"
        stroke={OUTLINE}
        strokeWidth="0.8"
      />
      <Head fill="#f2b6c8" outline />
      <Eyes />
    </IconFrame>
  );
}

function AllIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path
        d="M12 4.4 L13.55 9.5 H18.7 L14.55 12.55 L16.05 17.7 L12 14.7 L7.95 17.7 L9.45 12.55 L5.3 9.5 H10.45 Z"
        fill="#f4d9b6"
      />
    </IconFrame>
  );
}

const ICONS: Record<PokemonName, (props: { size?: number }) => ReactNode> = {
  Eevee: EeveeIcon,
  Vaporeon: VaporeonIcon,
  Jolteon: JolteonIcon,
  Flareon: FlareonIcon,
  Espeon: EspeonIcon,
  Umbreon: UmbreonIcon,
  Leafeon: LeafeonIcon,
  Glaceon: GlaceonIcon,
  Sylveon: SylveonIcon,
};

export function EeveelutionIcon({
  name,
  size = DEFAULT_SIZE,
}: {
  name: PokemonName | "all";
  size?: number;
}) {
  if (name === "all") {
    return <AllIcon size={size} />;
  }

  const Icon = ICONS[name];
  return <Icon size={size} />;
}
