import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Pulse</h1>
      <p className="mt-4 text-muted-foreground">
        Your personal work dashboard
      </p>
    </main>
  );
}
