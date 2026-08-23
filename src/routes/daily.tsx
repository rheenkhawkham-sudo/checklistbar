import { createFileRoute } from "@tanstack/react-router";
import { ChecklistPage } from "@/components/ChecklistPage";

export const Route = createFileRoute("/daily")({
  head: () => ({
    meta: [
      { title: "Daily Bar Checklist | RIU Hotels & Resorts" },
      { name: "description", content: "Complete daily open and close bar checklists for RIU Hotels & Resorts." },
      { property: "og:title", content: "Daily Bar Checklist | RIU Hotels & Resorts" },
      { property: "og:description", content: "Complete daily open and close bar checklists for RIU Hotels & Resorts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ChecklistPage mode="daily" />,
});
