import { TeamClient } from "./team-client";

export default function AdminTeamPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Team</h1>
      <p className="mt-1 text-sm text-muted">
        Add partner surveyors and lawyers who log in and fill their own assigned
        reports&apos; findings.
      </p>

      <TeamClient />
    </div>
  );
}
