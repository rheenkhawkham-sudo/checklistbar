import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RIU Bar Checklist" },
      { name: "description", content: "RIU Hotels & Resorts bar operations checklist and report system." },
      { property: "og:title", content: "RIU Bar Checklist" },
      { property: "og:description", content: "RIU Hotels & Resorts bar operations checklist and report system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/daily" });
  },
});
