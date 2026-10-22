-- Quando chegou o último aviso (webhook) da InfinitePay para o pedido. Serve
-- para a compra de teste do painel mostrar se o aviso automático funciona:
-- sem ele, o pedido só é confirmado quando a cliente volta para o site.
ALTER TABLE pedidos ADD COLUMN aviso_em TEXT;
