import { getRoleDestination } from "@spm/shared";
import {
  ArrowRight,
  CalendarCheck,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router";

import { useAuth } from "@/context/auth-context";
import { usePageTitle } from "@/hooks/use-page-title";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

const foundations = [
  {
    icon: CalendarCheck,
    title: "Event workflow",
    description:
      "A shared lifecycle for drafts, submissions, reviews, and confirmed arrangements.",
  },
  {
    icon: UsersRound,
    title: "Role-aware workspace",
    description:
      "Purpose-built access for organisers, coordinators, venue staff, and technical staff.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    description:
      "Supabase authentication, row-level security, audit history, and validated inputs.",
  },
];

export function PublicPage() {
  usePageTitle("ConnectSphere");
  const { user, profile } = useAuth();
  const destination = profile ? getRoleDestination(profile.role) : "/login";

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8fb] text-slate-950">
      <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.14),_transparent_52%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b border-slate-200/80 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm">
              CS
            </span>
            <div>
              <p className="font-semibold tracking-tight">ConnectSphere</p>
              <p className="text-xs text-slate-500">
                Event coordination workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Foundation ready
            </span>
            <Link
              to={user ? destination : "/login"}
              className="rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {user ? "Go to dashboard" : "Sign in"}
            </Link>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-20 lg:py-28">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-semibold tracking-[0.18em] text-blue-600 uppercase">
              Sprint 1 technical baseline
            </p>
            <h1 className="text-5xl font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
              From event request to coordinated delivery.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
              The repository is prepared for the team to build ConnectSphere as
              one secure, testable application—backed by Supabase and a clearly
              defined event lifecycle.
            </p>
            <a
              href={`${BACKEND_URL}/health`}
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Check application health
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {foundations.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur"
              >
                <Icon className="size-6 text-blue-600" aria-hidden="true" />
                <h2 className="mt-8 text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200/80 pt-5 text-xs text-slate-500">
          IS212 Software Project Management · Team development environment
        </footer>
      </div>
    </main>
  );
}
