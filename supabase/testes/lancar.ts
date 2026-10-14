// sobe uma Edge Function (que chama Deno.serve na importação) numa porta escolhida — só para teste
const [arquivo, porta] = Deno.args;
const real = Deno.serve;
// @ts-ignore: troca temporária para a importação não subir na porta 8000
Deno.serve = () => ({});
const m = await import(arquivo);
// @ts-ignore: assinatura com opções
real({ port: Number(porta), onListen() {} }, m.tratar);
