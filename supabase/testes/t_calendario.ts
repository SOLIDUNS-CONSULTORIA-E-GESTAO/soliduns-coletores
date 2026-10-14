// @ts-ignore: impede o servidor de subir no teste
Deno.serve = () => ({});
const m = await import("/home/claude/soliduns-coletores/supabase/functions/coletor-fechamento/index.ts");
const d = (s: string) => new Date(s + "T00:00:00Z");
const casos: [string, string | null, string[]][] = [
  ["2026-10-14", "2026-10-13", ["2026-10-14"]],
  ["2026-10-13", "2026-10-09", ["2026-10-13"]],          // pula sábado, domingo e o feriado de 12/10
  ["2026-10-14", null, ["2026-10-13", "2026-10-14"]],    // 1ª execução: hoje e o pregão anterior
  ["2026-10-14", "2026-09-01", ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-13", "2026-10-14"]],  // no máximo 5
  ["2026-12-28", "2026-12-23", ["2026-12-28"]],          // 24 e 25/12 sem pregão
  ["2026-10-17", "2026-10-16", []],                      // sábado: nada a buscar
];
let ok = true;
for (const [hoje, ult, esp] of casos) {
  const r = m.pregoesPendentes(d(hoje), ult);
  const bate = JSON.stringify(r) === JSON.stringify(esp);
  ok &&= bate; console.log((bate ? "  ok  " : "  FALHA ") + hoje + " (último " + ult + ") -> " + JSON.stringify(r));
}
const h = m.hojeBrasilia(new Date("2026-10-15T02:30:00Z"));
const hb = h.toISOString().slice(0, 10) === "2026-10-14"; ok &&= hb;
console.log((hb ? "  ok  " : "  FALHA ") + "23h30 de Brasília ainda é dia 14");
console.log(ok ? "TUDO OK" : "FALHAS");
