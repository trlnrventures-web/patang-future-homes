import type { Configuration, Project } from "@/lib/projects";
import { priceValidityInfo } from "@/lib/projects";
import { amenityLabel } from "@/lib/amenities";

const WHATSAPP_NUMBER = "917249138197";

const TYPE_LABELS: Record<Project["type"], string> = {
  flat: "Flat",
  shop: "Shop",
  bungalow: "Bungalow",
};

type ConfigGroup = {
  key: string;
  label: string;
  bhk?: number;
  items: Configuration[];
};

const ARROW_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
  >
    <path
      fillRule="evenodd"
      d="M3 10a.75.75 0 0 1 .75-.75h8.69L9.22 6.03a.75.75 0 1 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H3.75A.75.75 0 0 1 3 10z"
      clipRule="evenodd"
    />
  </svg>
);

function groupConfigurations(configs: Configuration[]): ConfigGroup[] {
  const byBhk = new Map<number, Configuration[]>();
  const others: ConfigGroup[] = [];

  for (const c of configs) {
    const match = c.type.match(/^(\d+)\s*BHK/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!byBhk.has(n)) byBhk.set(n, []);
      byBhk.get(n)!.push(c);
    } else {
      others.push({ key: c.type, label: c.type, items: [c] });
    }
  }

  const grouped = [...byBhk.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, items]) => ({
      key: String(n),
      label: `${n} BHK`,
      bhk: n,
      items,
    }));

  return [...grouped, ...others];
}

function areaNumbers(items: Configuration[]): number[] {
  const nums: number[] = [];
  for (const c of items) {
    const source = c.saleableArea ?? c.carpetArea ?? "";
    const found = (source.match(/\d{3,}(?:\.\d+)?/g) || []).map(Number);
    nums.push(...found);
  }
  return nums.filter((n) => n > 0);
}

function priceInLacs(value: string): number | null {
  const match = value
    .replace(/,/g, "")
    .match(/₹\s*(\d+(?:\.\d+)?)\s*(Lacs?|Lakh|L|Crores?|Cr)?/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  return unit.startsWith("cr") ? num * 100 : num;
}

function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2);
}

function formatLacs(n: number): string {
  if (n >= 100) {
    return `₹${formatNumber(n / 100)} Cr`;
  }
  return `₹${formatNumber(n)} Lacs`;
}

function displayArea(items: Configuration[]): string {
  const nums = areaNumbers(items);
  if (nums.length === 0) return "On Request";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max
    ? `${formatNumber(min)} sq.ft.`
    : `${formatNumber(min)} – ${formatNumber(max)} sq.ft.`;
}

function displayPrice(items: Configuration[]): string {
  const prices = items
    .map((c) => priceInLacs(c.price ?? ""))
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return "On Request";
  return `${formatLacs(Math.min(...prices))}*`;
}

function whatsappUrl(project: Project, group: ConfigGroup): string {
  const configuration = group.bhk
    ? `${group.label} configuration`
    : group.label;
  const text = encodeURIComponent(
    `Hi, I'd like to get the exact price for the ${configuration} at ${project.title} in ${project.location}. Please share the latest price list.`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

export default function ConfigPriceCard({ project }: { project: Project }) {
  const groups = groupConfigurations(project.configurations);

  return (
    <div className="flex flex-col gap-3.5">
      {(() => {
        const pv = priceValidityInfo(project);
        if (!pv) return null;
        return (
          <div className="rounded-[14px] border border-amber-300 bg-gradient-to-r from-amber-50 to-white p-4 text-center">
            <span className="text-xs font-bold text-amber-700">{pv.label}</span>
          </div>
        );
      })()}
      {groups.map((group) => {
        const location = project.location ?? "Vasai";
        const configuration = group.bhk
          ? `${group.label} ${TYPE_LABELS[project.type]} in ${location}`
          : `${group.label} in ${location}`;

        return (
          <div
            key={group.key}
            className="rounded-[14px] border border-border bg-background p-5"
          >
            <dl className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-soft">
                  Configuration
                </dt>
                <dd className="text-sm font-bold text-ink">
                  {configuration}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-soft">
                  Usable Area
                </dt>
                <dd className="text-sm font-bold text-ink">
                  {displayArea(group.items)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-soft">
                  Starting Price
                </dt>
                <dd className="text-sm font-bold text-primary">
                  {displayPrice(group.items)}
                </dd>
              </div>
            </dl>

            {(group.items.some((c) => c.allInclusive) ||
              group.items.some((c) => c.parkingIncluded) ||
              group.items.some((c) => c.amenities?.length)) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {group.items.some((c) => c.allInclusive) && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    All-inclusive
                  </span>
                )}
                {group.items.some((c) => c.parkingIncluded) && (
                  <span className="rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Parking included
                  </span>
                )}
                {[...new Set(group.items.flatMap((c) => c.amenities ?? []))].map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-ink/[0.04] px-2 py-0.5 text-[10px] font-semibold text-muted"
                  >
                    {amenityLabel(a)}
                  </span>
                ))}
              </div>
            )}

            {group.items[0]?.floorBreakup &&
              group.items[0].floorBreakup.length > 0 && (
                <div className="mt-4 rounded-xl bg-ink/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-soft">
                    Floor-wise price
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {group.items[0].floorBreakup.map((row) => (
                      <li
                        key={row.floors}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="font-medium text-muted">
                          {row.floors}
                        </span>
                        <span className="font-bold text-primary">
                          {row.price}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="mt-5 border-t border-border" />

            <a
              href={whatsappUrl(project, group)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-lavender px-4 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Get exact price
              {ARROW_ICON}
            </a>
          </div>
        );
      })}

      <p className="mt-1 text-xs text-soft">
        *Indicative pricing, subject to change by the developer. Contact us for
        the latest verified price.
      </p>
    </div>
  );
}