import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — ForgeOS",
  description: "How ForgeOS handles the information you provide.",
};

const SECTIONS = [
  {
    title: "What ForgeOS processes",
    body: [
      "ForgeOS is a demonstration project built for a student hackathon. When you launch a run, the project idea you type is sent to the ForgeOS backend, which uses it to generate a project plan, task timeline, and starter code preview.",
      "ForgeOS does not ask for, and you should not submit, personal information such as names, addresses, passwords, financial details, or health information. Please describe project ideas only.",
    ],
  },
  {
    title: "How AI-generated outputs are created",
    body: [
      "Your project idea is sent to a third-party large language model, Qwen (qwen-plus), operated by Alibaba Cloud, to generate plans, agent messages, reviews, and starter code. When the AI service is unavailable, ForgeOS generates outputs from built-in deterministic templates instead, and no data is sent to the AI provider.",
      "AI outputs are generated automatically and are not reviewed by a person before you see them.",
    ],
  },
  {
    title: "Whether prompts and results are stored",
    body: [
      "ForgeOS keeps your prompt and the generated results in the server's temporary memory only while it runs, so that live streams can reconnect and recent runs can be replayed. Nothing is written to a database, and this temporary data is lost whenever the server restarts. Standard technical logs (such as timestamps and error messages) may include your project idea text and your IP address for debugging and abuse prevention.",
      "The Qwen AI provider receives your prompt in order to generate a response and handles it under its own privacy policy. ForgeOS cannot control the provider's retention practices.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "ForgeOS uses Qwen Cloud (model: qwen-plus) via Alibaba Cloud's DashScope API to generate AI content. Depending on where the demo is hosted, hosting providers may also process standard web traffic data (such as IP addresses) to deliver the site.",
      "ForgeOS does not use advertising, analytics trackers, or third-party cookies.",
    ],
  },
  {
    title: "Security practices",
    body: [
      "API credentials are stored in server-side environment variables and are never sent to your browser. Requests are validated for length, and rate limits protect the service from abuse. This is a beta project built by a student team, so it has not undergone a formal security audit; please treat it accordingly and do not submit sensitive information.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "Because ForgeOS does not maintain user accounts or a database of prompts, there is generally nothing stored to retrieve or delete after a server restart. If you have questions about information you submitted, or want to ask about anything in this policy, contact the maintainer and we will do our best to help.",
      "Depending on where you live, you may have additional rights under local privacy law regarding data held by third-party providers such as the AI service.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Questions about this policy can be sent to the project maintainer: code.acct.26@gmail.com. You can also open an issue on the project's GitHub repository.",
    ],
  },
];

export default function PrivacyPolicyPage() {
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
        Privacy Policy
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
