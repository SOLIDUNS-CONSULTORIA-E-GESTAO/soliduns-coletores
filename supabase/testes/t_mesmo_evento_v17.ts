import { mesmoEvento } from "file:///home/claude/soliduns-coletores/supabase/functions/scanner-do-dia/index.ts";
const c: [string, string, boolean][] = [
 ["PPI: inflação ao produtor dos EUA (BLS)", "Índice de Preços ao Produtor (PPI) de setembro", true],
 ["PPI: inflação ao produtor dos EUA (BLS)", "Vendas no varejo de setembro (Census)", false],
 ["PPI: inflação ao produtor dos EUA (BLS)", "Pedidos semanais de seguro-desemprego", false],
 ["Boletim Focus: expectativas de mercado (Banco Central)", "Boletim Focus do Banco Central", true],
 ["IBGE: Pesquisa Mensal de Comércio", "IBGE divulga Pesquisa Mensal de Comércio (PMC) de agosto", true],
 ["IBGE: Pesquisa Mensal de Comércio", "Datafolha divulga pesquisa presidencial", false],
 ["Copom: decisão sobre a taxa Selic (comunicado)", "Decisão do Copom sobre a Selic", true],
 ["FOMC: decisão de juros do Federal Reserve", "Discurso de Beth Hammack, do Fed de Cleveland", false]];
let f = 0; for (const [a, b, e] of c) { const r = mesmoEvento(a, b); console.log((r === e ? "  ok  " : "  FALHA ") + `${b} -> ${r}`); if (r !== e) f++; }
console.log(f ? "FALHAS" : "TUDO OK"); Deno.exit(0);
