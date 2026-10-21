-- O estoque nunca fica abaixo do que está reservado em compras do site
-- esperando pagamento. Sem isso, baixar o estoque no painel (ou tirar a cor, o
-- tamanho ou a peça) enquanto uma cliente paga fazia o pagamento dela, mesmo
-- dentro do prazo, virar "pago sem estoque".
--
-- A baixa do pagamento (gatilho pedidos_baixa_estoque) não esbarra aqui: quando
-- ela roda, o pedido que está sendo pago já saiu de 'aguardando' e não conta
-- mais como reserva.

CREATE TRIGGER estoque_nao_fica_abaixo_do_reservado BEFORE UPDATE OF quantidade ON estoque
WHEN NEW.quantidade < OLD.quantidade AND NEW.quantidade < COALESCE((
  SELECT SUM(i.quantidade) FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
  WHERE i.peca_id = OLD.peca_id AND i.cor = OLD.cor AND i.tamanho = OLD.tamanho AND i.sob_encomenda = 0
    AND p.situacao = 'aguardando' AND p.reserva_ate > unixepoch()
), 0)
BEGIN
  SELECT RAISE(ABORT, 'estoque_reservado');
END;

-- tirar da peça uma cor ou um tamanho que alguém está pagando
CREATE TRIGGER estoque_reservado_nao_sai BEFORE DELETE ON estoque
WHEN EXISTS (
  SELECT 1 FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
  WHERE i.peca_id = OLD.peca_id AND i.cor = OLD.cor AND i.tamanho = OLD.tamanho AND i.sob_encomenda = 0
    AND p.situacao = 'aguardando' AND p.reserva_ate > unixepoch()
)
BEGIN
  SELECT RAISE(ABORT, 'estoque_reservado');
END;

-- apagar a peça inteira: confere antes de o banco apagar o estoque dela em cascata
CREATE TRIGGER pecas_reservadas_nao_saem BEFORE DELETE ON pecas
WHEN EXISTS (
  SELECT 1 FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
  WHERE i.peca_id = OLD.id AND i.sob_encomenda = 0 AND p.situacao = 'aguardando' AND p.reserva_ate > unixepoch()
)
BEGIN
  SELECT RAISE(ABORT, 'estoque_reservado');
END;
