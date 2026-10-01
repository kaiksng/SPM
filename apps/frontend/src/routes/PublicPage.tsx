import { getRoleDestination } from "@spm/shared";
import {
  ArrowRight,
  CalendarDays,
  Compass,
  Flame,
  Gift,
  MapPin,
  Music,
  PauseCircle,
  PlayCircle,
  Search,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { useAuth } from "@/context/auth-context";
import { usePageTitle } from "@/hooks/use-page-title";

const SLIDE_DURATION_MS = 6000;

const heroSlides = [
  {
    label: "Find events",
    eyebrow: "Welcome to ConnectSphere",
    headlineTop: "FIND YOUR",
    headlineBottom: "NEXT EVENT",
    tagline: "// browse it. book it. show up.",
    gradient: "from-[#4a2f6b] via-[#7e57c2] to-[#b39ddb]",
  },
  {
    label: "RSVP fast",
    eyebrow: "Never miss out",
    headlineTop: "RSVP IN",
    headlineBottom: "SECONDS",
    tagline: "// one click, you're on the list.",
    gradient: "from-[#2e1a47] via-[#5e3b8c] to-[#9575cd]",
  },
  {
    label: "Stay in the loop",
    eyebrow: "All in one place",
    headlineTop: "EVERY EVENT",
    headlineBottom: "ON CAMPUS",
    tagline: "// one place to see what's on.",
    gradient: "from-[#3d2a5c] via-[#8667b8] to-[#c9b6e4]",
  },
];

const quickFilters = [
  { label: "Nearby", icon: MapPin },
  { label: "For You", icon: Sparkles },
  { label: "Trending", icon: Flame },
  { label: "Free Events", icon: Gift },
  { label: "This Weekend", icon: CalendarDays },
  { label: "Workshops", icon: Compass },
  { label: "Social", icon: Users },
  { label: "Music", icon: Music },
];

export function PublicPage() {
  usePageTitle("ConnectSphere");
  const { user, profile } = useAuth();
  const destination = profile ? getRoleDestination(profile.role) : "/login";

  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, SLIDE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [paused, activeSlide]);

  const slide = heroSlides[activeSlide]!;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-3 sm:px-10">
          <Link to="/" className="mr-4 flex shrink-0 items-center gap-2.5 sm:mr-8">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              CS
            </span>
            <span className="hidden font-semibold tracking-tight sm:inline">
              ConnectSphere
            </span>
          </Link>

          <Link
            to="/login"
            className="flex min-w-72 flex-1 items-center divide-x divide-border overflow-hidden rounded-full border border-border bg-card shadow-xs transition hover:border-primary/40"
          >
            <span className="flex flex-1 items-center gap-2 px-4 py-2.5 text-sm">
              <Search
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] text-muted-foreground">
                  I&apos;m interested in...
                </span>
                <span className="font-medium">All events</span>
              </span>
            </span>
            <span className="hidden flex-1 items-center gap-2 px-4 py-2.5 text-sm sm:flex">
              <MapPin
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] text-muted-foreground">Where</span>
                <span className="font-medium">All campuses</span>
              </span>
            </span>
            <span className="hidden flex-1 items-center gap-2 px-4 py-2.5 text-sm lg:flex">
              <CalendarDays
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] text-muted-foreground">When</span>
                <span className="font-medium">Anytime</span>
              </span>
            </span>
          </Link>

          <Link
            to="/login"
            className="shrink-0 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Explore nearby
          </Link>

          <Link
            to={user ? destination : "/login"}
            className="shrink-0 text-xs font-semibold text-foreground transition hover:text-primary"
          >
            {user ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </header>

      <section
        className={`relative isolate overflow-hidden bg-gradient-to-br ${slide.gradient} text-white transition-colors duration-700`}
      >
        <div className="mx-auto max-w-6xl px-6 py-20 sm:px-10 sm:py-28">
          <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">
            {slide.eyebrow}
          </p>
          <h1 className="mt-4 text-6xl leading-[0.95] font-black tracking-tight sm:text-7xl lg:text-8xl">
            <span className="block">{slide.headlineTop}</span>
            <span className="block text-white/40">{slide.headlineBottom}</span>
          </h1>
          <p className="mt-6 max-w-md font-mono text-sm text-white/70">
            {slide.tagline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="rounded-full border border-white/70 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10"
            >
              Browse events
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white/90"
            >
              Create an account
            </Link>
          </div>
        </div>

        <div className="relative z-10 border-t border-white/15 bg-black/20 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3 sm:px-10">
            <button
              type="button"
              onClick={() => setPaused((current) => !current)}
              className="shrink-0 text-white/80 transition hover:text-white"
              aria-label={paused ? "Resume rotation" : "Pause rotation"}
            >
              {paused ? (
                <PlayCircle className="size-5" aria-hidden="true" />
              ) : (
                <PauseCircle className="size-5" aria-hidden="true" />
              )}
            </button>
            <div className="flex flex-1 gap-4 overflow-x-auto">
              {heroSlides.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                  className="flex-1 pb-2 text-left whitespace-nowrap"
                >
                  <span
                    className={`text-xs font-medium ${
                      index === activeSlide ? "text-white" : "text-white/50"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="mt-2 block h-0.5 w-full overflow-hidden rounded-full bg-white/20">
                    {index === activeSlide ? (
                      <span
                        key={activeSlide + (paused ? "-paused" : "-playing")}
                        className="block h-full w-full origin-left bg-white"
                        style={
                          paused
                            ? undefined
                            : {
                                animation: `hero-progress ${SLIDE_DURATION_MS}ms linear forwards`,
                              }
                        }
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-10">
          <p className="text-sm text-muted-foreground">
            Showing events in{" "}
            <span className="font-semibold text-foreground">your campus</span>
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden="true" />
            Use my location
          </span>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {quickFilters.map(({ label, icon: Icon }) => (
            <Link
              key={label}
              to="/login"
              className="flex min-w-24 shrink-0 flex-col items-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-center transition hover:border-primary/40 hover:shadow-sm"
            >
              <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 sm:px-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            For you
          </h2>
          <Link
            to="/login"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            See all
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
            <Ticket className="size-5" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold">
            Your picks will show up here
          </h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Sign in and we&apos;ll start tailoring events to what you care
            about.
          </p>
          <Link
            to="/login"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Sign in
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground sm:px-10">
          ConnectSphere · Event coordination workspace
        </div>
      </footer>
    </main>
  );
}
