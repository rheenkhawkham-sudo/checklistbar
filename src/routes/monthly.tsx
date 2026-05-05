import { createFileRoute } from "@tanstack/react-router";
import { ChecklistPage } from "@/components/ChecklistPage";

export const Route = createFileRoute("/monthly")({
  component: () => <ChecklistPage mode="monthly" />,
});
