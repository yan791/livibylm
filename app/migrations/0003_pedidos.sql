-- Pedidos: as compras feitas pelo site (pagas pela InfinitePay) e as vendas
-- registradas pelo painel (Instagram, WhatsApp, em mãos).
--
-- Estoque: uma compra do site segura as peças enquanto a cliente paga
-- (situacao 'aguardando' e reserva_ate no futuro). Disponível = estoque menos
-- essas reservas. O estoque só baixa quando estoque_baixado passa de 0 para 1
-- (pagamento confirmado ou venda registrada) e volta quando passa de 1 para 0
-- (pedido cancelado). Os gatilhos abaixo fazem as duas coisas dentro do mesmo
-- batch, então nada é baixado duas vezes nem fica pela metade.

CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- código aleatório: vai para a InfinitePay (order_nsu) e no endereço da página do pedido
  codigo TEXT NOT NULL UNIQUE,
  -- 'site' = compra pelo site; 'fora' = venda registrada no painel
  origem TEXT NOT NULL DEFAULT 'site' CHECK (origem IN ('site', 'fora')),
  situacao TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (situacao IN ('aguardando', 'expirado', 'pago', 'sem_estoque', 'enviado', 'entregue', 'cancelado')),
  -- até quando as peças ficam seguras (segundos desde 1970)
  reserva_ate INTEGER NOT NULL DEFAULT 0,
  estoque_baixado INTEGER NOT NULL DEFAULT 0 CHECK (estoque_baixado IN (0, 1)),

  nome TEXT NOT NULL DEFAULT '',
  -- 55 + DDD + número, só dígitos
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cpf TEXT NOT NULL DEFAULT '',

  -- 'maceio', 'pac', 'sedex', 'maos' (entregue em mãos) ou 'combinar'
  entrega TEXT NOT NULL DEFAULT 'maceio',
  cep TEXT NOT NULL DEFAULT '',
  rua TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',

  itens_centavos INTEGER NOT NULL DEFAULT 0,
  frete_centavos INTEGER NOT NULL DEFAULT 0,
  total_centavos INTEGER NOT NULL DEFAULT 0,

  -- pagamento: 'pix', 'credit_card' (InfinitePay) ou, nas vendas do painel, 'dinheiro', 'cartao', 'outro'
  pagamento TEXT NOT NULL DEFAULT '',
  parcelas INTEGER NOT NULL DEFAULT 0,
  -- o que a cliente pagou (no cartão parcelado pode ser mais que o total, se ela pagou os juros)
  pago_centavos INTEGER NOT NULL DEFAULT 0,
  link_pagamento TEXT NOT NULL DEFAULT '',
  fatura TEXT NOT NULL DEFAULT '',
  transacao TEXT NOT NULL DEFAULT '',
  recibo TEXT NOT NULL DEFAULT '',

  rastreio TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',

  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  pago_em TEXT,
  enviado_em TEXT,
  entregue_em TEXT,
  cancelado_em TEXT
);
CREATE INDEX pedidos_situacao ON pedidos (situacao, reserva_ate);
CREATE INDEX pedidos_whatsapp ON pedidos (whatsapp, situacao);

-- as peças de cada pedido, com uma cópia do nome, da cor, do tamanho e do preço
-- do momento da compra (o pedido continua legível se a peça mudar ou sair do site)
CREATE TABLE pedido_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  peca_id INTEGER REFERENCES pecas(id) ON DELETE SET NULL,
  -- id da cor na peça (a mesma chave da tabela estoque)
  cor TEXT NOT NULL,
  tamanho TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  -- sob encomenda: não reserva nem baixa estoque
  sob_encomenda INTEGER NOT NULL DEFAULT 0,
  nome TEXT NOT NULL,
  cor_nome TEXT NOT NULL,
  colecao_nome TEXT NOT NULL DEFAULT '',
  foto TEXT NOT NULL DEFAULT ''
);
CREATE INDEX pedido_itens_pedido ON pedido_itens (pedido_id);
CREATE INDEX pedido_itens_variante ON pedido_itens (peca_id, cor, tamanho);

