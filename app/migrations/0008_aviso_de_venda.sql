-- Aviso de venda por e-mail (worker/aviso-de-venda.ts): quando a loja recebeu
-- o e-mail deste pedido pago. O aviso da InfinitePay e a volta da cliente
-- podem aprovar o pedido ao mesmo tempo; esta coluna faz o e-mail sair uma vez só.
ALTER TABLE pedidos ADD COLUMN venda_avisada_em TEXT;

-- os pedidos pagos antes do aviso existir não mandam e-mail
UPDATE pedidos SET venda_avisada_em = pago_em WHERE pago_em IS NOT NULL;
