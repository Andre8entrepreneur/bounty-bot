// Integration test for wallet sign-in + agent registry + the public mission
// feed, against a running app (local `next start` or prod). Plays both
// sides: a developer signing in with a wallet, and an agent connecting
// itself with a one-time code — plus the abuse cases. Cleans up its rows.
//
// Usage: npx tsx scripts/e2e-agents.ts [--base-url http://localhost:3103]
import { config } from "dotenv";
import { createPrivateKey, sign } from "node:crypto";
import { resolve } from "node:path";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import { connectAgentMessage, signInMessage } from "../src/lib/auth/messages";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const argIndex = process.argv.indexOf("--base-url");
const BASE = argIndex > 0 ? process.argv[argIndex + 1] : "http://localhost:3103";

function walletSign(kp: Keypair, message: string): string {
  const key = createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: Buffer.from(kp.secretKey.slice(0, 32)).toString("base64url"),
      x: Buffer.from(kp.publicKey.toBytes()).toString("base64url"),
    },
    format: "jwk",
  });
  return bs58.encode(sign(null, Buffer.from(message, "utf8"), key));
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
}

let failures = 0;
function check(ok: boolean, label: string, detail?: unknown) {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${ok ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function signIn(kp: Keypair): Promise<string> {
  const { json } = await call("POST", "/api/auth/nonce", {});
  const nonce = json.nonce as string;
  const pubkey = kp.publicKey.toBase58();
  const res = await call("POST", "/api/auth/login", {
    pubkey,
    nonce,
    signature: walletSign(kp, signInMessage(pubkey, nonce)),
  });
  check(res.status === 200, "sign-in accepted", res.json);
  const cookie = res.setCookie?.split(";")[0] ?? "";
  check(cookie.startsWith("bb_session="), "session cookie set");
  return cookie;
}

async function main() {
  const owner = Keypair.generate();
  const intruder = Keypair.generate();
  const agent = Keypair.generate();
  const supabase = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY);
  console.log(`Testing against ${BASE}\n`);

  try {
    console.log("Sign-in");
    const cookie = await signIn(owner);
    const me = await call("GET", "/api/auth/me", undefined, cookie);
    check(me.json.pubkey === owner.publicKey.toBase58(), "/me returns the signed-in wallet", me.json);
    const anon = await call("GET", "/api/auth/me");
    check(anon.json.pubkey === null, "/me without cookie is signed out", anon.json);

    const { json: n2 } = await call("POST", "/api/auth/nonce", {});
    const wrongSig = await call("POST", "/api/auth/login", {
      pubkey: owner.publicKey.toBase58(),
      nonce: n2.nonce,
      signature: walletSign(intruder, signInMessage(owner.publicKey.toBase58(), n2.nonce as string)),
    });
    check(wrongSig.status === 401, "sign-in with someone else's signature is refused", wrongSig);
    const forged = await call("GET", "/api/auth/me", undefined, cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")));
    check(forged.json.pubkey === null, "a tampered session cookie is ignored", forged.json);

    console.log("\nRegistry");
    const noAuth = await call("POST", "/api/agents", { name: "Nope" });
    check(noAuth.status === 401, "creating an agent requires sign-in", noAuth);
    const created = await call("POST", "/api/agents", { name: "E2E Test Agent", specialty: "Brand kits" }, cookie);
    check(created.status === 201 && typeof created.json.code === "string", "agent created with a one-time code", created.json);
    const code = created.json.code as string;
    const agentId = (created.json.agent as { id: string }).id;

    const intruderCookie = await signIn(intruder);
    const steal = await call("POST", `/api/agents/${agentId}/code`, {}, intruderCookie);
    check(steal.status === 404, "another account can't issue codes for my agent", steal);

    console.log("\nAgent connects itself");
    const agentPk = agent.publicKey.toBase58();
    const badSig = await call("POST", "/api/agents/connect", {
      code,
      agentPubkey: agentPk,
      signature: walletSign(intruder, connectAgentMessage(code, agentPk)),
    });
    check(badSig.status === 401, "connect signed by a different key is refused", badSig);
    const connected = await call("POST", "/api/agents/connect", {
      code: code.toLowerCase(),
      agentPubkey: agentPk,
      signature: walletSign(agent, connectAgentMessage(code, agentPk)),
    });
    check(connected.status === 200, "agent connects with its own signature (code is case-insensitive)", connected.json);
    const reuse = await call("POST", "/api/agents/connect", {
      code,
      agentPubkey: agentPk,
      signature: walletSign(agent, connectAgentMessage(code, agentPk)),
    });
    check(reuse.status === 409 || reuse.status === 404, "the code can't be used twice", reuse);

    const second = await call("POST", "/api/agents", { name: "Second Agent" }, intruderCookie);
    const secondCode = second.json.code as string;
    const hijack = await call("POST", "/api/agents/connect", {
      code: secondCode,
      agentPubkey: agentPk,
      signature: walletSign(agent, connectAgentMessage(secondCode, agentPk)),
    });
    check(hijack.status === 409, "an already-connected agent wallet can't be claimed by another account", hijack);

    const mine = await call("GET", "/api/agents", undefined, cookie);
    const listed = (mine.json.agents as Array<{ id: string; agent_pubkey: string | null }>) ?? [];
    check(
      listed.some((a) => a.id === agentId && a.agent_pubkey === agentPk),
      "my agents list shows it connected",
      mine.json,
    );

    console.log("\nAgent settings");
    const settings = {
      specialty: "Research briefs",
      description: "Competitor and market research with sources for every claim.",
      fields: ["research", "sales"],
      model: "claude-opus-5-5",
      minBountyTusdc: 15,
      maxCostPct: 5,
      ownFieldsOnly: true,
    };
    const anonSave = await call("PATCH", `/api/agents/${agentId}`, settings);
    check(anonSave.status === 401, "saving settings requires sign-in", anonSave);
    const saved = await call("PATCH", `/api/agents/${agentId}`, settings, cookie);
    check(saved.status === 200, "the owner saves the agent's settings", saved.json);
    const stolen = await call("PATCH", `/api/agents/${agentId}`, { ...settings, minBountyTusdc: 0 }, intruderCookie);
    check(stolen.status === 404, "another account can't change my agent's settings", stolen);
    const badModel = await call("PATCH", `/api/agents/${agentId}`, { ...settings, model: "made-up-model" }, cookie);
    check(badModel.status === 400, "an unknown model is refused", badModel);
    const badField = await call("PATCH", `/api/agents/${agentId}`, { ...settings, fields: ["astrology"] }, cookie);
    check(badField.status === 400, "an unknown field is refused", badField);
    const lookup = await call("GET", `/api/agents/lookup?pubkey=${agentPk}`);
    const read = lookup.json.settings as Record<string, unknown> | undefined;
    check(
      read?.minBountyTusdc === 15 &&
        read?.maxCostPct === 5 &&
        read?.model === "claude-opus-5-5" &&
        read?.ownFieldsOnly === true &&
        JSON.stringify(read?.fields) === JSON.stringify(["research", "sales"]),
      "the connector reads the saved rules from the lookup",
      lookup.json,
    );
    const listedAgain = await call("GET", "/api/agents", undefined, cookie);
    const mineNow = ((listedAgain.json.agents as Array<{ id: string; description: string | null }>) ?? []).find((a) => a.id === agentId);
    check(mineNow?.description === settings.description, "my agents list shows the description", listedAgain.json);

    console.log("\nPublic mission feed");
    const missions = await call("GET", "/api/missions");
    check(missions.status === 200 && Array.isArray(missions.json.missions), "/api/missions responds", missions.json);
    check(typeof missions.json.programId === "string", "feed includes the program id");
    const feedMissions = (missions.json.missions as Array<{ category?: unknown }>) ?? [];
    check(
      feedMissions.every((m) => typeof m.category === "string"),
      "every bounty in the feed says which field it's in",
      feedMissions.map((m) => m.category),
    );
    const idl = await call("GET", "/api/idl");
    check(idl.status === 200 && typeof idl.json.address === "string", "/api/idl serves the program IDL");
  } finally {
    await supabase
      .from("agents")
      .delete()
      .in("owner_pubkey", [owner.publicKey.toBase58(), intruder.publicKey.toBase58()]);
  }

  console.log(failures === 0 ? "\ne2e:agents: all checks passed" : `\ne2e:agents: ${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("e2e:agents crashed:", err);
  process.exit(1);
});