-- cada pagamento aprovado, um por transação da InfinitePay: o mesmo aviso
-- chegando duas vezes (ou junto com a volta da cliente ao site) não confirma nada de novo
CREATE TABLE pagamentos (
  transacao TEXT PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  valor_centavos INTEGER NOT NULL,
  pago_centavos INTEGER NOT NULL,
  recebido_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- peça nova num pedido: só entra se houver disponível (estoque menos o que já
-- está reservado em pedidos esperando pagamento). Senão, o batch inteiro é desfeito.
CREATE TRIGGER pedido_itens_disponivel BEFORE INSERT ON pedido_itens
WHEN NEW.sob_encomenda = 0
BEGIN
  SELECT RAISE(ABORT, 'sem_estoque')
  WHERE COALESCE((SELECT quantidade FROM estoque WHERE peca_id = NEW.peca_id AND cor = NEW.cor AND tamanho = NEW.tamanho), 0)
    - COALESCE((
        SELECT SUM(i.quantidade) FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
        WHERE i.peca_id = NEW.peca_id AND i.cor = NEW.cor AND i.tamanho = NEW.tamanho AND i.sob_encomenda = 0
          AND p.situacao = 'aguardando' AND p.reserva_ate > unixepoch() AND p.id != NEW.pedido_id
      ), 0)
    - COALESCE((
        SELECT SUM(quantidade) FROM pedido_itens
        WHERE pedido_id = NEW.pedido_id AND peca_id = NEW.peca_id AND cor = NEW.cor AND tamanho = NEW.tamanho AND sob_encomenda = 0
      ), 0)
    < NEW.quantidade;
END;

-- pagamento confirmado (ou venda registrada): baixa o estoque das peças do pedido.
-- Se alguma não tiver o suficiente (sem contar o que outras clientes estão
-- pagando agora), nada é baixado e o batch é desfeito. Isso só acontece quando
-- o pagamento chega depois de a reserva vencer.
CREATE TRIGGER pedidos_baixa_estoque AFTER UPDATE OF estoque_baixado ON pedidos
WHEN OLD.estoque_baixado = 0 AND NEW.estoque_baixado = 1
BEGIN
  SELECT RAISE(ABORT, 'sem_estoque')
  WHERE EXISTS (
    SELECT 1 FROM pedido_itens i
    WHERE i.pedido_id = NEW.id AND i.sob_encomenda = 0
    GROUP BY i.peca_id, i.cor, i.tamanho
    HAVING COALESCE((SELECT quantidade FROM estoque e WHERE e.peca_id = i.peca_id AND e.cor = i.cor AND e.tamanho = i.tamanho), 0)
      - COALESCE((
          SELECT SUM(o.quantidade) FROM pedido_itens o JOIN pedidos p ON p.id = o.pedido_id
          WHERE o.peca_id = i.peca_id AND o.cor = i.cor AND o.tamanho = i.tamanho AND o.sob_encomenda = 0
            AND p.situacao = 'aguardando' AND p.reserva_ate > unixepoch() AND p.id != NEW.id
        ), 0)
      < SUM(i.quantidade)
  );
  UPDATE estoque SET quantidade = quantidade - (
    SELECT SUM(i.quantidade) FROM pedido_itens i
    WHERE i.pedido_id = NEW.id AND i.sob_encomenda = 0
      AND i.peca_id = estoque.peca_id AND i.cor = estoque.cor AND i.tamanho = estoque.tamanho
  )
  WHERE EXISTS (
    SELECT 1 FROM pedido_itens i
    WHERE i.pedido_id = NEW.id AND i.sob_encomenda = 0
      AND i.peca_id = estoque.peca_id AND i.cor = estoque.cor AND i.tamanho = estoque.tamanho
  );
END;

-- pedido cancelado depois de baixar o estoque: as peças voltam
CREATE TRIGGER pedidos_devolve_estoque AFTER UPDATE OF estoque_baixado ON pedidos
WHEN OLD.estoque_baixado = 1 AND NEW.estoque_baixado = 0
BEGIN
  UPDATE estoque SET quantidade = quantidade + (
    SELECT SUM(i.quantidade) FROM pedido_itens i
    WHERE i.pedido_id = NEW.id AND i.sob_encomenda = 0
      AND i.peca_id = estoque.peca_id AND i.cor = estoque.cor AND i.tamanho = estoque.tamanho
  )
  WHERE EXISTS (
    SELECT 1 FROM pedido_itens i
    WHERE i.pedido_id = NEW.id AND i.sob_encomenda = 0
      AND i.peca_id = estoque.peca_id AND i.cor = estoque.cor AND i.tamanho = estoque.tamanho
  );
END;
