// @ts-ignore
Deno.serve = () => ({});
const m = await import("file:///home/claude/soliduns-coletores/supabase/functions/scanner-do-dia/index.ts");
const casos: [string, string[]][] = [
  ["Selic em 13,75% no dia 14/10/2026, às 18h30, no 3º trimestre de 2026", ["13,75"]],
  ["fechamento de 13 de outubro e de 1º de setembro", []],
  ["Ibovespa a 137.842 pontos; dólar a R$ 5,0441 (+0,52%) e queda de −1,35%", ["137.842", "5,0441", "0,52", "1,35"]],
  ["quarta-feira (14) com R$ 900 milhões", ["900"]],
];
let ok = true;
for (const [t, esp] of casos) {
  const r = m.numerosDoTexto(t); const b = JSON.stringify(r) === JSON.stringify(esp); ok &&= b;
  console.log((b ? "  ok  " : "  FALHA ") + JSON.stringify(r) + "  <- " + t);
}
console.log(ok ? "TUDO OK" : "FALHAS");
