import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import studentsImage from "@/assets/auth/students.jpg";
import { buttonVariants } from "@/components/ui/button";

type AuthSplitScreenProps = {
  children: ReactNode;
};

/**
 * Shared split-screen chrome for auth routes: a full-bleed hero photo on the
 * left (hidden on small screens so only the form shows on mobile) carrying
 * just the one brand tagline, and the actual form on the right.
 */
export function AuthSplitScreen({ children }: AuthSplitScreenProps) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden items-center justify-center overflow-hidden text-white lg:flex">
        <img
          src={studentsImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[center_12%]"
        />
        <div className="absolute inset-0 bg-black/35" />

        <h2 className="relative max-w-sm px-12 text-center text-4xl font-semibold tracking-tight text-balance">
          All events, in one space.
        </h2>
      </section>

      <section className="relative flex items-center justify-center px-6 py-12 sm:px-10">
        <Link
          to="/"
          className={buttonVariants({
            variant: "ghost",
            className: "absolute top-6 left-6",
          })}
        >
          <ArrowLeft /> Back to home
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
