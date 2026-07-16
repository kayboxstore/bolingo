/**
 * Icônes structurelles — charte 05 : contour 2 px, terminaisons arrondies,
 * grille 24 px, charbon par défaut (la couleur suit `currentColor`).
 * Le cœur vit avec le logo (même tracé) mais est ré-exporté ici : ce fichier
 * est le point d'entrée unique des icônes.
 */

export { HeartIcon } from "@/components/brand/logo";

function Icon({
  path,
  className = "h-6 w-6",
  label,
}: {
  path: string;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      <path vectorEffect="non-scaling-stroke" d={path} />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: { className?: string }) {
  return <Icon path="M19 12H5m0 0 6-6m-6 6 6 6" className={className} />;
}

export function ArrowRightIcon({ className }: { className?: string }) {
  return <Icon path="M5 12h14m0 0-6-6m6 6-6 6" className={className} />;
}

export function XIcon({ className }: { className?: string }) {
  return <Icon path="M6 6l12 12M18 6L6 18" className={className} />;
}

export function MapPinIcon({ className }: { className?: string }) {
  return (
    <Icon
      path="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
      className={className}
    />
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return <Icon path="m6 9 6 6 6-6" className={className} />;
}

export function EllipsisIcon({ className }: { className?: string }) {
  // Décorative : le bouton parent porte le nom accessible (cohérent avec le
  // reste du set — aria-hidden, jamais de label par défaut).
  return <Icon path="M6 12h.01M12 12h.01M18 12h.01" className={className} />;
}

export function BellIcon({ className }: { className?: string }) {
  return (
    <Icon
      path="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
      className={className}
    />
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <Icon
      path="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
      className={className}
    />
  );
}
