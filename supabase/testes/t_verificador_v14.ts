import { verificar, semLacunas } from "file:///home/claude/soliduns-coletores/supabase/functions/scanner-do-dia/index.ts";
const ctx: any = { agenda_do_dia: [], maiores_variacoes_b3: [], fontes_oficiais_livres: [], assuntos_em_pauta: [],
  indicadores: [{ id: "cot:890", valor: 5.0441 }, { id: "cot:889", valor: 5.0096 }, { id: "cot:947", valor: 13.75 }] };
const g = { chapeu: "Scanner", titulo: "Agenda do dia traz PMC", linha_fina: "x".repeat(150),
  paragrafos: ["O dólar fechou a R$ 5,0441, variação de +0,69% sobre R$ 5,0096. A Selic estava em 13,75% ao ano. Publicações das últimas 24 horas.",
               "Fala às 09h00. Lula concede entrevista em horário [verificar horário]. TSMC divulga balanço."],
  referencias: [{ numero: "5,0441", identificador: "cot:890" }, { numero: "5,0096", identificador: "cot:889" },
    { numero: "+0,69% (cálculo sobre cot:890 e cot:889)", identificador: "cot:890" }, { numero: "13,75% (14 de outubro)", identificador: "cot:947" }] };
const v = verificar(g, ctx, new Date("2026-10-15T12:00:00Z"));
console.log(JSON.stringify(v.filter((c) => !c.ok)));
console.log(JSON.stringify(semLacunas(g.paragrafos)));
Deno.exit(0);
