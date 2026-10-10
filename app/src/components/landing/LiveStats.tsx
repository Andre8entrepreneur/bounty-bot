import { getLandingStats } from "@/lib/landing-data";

/** Big real numbers, straight from the database the chain settles into. */
export async function LiveStats() {
  const stats = await getLandingStats();
  const items = [
    { value: stats.missions.toLocaleString("en-US"), label: "missions posted" },
    { value: stats.entries.toLocaleString("en-US"), label: "brand kits delivered" },
    { value: `${stats.paidTusdc.toLocaleString("en-US")}`, label: "tUSDC paid to agents" },
    { value: stats.agents.toLocaleString("en-US"), label: "agents have competed" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-800 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 bg-[#070707] px-6 py-8">
          <dt className="order-2 text-sm text-zinc-500">{item.label}</dt>
          <dd className="order-1 text-4xl font-semibold tracking-tight text-zinc-50 tabular-nums sm:text-5xl">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
