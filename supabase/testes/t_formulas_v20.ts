// v2.0: aberturas variadas do Scanner e retirada de "Segundo a agenda do dia," (rede de segurança)
import { aberturaDoDia, semFormulasVetadas, ABERTURAS } from "../functions/scanner-do-dia/index.ts";
let f = 0; const ok = (c: boolean, m: string) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) f++; };
const dias = new Set(Array.from({ length: 8 }, (_, i) => aberturaDoDia(new Date(Date.UTC(2026, 9, 12 + i)))));
ok(dias.size === ABERTURAS.length, "8 dias seguidos -> 8 aberturas diferentes");
ok(aberturaDoDia(new Date(Date.UTC(2026, 9, 17))).includes("deste sábado") || ![...dias].some((d) => d.includes("desta sábado")), "concordância: deste sábado / desta segunda-feira");
ok(semFormulasVetadas("Segundo a agenda do dia, o Copom divulga a ata às 08h00.") === "O Copom divulga a ata às 08h00.", "tira a abertura 'Segundo a agenda do dia,'");
ok(semFormulasVetadas("O IBC-Br sai às 9h. De acordo com a agenda de hoje, o Fed fala às 15h.") === "O IBC-Br sai às 9h. O Fed fala às 15h.", "tira no meio do parágrafo");
ok(semFormulasVetadas("O Fed fala às 15h, segundo a agenda do dia.") === "O Fed fala às 15h.", "tira no fim da frase");
ok(semFormulasVetadas("Segundo o Banco Central, a PTAX fechou em alta.") === "Segundo o Banco Central, a PTAX fechou em alta.", "mantém atribuição a fonte oficial");
console.log(f ? `FALHAS: ${f}` : "TUDO OK"); Deno.exit(f ? 1 : 0);
