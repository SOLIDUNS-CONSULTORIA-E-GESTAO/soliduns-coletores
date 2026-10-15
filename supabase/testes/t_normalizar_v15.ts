import { extrairJson } from "file:///home/claude/soliduns-coletores/supabase/functions/scanner-do-dia/index.ts";
const a = extrairJson(JSON.stringify({ titulo: "T", linha_fina: "L", paragrafos: JSON.stringify(["p1", "p2"]), referencias: '[{"numero":"1","identificador":"cot:1"}]' }));
const b = extrairJson(JSON.stringify({ titulo: "T", paragrafos: "p1\n\np2\n\np3" }));
console.log(JSON.stringify(a.paragrafos), JSON.stringify(a.referencias), JSON.stringify(b.paragrafos));
Deno.exit(0);
