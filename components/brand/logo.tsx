import Link from "next/link";

export function HeartIcon({
  className = "h-6 w-6 text-accent",
}: {
  className?: string;
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
      aria-hidden="true"
    >
      <path
        vectorEffect="non-scaling-stroke"
        d="M12 20.5c-.4 0-4.8-2.9-7.2-5.9C3 12.3 2.5 9.6 4 7.6a4.6 4.6 0 0 1 7.3-.2l.7.9.7-.9a4.6 4.6 0 0 1 7.3.2c1.5 2 1 4.7-.8 7-2.4 3-6.8 5.9-7.2 5.9Z"
      />
    </svg>
  );
}

export interface LogoProps {
  className?: string;
  variant?: "default" | "white";
  asLink?: boolean;
}

export function Logo({ className = "", variant = "default", asLink = true }: LogoProps) {
  const isWhite = variant === "white";

  const content = (
    <>
      <HeartIcon className={`h-6 w-6 ${isWhite ? "text-white" : "text-accent"}`} />
      <span
        className={`font-display text-2xl font-bold lowercase tracking-tight ${
          isWhite ? "text-white" : "text-ink"
        }`}
      >
        bolingo
      </span>
    </>
  );

  const wrapperClassName = `inline-flex min-w-24 items-center gap-2 ${className}`;

  if (!asLink) {
    return (
      <span className={wrapperClassName} aria-hidden="true">
        {content}
      </span>
    );
  }

  return (
    <Link href="/" className={wrapperClassName} aria-label="Bolingo — accueil">
      {content}
    </Link>
  );
}
