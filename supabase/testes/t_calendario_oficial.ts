// Teste do coletor de calendários oficiais (sem rede). Rodar: deno run --allow-env --allow-net t_calendario_oficial.ts
import { nyParaBrasilia, copomItens, focusItens, fomcItens, lerICS, blsItens, ibgeItens } from "../functions/calendario-oficial/index.ts";
let falhas = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
const dias = (ini: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(ini + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10));
ok(JSON.stringify(nyParaBrasilia("2026-10-15", 8, 30)) === '{"data":"2026-10-15","hora":"09h30"}', "8h30 em NY (horário de verão) = 9h30 em Brasília");
ok(JSON.stringify(nyParaBrasilia("2026-12-09", 14, 0)) === '{"data":"2026-12-09","hora":"16h00"}', "14h em NY (inverno) = 16h em Brasília");
ok(JSON.stringify(nyParaBrasilia("2026-11-02", 8, 30)) === '{"data":"2026-11-02","hora":"10h30"}', "após 1º domingo de novembro: EST");
const fo = fomcItens(dias("2026-10-26", 4)).map((i) => `${i.data_ref} ${i.hora} ${i.evento}`);
ok(fo.includes("2026-10-28 15h00 FOMC: decisão de juros do Federal Reserve") && fo.includes("2026-10-28 15h30 FOMC: entrevista do presidente do Federal Reserve") && fo.some((x) => x.startsWith("2026-10-27 Dia todo")), "FOMC 27–28/10: " + fo.join(" | "));
const cp = copomItens(dias("2026-11-03", 8)).map((i) => `${i.data_ref} ${i.hora} ${i.evento}`);
ok(cp.includes("2026-11-04 18h30 Copom: decisão sobre a taxa Selic (comunicado)") && cp.includes("2026-11-10 08h00 Copom: ata da reunião"), "Copom 3–4/11 e ata na terça 10/11: " + cp.join(" | "));
ok(copomItens(dias("2026-09-22", 1)).length === 1, "ata do Copom de 22/09 (confere com o Banco Central)");
const fc = focusItens(dias("2026-10-12", 14)).map((i) => i.data_ref);
ok(JSON.stringify(fc) === '["2026-10-13","2026-10-19"]', "Focus: 12/10 feriado -> terça 13/10; depois segunda 19/10: " + fc);
ok(JSON.stringify(focusItens(dias("2026-11-02", 2)).map((i) => i.data_ref)) === '["2026-11-03"]', "Focus: 02/11 (Finados) -> 03/11");
const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=US-Eastern:20261015T083000\r\nSUMMARY:Producer Price Index for September 2026\r\nURL:https://www.bls.gov/schedule/news_release/ppi.htm\r\nEND:VEVENT\r\n"
  + "BEGIN:VEVENT\r\nDTSTART:20261106T133000Z\r\nSUMMARY:Employment Situation for October 2026\r\nEND:VEVENT\r\n"
  + "BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261015T100000\r\nSUMMARY:County Employment and Wages for Second\r\n  Quarter 2026\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
const ev = lerICS(ics);
ok(ev.length === 3 && ev[2].resumo === "County Employment and Wages for Second Quarter 2026", "iCal: 3 eventos, linha dobrada unida");
const bl = blsItens(ev, dias("2026-10-15", 30)).map((i) => `${i.data_ref} ${i.hora} ${i.evento} ${i.url}`);
ok(bl.length === 2 && bl[0] === "2026-10-15 09h30 PPI: inflação ao produtor dos EUA (BLS) — referência: September 2026 https://www.bls.gov/schedule/news_release/ppi.htm", "BLS PPI 15/10 9h30 em português: " + bl[0]);
ok(bl[1].startsWith("2026-11-06 10h30 Payroll"), "BLS payroll em UTC -> 10h30 de Brasília: " + bl[1]);
const ib = ibgeItens({ items: [
  { id: 1, titulo: "Pesquisa Mensal de Comércio", data_divulgacao: "15/10/2026 09:00:00", nome_produto: "Pesquisa Mensal de Comércio", tipo_release: "Divulgação" },
  { id: 2, nome_produto: "IPCA-15", data_divulgacao: "24/10/2026 09:00:00" },
  { id: 3, nome_produto: "Outro dia", data_divulgacao: "30/11/2026 10:00:00" }] }, dias("2026-10-15", 10));
ok(ib.lidos === 3 && ib.itens.length === 2 && ib.itens[0].hora === "09h00" && ib.itens[0].evento === "IBGE: Pesquisa Mensal de Comércio" && ib.itens[0].categoria === "Governo e Congresso", "IBGE: lê o calendário e filtra a janela");
ok(new Set([...cp, ...fo]).size === cp.length + fo.length && copomItens(dias("2026-11-04", 1))[0].chave.startsWith("2026-11-04|calendario_oficial|18h30|copom"), "chave única por data, origem, hora e evento");
console.log(falhas ? `FALHAS: ${falhas}` : "TUDO OK");
Deno.exit(falhas ? 1 : 0);
