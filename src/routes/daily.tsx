import { createFileRoute } from "@tanstack/react-router";
import { ChecklistPage } from "@/components/ChecklistPage";

export const Route = createFileRoute("/daily")({
  component: () => <ChecklistPage mode="daily" />,
});
