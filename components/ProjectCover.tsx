import Image from "next/image";

const PLACEHOLDER_CLASSES =
  "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-lavender via-primary/25 to-accent-ink/60";

export default function ProjectCover({
  images,
  alt,
  className = "",
  sizes,
  priority,
}: {
  images: string[];
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const src = images[0];

  if (!src) {
    return (
      <div
        className={`${PLACEHOLDER_CLASSES} ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className="text-3xl font-extrabold uppercase tracking-tight text-white/90">
          PFH
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={`object-cover ${className}`}
    />
  );
}