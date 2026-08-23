import { createFileRoute } from "@tanstack/react-router";
import { ChecklistPage } from "@/components/ChecklistPage";

export const Route = createFileRoute("/monthly")({
  head: () => ({
    meta: [
      { title: "Weekly Cleaning | RIU Bar Checklist" },
      { name: "description", content: "Manage weekly bar cleaning checklists for RIU Hotels & Resorts." },
      { property: "og:title", content: "Weekly Cleaning | RIU Bar Checklist" },
      { property: "og:description", content: "Manage weekly bar cleaning checklists for RIU Hotels & Resorts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ChecklistPage mode="monthly" />,
});
