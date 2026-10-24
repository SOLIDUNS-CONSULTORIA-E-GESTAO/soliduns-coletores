
(code)=>{const a=DB.avaliacoes.find(x=>x.codigo===code&&x.ownerId===ownerId());
 a.enq.apto=true;a.grauMin=a.grauMin||"1";a.dataRef=a.dataRef||today();
 a.doc.matricula=a.doc.matricula||"1";a.doc.dataMatricula=a.dataRef;a.doc.aprovado=true;if(!a.doc.areaDoc)a.doc.areaDoc="450";a.doc.areaUso="documental";
 a.vistoria.dataCom=a.vistoria.dataCom||"2026-09-01";a.vistoria.data=a.vistoria.data||"2026-09-10";a.vistoria.validada=true;
 a.mercado.revisada=true;if(!(a.amostra||[]).length){a.mercado.semDados=true;a.mercado.justificativa="Sem dados comparáveis"}
 a.metodo.escolha=a.metodo.escolha||(a.segmento==="rural"?"rural":(a.amostra||[]).length?"comparativo":"evolutivo");a.metodo.aprovado=true;
 if(a.metodo.escolha==="evolutivo")a.metodo.motivo="Teste";
 a.calc.validado=true;a.espec.i1="3";a.espec.i3="2";a.espec.ev1="2";a.espec.ev2="2";a.espec.ev3="2";a.grauMin="1";
 const e=estimativa(a);a.resultado.adotado=String(Math.round(e.central*100)/100);a.resultado.final=String(Math.round(e.central/1000)*1000);
 (a.quesitos||[]).forEach(q=>{q.resposta="Resposta de teste.";q.aprovado=true});
 CHECK_ITEMS.forEach(i=>a.emissao.check[i.k]=true);a.emissao.art="ART-QA";a.emissao.assinado=true;save();
 return {id:a.id,fase:faseAtual(a),pend:gates(a).filter(g=>!g.ok).map(g=>g.cod)}}