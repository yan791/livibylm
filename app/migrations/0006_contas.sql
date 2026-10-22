-- Contas das clientes do site: ela entra com o WhatsApp e uma senha e vê os
-- pedidos dela em qualquer aparelho. A conta nasce na compra (os mesmos dados
-- do pedido, mais a senha). Detalhes em worker/contas.ts.

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 55 + DDD + número, só dígitos: é com ele que ela entra
  whatsapp TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  -- hash da senha, como a do painel (worker/seguranca.ts)
  senha TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acesso TEXT
);

-- aparelhos com a conta aberta: o token fica no navegador dela, aqui só o hash
CREATE TABLE sessoes_clientes (
  token_hash TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);
CREATE INDEX sessoes_clientes_cliente ON sessoes_clientes (cliente_id);

-- link de senha nova que a loja manda pelo WhatsApp quando ela esquece (só o hash; vale uma vez)
CREATE TABLE senhas_novas (
  token_hash TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);

-- de qual conta é cada compra do site (null: venda do painel, compra de teste ou pedido de antes das contas)
ALTER TABLE pedidos ADD COLUMN cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
CREATE INDEX pedidos_cliente ON pedidos (cliente_id);
