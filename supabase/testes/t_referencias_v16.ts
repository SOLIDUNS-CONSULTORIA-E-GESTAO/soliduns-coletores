import { extrairJson } from "file:///home/claude/soliduns-coletores/supabase/functions/scanner-do-dia/index.ts";
for (const r of [{ "5,0441": "cot:890" }, { itens: [{ numero: "1", identificador: "cot:1" }] }, "5,0441 → cot:890\n0,69 → cot:890", ["13,75 (cot:947)"]])
  console.log(JSON.stringify(extrairJson(JSON.stringify({ titulo: "T", paragrafos: ["p"], referencias: r })).referencias));
Deno.exit(0);
