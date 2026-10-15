// Teste da leitura do Ibovespa (B3) e do Focus (BCB) — coletor-fechamento v1.4. Sem rede.
import { lerIndiceAno, lerFocus } from "../functions/coletor-fechamento/index.ts";
let f = 0; const ok = (c: boolean, m: string) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) f++; };
const b3 = { min: "x", max: "y", results: [
  { day: 1, rateValue1: null, rateValue9: "179.722,48", rateValue10: "187.197,46" },
  { day: 2, rateValue10: "192.114,55", rateValue11: null },
  { day: 14, rateValue10: "204.102,70" }, { day: 15, rateValue10: "203.000,00" }, { day: 0, rateValue10: "1" }] };
const v = lerIndiceAno(b3, 2026, "2026-10-14");
ok(v.length === 4 && v[0].data === "2026-09-01" && v[0].valor === 179722.48, "lê o formato brasileiro (179.722,48) e o mês pela coluna");
ok(v[v.length - 1].data === "2026-10-14" && v[v.length - 1].valor === 204102.7, "último pregão até a data pedida (15/10 fica de fora): " + JSON.stringify(v[v.length - 1]));
const fo = { value: [
  { Indicador: "IPCA", Data: "2026-10-09", DataReferencia: "2026", Mediana: 4.71, baseCalculo: 0 },
  { Indicador: "IPCA", Data: "2026-10-09", DataReferencia: "2027", Mediana: 4.1, baseCalculo: 0 },
  { Indicador: "IPCA", Data: "2026-10-09", DataReferencia: "2028", Mediana: 3.8, baseCalculo: 0 },
  { Indicador: "IPCA", Data: "2026-10-09", DataReferencia: "2026", Mediana: 4.7, baseCalculo: 1 }] };
const l = lerFocus(fo, "IPCA", ["2026", "2027"]);
ok(l.length === 2 && l[0].mediana === 4.71 && l[1].ano === "2027", "Focus: só os dois anos pedidos e só baseCalculo 0");
console.log(f ? "FALHAS" : "TUDO OK"); Deno.exit(f ? 1 : 0);
