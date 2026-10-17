import { Church } from "lucide-react";

const sizes = {
  sm: { box: "h-8 w-8", icon: 16, text: "text-sm" },
  md: { box: "h-11 w-11", icon: 22, text: "text-base" },
  lg: { box: "h-14 w-14", icon: 28, text: "text-lg" },
} as const;

export const BrandMark = ({
  size = "sm",
  withWordmark = false,
}: {
  size?: keyof typeof sizes;
  withWordmark?: boolean;
}) => {
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid ${s.box} shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-sm shadow-brand-600/20`}
      >
        <Church size={s.icon} strokeWidth={2} />
      </span>
      {withWordmark && (
        <span className={`font-display ${s.text} font-semibold tracking-tight text-slate-900`}>
          Church MS
        </span>
      )}
    </div>
  );
};
