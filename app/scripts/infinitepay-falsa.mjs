/*
  InfinitePay de mentira, para testar a compra inteira no PC (navegador):
    node scripts/infinitepay-falsa.mjs        (em 127.0.0.1:8799)
  No app/.dev.vars: INFINITEPAY_API=http://127.0.0.1:8799 e TESTE_VENDAS=sim.
  POST /links cria uma página de pagamento local; nela, "Pagar com Pix" avisa o
  Worker (como o webhook) e leva a cliente de volta para o site, e "Desistir"
  volta sem pagar. POST /payment_check responde o que aconteceu.
  Usa a mesma porta do scripts/testar-pedidos.mjs: rode um de cada vez.
*/
import { createServer } from 'node:http'

const PORTA = 8799
const pedidos = new Map() // order_nsu -> { amount, itens, redirect, webhook, pago }

const corpo = (req) =>
  new Promise((r) => {
    let d = ''
    req.on('data', (c) => (d += c))
    req.on('end', () => {
      try {
        r(JSON.parse(d || '{}'))
      } catch {
        r({})
      }
    })
  })

const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const html = (res, conteudo) =>
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InfinitePay de mentira</title>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#222">
<p style="background:#fff3cd;padding:8px 12px;border-radius:8px;font-size:14px">Só no PC: nenhum dinheiro de verdade passa por aqui.</p>
${conteudo}</body>`)

createServer(async (req, res) => {
  const json = (o, s = 200) => res.writeHead(s, { 'Content-Type': 'application/json' }).end(JSON.stringify(o))

  if (req.method === 'POST' && req.url === '/links') {
    const d = await corpo(req)
    const amount = (d.items ?? []).reduce((s, i) => s + i.price * i.quantity, 0)
    pedidos.set(d.order_nsu, { amount, itens: d.items ?? [], redirect: d.redirect_url, webhook: d.webhook_url, pago: false })
    console.log('links', d.order_nsu, reais(amount))
    return json({ url: `http://127.0.0.1:${PORTA}/pagar/${d.order_nsu}`, slug: 'fatura-' + d.order_nsu })
  }

  if (req.method === 'POST' && req.url === '/payment_check') {
    const d = await corpo(req)
    const p = pedidos.get(d.order_nsu)
    console.log('payment_check', d.order_nsu, p?.pago ? 'pago' : 'não pago')
    return json({ success: true, paid: !!p?.pago, amount: p?.amount ?? 0, paid_amount: p?.amount ?? 0, installments: 1, capture_method: 'pix' })
  }

  const m = req.url.match(/^\/pagar\/(\w+)(?:\/(pix|desistir))?$/)
  const p = m && pedidos.get(m[1])
  if (!p) {
    if (req.url === '/') return html(res, '<h1>InfinitePay de mentira</h1><p>Rodando. As páginas de pagamento aparecem quando o site cria um pedido.</p>')
    return json({ erro: 'não encontrado' }, 404)
  }

  if (!m[2])
    return html(
      res,
      `<h1>Pagamento</h1>
<ul>${p.itens.map((i) => `<li>${i.quantity} × ${i.description}: ${reais(i.price)}</li>`).join('')}</ul>
<p><strong>Total: ${reais(p.amount)}</strong></p>
<p><a href="/pagar/${m[1]}/pix" style="display:inline-block;background:#4f0f10;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Pagar com Pix</a>
<a href="/pagar/${m[1]}/desistir" style="margin-left:12px">Desistir</a></p>`,
    )

  if (m[2] === 'desistir') return res.writeHead(302, { Location: p.redirect }).end()

  // pagou: avisa o Worker (como o webhook da InfinitePay) e volta para o site com os dados na URL
  p.pago = true
  const transacao = 'tx-' + Date.now()
  const recibo = `https://recibo.infinitepay.io/mentira/${m[1]}`
  await fetch(p.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_nsu: m[1],
      transaction_nsu: transacao,
      invoice_slug: 'fatura-' + m[1],
      amount: p.amount,
      paid_amount: p.amount,
      installments: 1,
      capture_method: 'pix',
      receipt_url: recibo,
    }),
  }).then(
    (r) => console.log('aviso', m[1], r.status),
    (e) => console.log('aviso falhou', e.message),
  )
  const volta = new URL(p.redirect)
  for (const [k, v] of Object.entries({ receipt_url: recibo, order_nsu: m[1], slug: 'fatura-' + m[1], capture_method: 'pix', transaction_nsu: transacao }))
    volta.searchParams.set(k, v)
  return res.writeHead(302, { Location: volta.href }).end()
}).listen(PORTA, '127.0.0.1', () => console.log(`InfinitePay de mentira em http://127.0.0.1:${PORTA}`))
