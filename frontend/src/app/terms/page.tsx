import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — ForgeOS",
  description: "Terms of use and disclaimer for the ForgeOS demo.",
};

const SECTIONS = [
  {
    title: "What ForgeOS is",
    body: [
      "ForgeOS is a student hackathon project that demonstrates an AI-powered product planning and prototyping agent. It provides AI-generated suggestions, plans, timelines, and prototype code based on the project idea you enter. It is offered as a free demo, as is, without warranties of any kind.",
    ],
  },
  {
    title: "AI-generated content and errors",
    body: [
      "Everything ForgeOS produces, including plans, agent messages, reviews, metrics, and code, is generated automatically by AI models or deterministic templates. Outputs may be incomplete, inaccurate, outdated, or simply wrong, and may not be suitable for your purpose.",
      "You should independently verify any technical, legal, financial, security, or business decision before relying on ForgeOS output. Generated code has not been reviewed by a person and should be treated as a starting point, not production software.",
    ],
  },
  {
    title: "No guarantees",
    body: [
      "ForgeOS makes no guarantee of business success, profitability, security, regulatory compliance, or fitness for a particular purpose. Names, metrics, and projections shown in the interface are illustrative and generated for demonstration.",
    ],
  },
  {
    title: "Your responsibilities",
    body: [
      "You are responsible for your own projects and for how you use anything ForgeOS generates. Do not submit content that is unlawful, infringes the rights of others, or contains personal or confidential information. Do not attempt to abuse, overload, or circumvent the protections on this demo.",
    ],
  },
  {
    title: "Availability and changes",
    body: [
      "This is a beta demo with usage limits. The service may be rate limited, changed, interrupted, or taken offline at any time without notice. When the AI provider is unavailable, ForgeOS may show template-based fallback content, clearly running in a degraded mode.",
    ],
  },
  {
    title: "Limitation of liability",
    body: [
      "To the maximum extent permitted by law, the ForgeOS maintainer is not liable for any damages arising from your use of, or inability to use, this demo or its outputs. If you do not agree with these terms, please do not use ForgeOS.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Questions about these terms can be sent to the project maintainer: code.acct.26@gmail.com, or via the project's GitHub repository.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-blueprint"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to ForgeOS
      </Link>

      <div className="mt-6 mb-2 inline-flex items-center gap-2 rounded-full border border-blueprint/25 bg-blueprint/5 px-3 py-1">
        <span className="font-mono text-[11px] tracking-wider text-blueprint uppercase">
          Legal, Rev. 001
        </span>
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        Last updated: July 6, 2026 &middot; ForgeOS is a beta hackathon project.
      </p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-mono text-xs tracking-[0.2em] text-blueprint uppercase">
              {section.title}
            </h2>
            <div className="mt-2 space-y-3">
              {section.body.map((paragraph, i) => (
                <p
                  key={i}
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
