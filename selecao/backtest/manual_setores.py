"""Setor (nomenclatura da CVM) e controle das empresas negociadas antes de 2011 que não têm CNPJ ligado ao código
no FCA da CVM (mudaram de nome, foram incorporadas ou fecharam o capital). Classificação manual, pelo nome do pregão.
Usado só na fase B do backtest (2000–2011). Fonte: nome no COTAHIST e conhecimento público das companhias."""
TEL, BAN, ENE, MET, ALI = 'Telecomunicações', 'Bancos', 'Energia Elétrica', 'Metalurgia e Siderurgia', 'Alimentos'
MANUAL = {
    # raiz: (setor CVM, controle)
    'TNLP': (TEL, 'Privado'), 'TMAR': (TEL, 'Privado'), 'TCSL': (TEL, 'Privado'), 'BRTP': (TEL, 'Privado'),
    'BRTO': (TEL, 'Privado'), 'TSPP': (TEL, 'Privado'), 'TLPP': (TEL, 'Privado'), 'TCSP': (TEL, 'Privado'),
    'TCOC': (TEL, 'Privado'), 'TMCP': (TEL, 'Privado'), 'CRTP': (TEL, 'Privado'), 'TEPR': (TEL, 'Privado'),
    'TNEP': (TEL, 'Privado'), 'TLCP': (TEL, 'Privado'), 'CRGT': (TEL, 'Privado'), 'TNCP': (TEL, 'Privado'),
    'TMGR': (TEL, 'Privado'), 'TMGC': (TEL, 'Privado'), 'TSPC': (TEL, 'Privado'), 'TEBA': (TEL, 'Privado'),
    'UOLL': ('Comunicação e Informática', 'Privado'),
    'CSNA': (MET, 'Privado'), 'CSTB': (MET, 'Privado'), 'ACES': (MET, 'Privado'), 'BELG': (MET, 'Privado'),
    'COGU': (MET, 'Privado'), 'MAGS': ('Extração Mineral', 'Privado'), 'CMET': ('Extração Mineral', 'Privado'),
    'IRON': ('Extração Mineral', 'Privado'),
    'ITAU': (BAN, 'Privado'), 'UBBR': (BAN, 'Privado'), 'UBHD': (BAN, 'Privado'), 'BNCA': (BAN, 'Estatal'),
    'DAYC': (BAN, 'Privado'), 'BFIT': (BAN, 'Privado'), 'BMCT': (BAN, 'Privado'), 'ICPI': (BAN, 'Privado'),
    'BOVH': ('Bolsas de Valores/Mercadorias e Futuros', 'Privado'), 'BMEF': ('Bolsas de Valores/Mercadorias e Futuros', 'Privado'),
    'VNET': ('Intermediação Financeira', 'Privado'), 'GPIV': ('Sem Setor Principal', 'Privado'),
    'AMBV': ('Bebidas e Fumo', 'Privado'), 'IBAN': ('Bebidas e Fumo', 'Privado'),
    'PRGA': (ALI, 'Privado'), 'SDIA': (ALI, 'Privado'), 'SOES': (ALI, 'Privado'), 'SALM': (ALI, 'Privado'),
    'MILK': (ALI, 'Privado'), 'AGEN': ('Agricultura (Açúcar, Álcool e Cana)', 'Privado'),
    'ECOD': ('Petroquímicos e Borracha', 'Privado'), 'FFTL': ('Petroquímicos e Borracha', 'Privado'),
    'RIPI': ('Petróleo e Gás', 'Privado'), 'HRTP': ('Petróleo e Gás', 'Privado'), 'WHMT': ('Petroquímicos e Borracha', 'Privado'),
    'ALLL': ('Serviços Transporte e Logística', 'Privado'), 'LLXL': ('Serviços Transporte e Logística', 'Privado'),
    'OHLB': ('Serviços Transporte e Logística', 'Privado'), 'VAGV': ('Serviços Transporte e Logística', 'Privado'),
    'VCPA': ('Papel e Celulose', 'Privado'), 'SUZA': ('Papel e Celulose', 'Privado'), 'KSSA': ('Papel e Celulose', 'Privado'),
    'KLAB': ('Papel e Celulose', 'Privado'), 'BSUL': ('Papel e Celulose', 'Privado'), 'RCSA': ('Papel e Celulose', 'Privado'),
    'GETI': (ENE, 'Privado'), 'LIGH': (ENE, 'Privado'), 'GRSU': (ENE, 'Privado'), 'EBEN': (ENE, 'Privado'),
    'DURA': ('Construção Civil, Mat. Constr. e Decoração', 'Privado'), 'AGIN': ('Construção Civil, Mat. Constr. e Decoração', 'Privado'),
    'BISA': ('Construção Civil, Mat. Constr. e Decoração', 'Privado'), 'AGEI': ('Construção Civil, Mat. Constr. e Decoração', 'Privado'),
    'CCIM': ('Construção Civil, Mat. Constr. e Decoração', 'Privado'), 'CPNY': ('Construção Civil, Mat. Constr. e Decoração', 'Privado'),
    'DUFB': ('Comércio (Atacado e Varejo)', 'Privado'), 'BPCO': ('Comércio (Atacado e Varejo)', 'Privado'),
    'ASTA': ('Têxtil e Vestuário', 'Privado'), 'AEDU': ('Educação', 'Privado'),
    'ABNB': ('Máquinas, Equipamentos, Veículos e Peças', 'Privado'), 'PALF': ('Máquinas, Equipamentos, Veículos e Peças', 'Privado'),
    'LATS': ('Embalagens', 'Privado'),
}
NAO_ACAO = {'IBOV', 'BOVA'}   # índice e ETF: fora do universo de ações

# Raízes de código sem CNPJ no FCA (units e empresas cujo FCA não lista o código). Conferido no cadastro da CVM.
RAIZ_MANUAL = {'BPAC': '30.306.294/0001-45',   # Banco BTG Pactual (units BPAC11)
               'CSNA': '33.042.730/0001-04',   # Cia Siderúrgica Nacional
               'CMIN': '08.902.291/0001-15'}   # CSN Mineração
