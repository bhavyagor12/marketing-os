import { Type, Palette } from 'lucide-react';

type ImageAsset = {
  id: string;
  kind: 'image' | 'logo' | 'favicon' | 'og_image';
  sourceUrl: string | null;
  alt: string | null;
  prominence: number;
};

type ColorAsset = { id: string; hex: string; prominence: number };
type FontAsset = { id: string; fontFamily: string; fontProvider: string | null };

const KIND_LABEL: Record<ImageAsset['kind'], string> = {
  og_image: 'Social',
  logo: 'Logo',
  favicon: 'Favicon',
  image: 'Content',
};

export function AssetsGallery({
  images,
  colors,
  fonts,
}: {
  images: ImageAsset[];
  colors: ColorAsset[];
  fonts: FontAsset[];
}) {
  const hasAny = images.length + colors.length + fonts.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-5">
      {images.length > 0 ? (
        <section>
          <SectionHeader label="Images" count={images.length} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img) => (
              <ImageTile key={img.id} img={img} />
            ))}
          </div>
        </section>
      ) : null}

      {colors.length > 0 ? (
        <section>
          <SectionHeader
            label="Color palette"
            count={colors.length}
            icon={<Palette className="h-3.5 w-3.5" />}
          />
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <ColorSwatch key={c.id} hex={c.hex} prominence={c.prominence} />
            ))}
          </div>
        </section>
      ) : null}

      {fonts.length > 0 ? (
        <section>
          <SectionHeader
            label="Typography"
            count={fonts.length}
            icon={<Type className="h-3.5 w-3.5" />}
          />
          <div className="flex flex-wrap gap-2">
            {fonts.map((f) => (
              <FontChip key={f.id} family={f.fontFamily} provider={f.fontProvider} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionHeader({
  label,
  count,
  icon,
}: {
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
      {icon}
      {label}
      <span className="text-stone-400">· {count}</span>
    </h3>
  );
}

function ImageTile({ img }: { img: ImageAsset }) {
  if (!img.sourceUrl) return null;
  return (
    <a
      href={img.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-md border border-stone-200 bg-stone-50 transition hover:border-stone-300"
      title={img.alt ?? img.sourceUrl}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.sourceUrl}
        alt={img.alt ?? ''}
        className="h-full w-full object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">
        {KIND_LABEL[img.kind]}
      </span>
    </a>
  );
}

function ColorSwatch({ hex, prominence }: { hex: string; prominence: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white p-1.5 pr-2.5">
      <span
        className="h-8 w-8 shrink-0 rounded border border-black/5"
        style={{ backgroundColor: hex }}
      />
      <div className="leading-tight">
        <p className="font-mono text-xs text-stone-900">{hex}</p>
        <p className="text-[10px] text-stone-500">weight {prominence}</p>
      </div>
    </div>
  );
}

function FontChip({ family, provider }: { family: string; provider: string | null }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-1.5">
      <span className="text-sm font-medium text-stone-900" style={{ fontFamily: family }}>
        {family}
      </span>
      {provider ? (
        <span className="text-[10px] uppercase tracking-wide text-stone-400">{provider}</span>
      ) : null}
    </div>
  );
}
