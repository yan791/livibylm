-- Estrutura da loja: coleções, peças, estoque e o acesso ao painel.

CREATE TABLE colecoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  numero TEXT NOT NULL DEFAULT '',
  -- cor de fundo da coleção (acompanha o fundo das fotos) e se o texto por cima é claro ou escuro
  fundo TEXT NOT NULL DEFAULT '#c8c2bb',
  tema TEXT NOT NULL DEFAULT 'claro' CHECK (tema IN ('claro', 'escuro')),
  clima TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  capa TEXT,
  -- largura / altura da foto de capa
  capa_proporcao REAL NOT NULL DEFAULT 0.68,
  ordem INTEGER NOT NULL DEFAULT 0,
  visivel INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pecas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colecao_id INTEGER NOT NULL REFERENCES colecoes(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  descricao TEXT NOT NULL DEFAULT '',
  tecido TEXT NOT NULL DEFAULT '',
  -- JSON: [{ "id": "c1", "nome": "Pérola", "hex": "#efeae3" }]
  cores TEXT NOT NULL DEFAULT '[]',
  -- JSON: ["PP", "P", "M", "G", "GG"]
  tamanhos TEXT NOT NULL DEFAULT '[]',
  -- JSON: ["/fotos/p/....webp", "/img/..."] (a primeira é a capa da peça)
  fotos TEXT NOT NULL DEFAULT '[]',
  modelo_altura TEXT NOT NULL DEFAULT '',
  modelo_veste TEXT NOT NULL DEFAULT '',
  -- sob encomenda: não controla estoque, mostra o prazo de produção
  sob_encomenda INTEGER NOT NULL DEFAULT 0,
  prazo_encomenda TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  visivel INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX pecas_colecao ON pecas (colecao_id, ordem);

-- quantidade de cada combinação de cor (id da cor na peça) e tamanho
CREATE TABLE estoque (
  peca_id INTEGER NOT NULL REFERENCES pecas(id) ON DELETE CASCADE,
  cor TEXT NOT NULL,
  tamanho TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  PRIMARY KEY (peca_id, cor, tamanho)
);

-- quem entra no painel. Sem senha = ainda não usou o convite.
CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL DEFAULT '',
  senha TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acesso TEXT
);

-- só o hash do token fica guardado; o token mesmo vive no cookie ou no link
CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);
CREATE INDEX sessoes_admin ON sessoes (admin_id);

CREATE TABLE convites (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);
CREATE INDEX convites_admin ON convites (admin_id);

-- tentativas de login que falharam, por e-mail e por IP, para frear chutes de senha
CREATE TABLE tentativas (
  chave TEXT PRIMARY KEY,
  falhas INTEGER NOT NULL,
  desde INTEGER NOT NULL
);

-- ajustes da loja que a cliente define (reserva, entrega, parcelas...), em chave e valor
CREATE TABLE configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
