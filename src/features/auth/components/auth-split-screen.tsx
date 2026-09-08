import { Calendar, CircleCheck, MapPin } from "lucide-react";
import type { ReactNode } from "react";

type AuthSplitScreenProps = {
  headline: string;
  subcopy: string;
  children: ReactNode;
};

const VALUE_POINTS = [
  {
    icon: Calendar,
    text: "One shared calendar for every venue and event",
  },
  {
    icon: MapPin,
    text: "Venue and equipment requests tracked end to end",
  },
  {
    icon: CircleCheck,
    text: "Approvals and clarifications in a single thread",
  },
];

/**
 * Shared split-screen chrome for the (auth) route group: a branded hero
 * panel on the left (hidden on small screens so only the form shows on
 * mobile) and the actual form on the right. Headline/subcopy are supplied
 * per page since login and signup want different hero copy.
 */
export function AuthSplitScreen({
  headline,
  subcopy,
  children,
}: AuthSplitScreenProps) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="bg-primary text-primary-foreground relative hidden overflow-hidden lg:flex lg:flex-col lg:p-12">
        <DecorativeShapes />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-white/15 text-sm font-bold">
            CS
          </span>
          <span className="text-sm font-semibold tracking-tight">
            ConnectSphere
          </span>
        </div>

        <div className="relative flex flex-1 flex-col justify-center py-10">
          <div className="max-w-md">
            <h2 className="text-4xl font-semibold tracking-tight text-balance">
              {headline}
            </h2>
            <p className="text-primary-foreground/80 mt-4 text-base leading-7">
              {subcopy}
            </p>
          </div>

          <ul className="mt-10 flex max-w-md flex-col gap-4">
            {VALUE_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-primary-foreground/90 text-sm">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-primary-foreground/60 relative text-xs">
          © 2026 ConnectSphere
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}

function DecorativeShapes() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 480 640"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <circle cx="60" cy="70" r="140" className="fill-white/10" />
      <circle cx="420" cy="560" r="180" className="fill-white/10" />
      <path
        d="M-40 380 C 120 300, 300 300, 520 400"
        stroke="white"
        strokeOpacity="0.15"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
