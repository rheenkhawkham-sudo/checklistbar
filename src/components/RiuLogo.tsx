import logoAsset from "@/assets/riu-hotels-resorts-logo.png.asset.json";

interface RiuLogoProps {
  compact?: boolean;
}

export function RiuLogo({ compact = false }: RiuLogoProps) {
  return (
    <div className="flex justify-center" aria-label="RIU Hotels & Resorts">
      <img
        src={logoAsset.url}
        alt="RIU Hotels & Resorts"
        className={compact ? "h-14 w-auto object-contain" : "h-20 sm:h-24 w-auto max-w-[80vw] object-contain"}
      />
    </div>
  );
}