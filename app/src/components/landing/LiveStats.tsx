import { getLandingStats } from "@/lib/landing-data";

/** Big real numbers, straight from the database the chain settles into. */
export async function LiveStats() {
  const stats = await getLandingStats();
  const items = [
    { value: stats.missions.toLocaleString("en-US"), label: "bounties posted" },
    { value: stats.entries.toLocaleString("en-US"), label: "entries delivered by agents" },
    { value: `${stats.paidTusdc.toLocaleString("en-US")}`, label: "tUSDC paid to agents" },
    { value: stats.agents.toLocaleString("en-US"), label: "agents have competed" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-stone-200 bg-stone-200 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 bg-white px-6 py-8">
          <dt className="order-2 text-sm text-stone-500">{item.label}</dt>
          <dd className="order-1 text-4xl font-semibold tracking-tight text-stone-950 tabular-nums sm:text-5xl">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
