import Image from "next/image";
import type { AmenityImage } from "@/lib/projects";

export default function AmenityShowcase({
  images,
  projectTitle,
}: {
  images: AmenityImage[];
  projectTitle: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {images.map((img) => (
        <figure
          key={img.src}
          className="group relative aspect-[10/9] overflow-hidden rounded-xl border border-ink/10 bg-white"
        >
          <Image
            src={img.src}
            alt={`${img.title}, ${projectTitle} amenity`}
            fill
            className="object-cover transition-transform duration-400 ease-out group-hover:scale-105"
            sizes="(min-width: 1024px) 33vw, 50vw"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 pb-2.5 pt-10 text-xs font-semibold text-white">
            {img.title}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}