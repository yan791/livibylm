// Pedidos (partes 4.1, 4.2 e 4.4) contra o Worker local (127.0.0.1:8787, "npm run api"),
// com uma InfinitePay de mentira em 127.0.0.1:8799. No .dev.vars: TESTE_VENDAS=sim e
// INFINITEPAY_API=http://127.0.0.1:8799. Login do painel local em teste-local.env
// (PAINEL_TESTE_EMAIL e PAINEL_TESTE_SENHA). Cria tudo com nome "Teste ..." e apaga no fim.
// Uso, dentro de app: node scripts/testar-pedidos.mjs .
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'

const app = process.argv[2]
const env = Object.fromEntries(
  readFileSync(join(app, 'teste-local.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.trim().split('=')),
)
const B = 'http://127.0.0.1:8787'
let falhas = 0
const ok = (c, m, extra) => {
  if (!c) falhas++
  console.log(`${c ? 'OK    ' : 'FALHOU'} ${m}${!c && extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 400) : ''}`)
}

/* ---------- InfinitePay de mentira ---------- */
const ip = { links: [], checks: [], falharLinks: false, pagos: new Map() } // codigo -> {amount, paid, transacao}
const servidor = createServer(async (req, res) => {
  let corpo = ''
  for await (const p of req) corpo += p
  const d = JSON.parse(corpo || '{}')
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/links') {
    ip.links.push({ d, headers: req.headers })
    if (ip.falharLinks) return res.writeHead(500).end('{"error":"fora do ar"}')
    return res.end(JSON.stringify({ url: `https://checkout.infinitepay.io/pay/${d.order_nsu}`, slug: 'fat-' + d.order_nsu }))
  }
  if (req.url === '/payment_check') {
    ip.checks.push(d)
    const p = ip.pagos.get(d.order_nsu)
    if (!p || p.transacao !== d.transaction_nsu) return res.end(JSON.stringify({ success: true, paid: false, amount: 0, paid_amount: 0 }))
    return res.end(JSON.stringify({ success: true, paid: p.paid, amount: p.amount, paid_amount: p.amount + 37, installments: 2, capture_method: 'credit_card' }))
  }
  res.writeHead(404).end('{}')
})
servidor.keepAliveTimeout = 120_000
await new Promise((r) => servidor.listen(8799, '127.0.0.1', r))
// transações com nomes novos a cada rodada (uma rodada interrompida deixa as dela no banco)
const T = (n) => `${n}-${Date.now()}`
const tx_t_a = T('t-a'), tx_t_c1 = T('t-c1'), tx_t_c2 = T('t-c2'), tx_t_e = T('t-e'), tx_t_forjada = T('t-forjada')


/* ---------- ajudantes ---------- */
let cookie = ''
const api = async (metodo, caminho, corpo, { semLogin, origem = B } = {}) => {
  const h = { Origin: origem, ...(cookie && !semLogin ? { Cookie: cookie } : {}) }
  if (corpo) h['Content-Type'] = 'application/json'
  const r = await fetch(B + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined })
  const sc = r.headers.get('set-cookie')
  if (sc && !semLogin) cookie = sc.split(';')[0]
  return { status: r.status, headers: r.headers, dados: (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : await r.text() }
}
const sql = (comando) =>
  JSON.parse(
    execFileSync(process.execPath, [join(app, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'livi', '--local', '--json', '--command', comando], {
      cwd: app,
      encoding: 'utf8',
    }),
  )[0].results
const loja = async () => (await fetch(B + '/api/loja')).json()
const disponivelNaLoja = async (slug, chave) => {
  const l = await loja()
  for (const c of l.colecoes) for (const p of c.pecas) if (p.slug === slug) return p.disponivel[chave]
}
let zap = 82991000000
const cliente = () => ({ nome: 'Maria Teste', whatsapp: `(82) ${String(++zap).slice(2, 7)}-${String(zap).slice(7)}`, email: 'maria@exemplo.com', cpf: '529.982.247-25' })
const entregaMaceio = { tipo: 'maceio', cep: '57035-180', rua: 'Rua Teste', numero: '10', complemento: 'Apto 2', bairro: 'Ponta Verde' }
const comprar = (itens, extra = {}) => api('POST', '/api/pedidos', { itens, cliente: cliente(), entrega: entregaMaceio, ...extra }, { semLogin: true, origem: 'https://yan791.github.io' })
const zerarLimites = () => sql("DELETE FROM tentativas WHERE chave LIKE 'pedido:%' OR chave LIKE 'conferir:%'")
const aviso = (corpo) => api('POST', '/api/pagamento/aviso', corpo, { semLogin: true, origem: 'https://api.infinitepay.io' })

/* ---------- preparar: login e duas peças de teste ---------- */
let r = await api('POST', '/api/painel/entrar', { email: env.PAINEL_TESTE_EMAIL, senha: env.PAINEL_TESTE_SENHA })
ok(r.status === 200, 'login no painel')
zerarLimites()
const colecao = (await api('GET', '/api/painel/colecoes')).dados.find((c) => c.visivel)
const novaPeca = async (nome, extra) =>
  (
    await api('POST', '/api/painel/pecas', {
      colecaoId: colecao.id,
      nome,
      precoCentavos: 25990,
      cores: [{ id: 'c1', nome: 'Vinho', hex: '#4f0f10' }],
      tamanhos: ['P', 'M'],
      fotos: [],
      estoque: [
        { cor: 'c1', tamanho: 'P', quantidade: 1 },
        { cor: 'c1', tamanho: 'M', quantidade: 3 },
      ],
      visivel: true,
      ...extra,
    })
  ).dados
const nomePeca = 'Teste Pedido ' + Date.now()
const peca = await novaPeca(nomePeca)
const encomenda = await novaPeca('Teste Encomenda ' + Date.now(), { sobEncomenda: true, estoque: [] })
ok(peca.id && encomenda.id, 'peças de teste criadas')
const item = (tamanho, qtd = 1, slug = peca.slug) => ({ peca: slug, cor: 'Vinho', tamanho, qtd })

/* ---------- 4.1: pedido inválido ---------- */
r = await comprar([])
ok(r.status === 400 && /sacola/.test(r.dados.erro), 'sacola vazia: 400', r)
r = await api('POST', '/api/pedidos', { itens: [item('P')], cliente: { ...cliente(), email: 'x' }, entrega: entregaMaceio }, { semLogin: true })
ok(r.status === 400 && /e-mail/.test(r.dados.erro), 'e-mail errado: 400', r)
r = await api('POST', '/api/pedidos', { itens: [item('P')], cliente: { ...cliente(), whatsapp: '123' }, entrega: entregaMaceio }, { semLogin: true })
ok(r.status === 400 && /WhatsApp/.test(r.dados.erro), 'WhatsApp errado: 400', r)
r = await api('POST', '/api/pedidos', { itens: [item('P')], cliente: { ...cliente(), cpf: '111.111.111-11' }, entrega: entregaMaceio }, { semLogin: true })
ok(r.status === 400 && /CPF/.test(r.dados.erro), 'CPF inválido: 400', r)
r = await comprar([item('P')], { entrega: { ...entregaMaceio, cep: '01310-100' } })
ok(r.status === 400 && /Maceió/.test(r.dados.erro), 'CEP fora de Maceió: 400', r)
r = await comprar([item('P')], { entrega: { ...entregaMaceio, tipo: 'pac' } })
ok(r.status === 400, 'Correios ainda não: 400', r)
r = await comprar([item('P')], { entrega: { ...entregaMaceio, rua: '' } })
ok(r.status === 400 && /rua/.test(r.dados.erro), 'sem rua: 400', r)
r = await comprar([{ peca: 'nao-existe', cor: 'Vinho', tamanho: 'P', qtd: 1 }])
ok(r.status === 409 && /saiu do site/.test(r.dados.erro), 'peça que não existe: 409', r)
r = await comprar([{ ...item('P'), cor: 'Azul' }])
ok(r.status === 409 && /cor/.test(r.dados.erro), 'cor que não existe: 409', r)
r = await comprar([item('GG')])
ok(r.status === 409 && /tamanho/.test(r.dados.erro), 'tamanho que não existe: 409', r)
r = await comprar([item('M', 4)])
ok(r.status === 409 && /restam 3/.test(r.dados.erro), 'mais do que tem: 409 "restam 3"', r)
r = await comprar([item('M', 2), item('M', 2)])
ok(r.status === 409, 'linhas repetidas somam: 2 + 2 de 3 = 409', r)
r = await comprar([item('M', 11)])
ok(r.status === 400, 'mais de 10 iguais: 400', r)
r = await comprar(Array.from({ length: 21 }, () => item('M')))
ok(r.status === 400 && /20/.test(r.dados.erro), 'mais de 20 linhas: 400', r)
ok(ip.links.length === 0, 'nada disso chegou à InfinitePay')

/* ---------- 4.1 + 4.4: pedido A segura a última P ---------- */
r = await comprar([item('P'), item('M', 2)])
ok(r.status === 201 && /^[2-9a-z]{16}$/.test(r.dados.codigo) && r.dados.pagar.startsWith('https://checkout.infinitepay.io/'), 'pedido A criado com link de pagamento', r)
const A = r.dados.codigo
const linkA = ip.links.at(-1).d
ok(linkA.handle === 'liviamoraesloureiro' && linkA.order_nsu === A, 'link: InfiniteTag da loja e código do pedido')
ok(
  linkA.items.length === 3 && linkA.items[0].price === 25990 && linkA.items[1].quantity === 2 && linkA.items[2].price === 1500 && /Entrega/.test(linkA.items[2].description),
  'link: preços do banco, quantidade e a entrega como item',
  linkA.items,
)
// no PC o próprio Worker mostra o site (SITE_PUBLICO vazio); publicado, vai para o GitHub Pages
ok(linkA.redirect_url === `${B}/pedido/${A}`, 'link: a cliente volta para a página do pedido no site', linkA.redirect_url)
ok(linkA.webhook_url === `${B}/api/pagamento/aviso`, 'link: aviso vai para o Worker', linkA.webhook_url)
ok(linkA.customer.phone_number.startsWith('+5582') && linkA.address.cep === '57035180', 'link: telefone com +55 e endereço')
ok(!ip.links.at(-1).headers['x-api-key'], 'sem chave de API configurada, nada de X-Api-Key')
ok((await disponivelNaLoja(peca.slug, 'Vinho|P')) === 0 && (await disponivelNaLoja(peca.slug, 'Vinho|M')) === 1, 'site: P reservada (0) e M com 1 livre')
let pe = (await api('GET', `/api/painel/pecas/${peca.id}`)).dados
ok(pe.estoque.find((e) => e.tamanho === 'P').quantidade === 1 && pe.estoque.find((e) => e.tamanho === 'P').reservado === 1, 'painel: estoque P continua 1, com 1 reservada')

r = await comprar([item('P')])
ok(r.status === 409 && /esgotou/.test(r.dados.erro), 'pedido B pela mesma P: esgotou (está reservada)', r)

r = await api('GET', `/api/pedidos/${A}`, null, { semLogin: true })
ok(r.status === 200 && r.dados.situacao === 'aguardando' && r.dados.pagar && r.dados.totalCentavos === 25990 * 3 + 1500, 'página do pedido: aguardando, com link e total', r.dados)
ok(!('cpf' in r.dados) && !('email' in r.dados) && !('whatsapp' in r.dados) && !JSON.stringify(r.dados).includes('Ponta Verde') && r.dados.nome === 'Maria', 'página do pedido: sem CPF, e-mail, telefone ou endereço')
ok(r.headers.get('access-control-allow-origin') === '*', 'página do pedido: o site do GitHub pode ler')
r = await fetch(B + '/api/pedidos', { method: 'OPTIONS', headers: { Origin: 'https://yan791.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
ok(r.status === 204 && r.headers.get('access-control-allow-origin') === '*', 'pré-conferência do navegador (CORS) responde')
r = await api('GET', '/api/pedidos/naoexiste123456', null, { semLogin: true })
ok(r.status === 404, 'código inválido: 404')

/* ---------- 4.4: conferências que não aprovam ---------- */
r = await api('POST', `/api/pedidos/${A}/conferir`, { transacao: tx_t_a, fatura: 'fat-' + A }, { semLogin: true })
ok(r.status === 200 && r.dados.situacao === 'aguardando', 'volta da cliente sem pagamento aprovado: segue aguardando', r.dados)
ip.pagos.set(A, { paid: true, amount: 100, transacao: tx_t_a })
r = await aviso({ order_nsu: A, transaction_nsu: tx_t_a, invoice_slug: 'fat-' + A, amount: 100, paid_amount: 100 })
ok(r.status === 200 && r.dados.resultado === 'valor_diferente', 'aviso de R$ 1 (valor diferente do pedido): não aprova', r.dados)
r = await aviso({ order_nsu: A, transaction_nsu: tx_t_forjada, amount: 79470, paid_amount: 79470 })
ok(r.status === 400 && r.dados.resultado === 'nao_pago', 'aviso forjado (a InfinitePay diz que não pagou): não aprova, 400 (manda de novo)', r.dados)
r = await aviso({ order_nsu: 'zzzzzzzzzzzzzzzz', transaction_nsu: 'x' })
ok(r.status === 200, 'aviso de pedido que não existe: 200 (para de mandar)')
r = await fetch(B + '/api/pagamento/aviso', { method: 'POST', body: 'lixo' })
ok(r.status === 400, 'aviso ilegível: 400')
ok((await api('GET', `/api/pedidos/${A}`, null, { semLogin: true })).dados.situacao === 'aguardando', 'pedido A continua aguardando')

/* ---------- 4.4: pagamento aprovado ---------- */
const totalA = 25990 * 3 + 1500
ip.pagos.set(A, { paid: true, amount: totalA, transacao: tx_t_a })
r = await aviso({ order_nsu: A, transaction_nsu: tx_t_a, invoice_slug: 'fat-' + A, receipt_url: 'https://recibo.infinitepay.io/abc', amount: totalA, paid_amount: totalA + 37 })
ok(r.status === 200 && r.dados.resultado === 'pago', 'aviso de pagamento aprovado: pago', r.dados)
r = await aviso({ order_nsu: A, transaction_nsu: tx_t_a, invoice_slug: 'fat-' + A, amount: totalA })
ok(r.status === 200 && r.dados.resultado === 'ja', 'mesmo aviso de novo: nada muda', r.dados)
r = await api('POST', `/api/pedidos/${A}/conferir`, { transacao: tx_t_a, fatura: 'fat-' + A, recibo: 'https://golpe.com/x' }, { semLogin: true })
ok(r.dados.situacao === 'pago' && r.dados.recibo === 'https://recibo.infinitepay.io/abc' && r.dados.parcelas === 2 && r.dados.pagamento === 'credit_card', 'volta da cliente depois do aviso: pago, com recibo e parcelas', r.dados)
ok(r.dados.pagar === '', 'pedido pago não mostra mais o link de pagar')
pe = (await api('GET', `/api/painel/pecas/${peca.id}`)).dados
ok(pe.estoque.find((e) => e.tamanho === 'P').quantidade === 0 && pe.estoque.find((e) => e.tamanho === 'M').quantidade === 1, 'estoque baixou uma vez só: P 1→0, M 3→1', pe.estoque)
ok(sql(`SELECT COUNT(*) AS n FROM pagamentos WHERE pedido_id = (SELECT id FROM pedidos WHERE codigo = '${A}')`)[0].n === 1, 'um registro de pagamento')

/* ---------- 4.1: várias clientes pela mesma peça ao mesmo tempo ---------- */
zerarLimites()
sql(`UPDATE estoque SET quantidade = 3 WHERE peca_id = ${peca.id} AND tamanho = 'M'`)
const corrida = await Promise.all(Array.from({ length: 6 }, () => comprar([item('M')])))
ok(corrida.filter((x) => x.status === 201).length === 3 && corrida.filter((x) => x.status === 409).length === 3, '6 clientes ao mesmo tempo, 3 unidades: 3 conseguem, 3 não', corrida.map((x) => x.status))
ok((await disponivelNaLoja(peca.slug, 'Vinho|M')) === 0, 'site: M zerada pelas reservas')
const corridaCodigos = corrida.filter((x) => x.status === 201).map((x) => x.dados.codigo)

/* ---------- reserva vencida ---------- */
const [C1, C2, C3] = corridaCodigos
sql(`UPDATE pedidos SET reserva_ate = unixepoch() - 1 WHERE codigo = '${C1}'`)
await new Promise((r) => setTimeout(r, 10_500)) // o catálogo do site fica guardado por até 10 s
ok((await disponivelNaLoja(peca.slug, 'Vinho|M')) === 1, 'reserva vencida: a peça volta para o site')
r = await api('GET', `/api/pedidos/${C1}`, null, { semLogin: true })
ok(r.dados.situacao === 'expirado' && r.dados.pagar === '', 'página do pedido vencido: expirado, sem link')
// pagou atrasado, ainda tem a peça: aprova e baixa
ip.pagos.set(C1, { paid: true, amount: 25990 + 1500, transacao: tx_t_c1 })
r = await aviso({ order_nsu: C1, transaction_nsu: tx_t_c1, amount: 27490 })
ok(r.dados.resultado === 'pago', 'pagou depois de vencer e ainda tinha a peça: pago', r.dados)
pe = (await api('GET', `/api/painel/pecas/${peca.id}`)).dados
ok(pe.estoque.find((e) => e.tamanho === 'M').quantidade === 2, 'estoque M 3→2')
// vence C2, outra cliente pega a última M, e C2 paga atrasado: pago sem estoque
zerarLimites()
sql(`UPDATE pedidos SET reserva_ate = unixepoch() - 1 WHERE codigo = '${C2}'`)
r = await comprar([item('M')])
ok(r.status === 201, 'outra cliente reserva a M que voltou', r)
const D = r.dados.codigo
ip.pagos.set(C2, { paid: true, amount: 27490, transacao: tx_t_c2 })
r = await aviso({ order_nsu: C2, transaction_nsu: tx_t_c2, amount: 27490 })
ok(r.dados.resultado === 'sem_estoque', 'C2 pagou atrasado e a peça já estava com outra: pago sem estoque', r.dados)
pe = (await api('GET', `/api/painel/pecas/${peca.id}`)).dados
ok(pe.estoque.find((e) => e.tamanho === 'M').quantidade === 2 && pe.estoque.find((e) => e.tamanho === 'M').reservado === 2, 'estoque M intacto (2), reservas de C3 e D seguem', pe.estoque)
r = await aviso({ order_nsu: C2, transaction_nsu: tx_t_c2, amount: 27490 })
ok(r.dados.resultado === 'ja', 'aviso repetido do pago sem estoque: nada muda')

/* ---------- falha ao abrir o pagamento ---------- */
zerarLimites()
sql(`UPDATE estoque SET quantidade = 5 WHERE peca_id = ${peca.id} AND tamanho = 'M'`)
ip.falharLinks = true
const antes = sql('SELECT COUNT(*) AS n FROM pedidos')[0].n
r = await comprar([item('M')])
ok(r.status === 502 && /pagamento/.test(r.dados.erro), 'InfinitePay fora do ar: 502 com mensagem', r)
ok(sql('SELECT COUNT(*) AS n FROM pedidos')[0].n === antes, 'o pedido sem pagamento some (as peças voltam)')
ip.falharLinks = false

/* ---------- sob encomenda ---------- */
r = await comprar([item('P', 2, encomenda.slug)])
ok(r.status === 201, 'sob encomenda: compra mesmo sem estoque', r)
const E = r.dados.codigo
ip.pagos.set(E, { paid: true, amount: 25990 * 2 + 1500, transacao: tx_t_e })
r = await aviso({ order_nsu: E, transaction_nsu: tx_t_e, amount: 25990 * 2 + 1500 })
ok(r.dados.resultado === 'pago', 'sob encomenda: pago sem mexer no estoque', r.dados)

/* ---------- limites ---------- */
zerarLimites()
const mesmoZap = { ...cliente(), whatsapp: '(82) 98888-7777' }
const pedidosZap = []
for (let i = 0; i < 4; i++)
  pedidosZap.push(await api('POST', '/api/pedidos', { itens: [item('P', 1, encomenda.slug)], cliente: mesmoZap, entrega: entregaMaceio }, { semLogin: true }))
ok(pedidosZap.slice(0, 3).every((x) => x.status === 201) && pedidosZap[3].status === 429, 'mesmo WhatsApp: até 3 pedidos esperando pagamento', pedidosZap.map((x) => x.status))
for (let i = 0; i < 8; i++) await comprar([item('P', 1, encomenda.slug)])
r = await comprar([item('P', 1, encomenda.slug)])
ok(r.status === 429, 'mesmo IP: até 10 pedidos por hora', r.status)
zerarLimites()
sql(`UPDATE pedidos SET reserva_ate = unixepoch() - 1 WHERE codigo = '${pedidosZap[0].dados.codigo}'`)

/* ---------- 4.2: painel ---------- */
r = await api('GET', '/api/painel/pedidos', null, { semLogin: true })
ok(r.status === 401, 'pedidos no painel sem login: 401')
r = await api('GET', '/api/painel/pedidos')
const lista = r.dados
const idA = lista.find((p) => p.primeira && p.situacao === 'pago' && p.unidades === 3)?.id
ok(r.status === 200 && lista.length >= 10 && idA, 'lista do painel', lista.slice(0, 3))
ok(lista.some((p) => p.situacao === 'expirado') && lista.some((p) => p.situacao === 'sem_estoque'), 'lista mostra vencidos e pagos sem estoque')
r = await api('GET', '/api/painel/pedidos/contagem')
ok(r.dados.paraEnviar === lista.filter((p) => p.situacao === 'pago' || p.situacao === 'sem_estoque').length, `contagem pra enviar: ${r.dados.paraEnviar}`)
r = await api('GET', `/api/painel/pedidos/${idA}`)
ok(r.dados.cpf === '52998224725' && r.dados.endereco.bairro === 'Ponta Verde' && r.dados.itens.length === 2 && r.dados.pagoCentavos === totalA + 37, 'detalhe: CPF, endereço, peças e quanto a cliente pagou', r.dados)
r = await api('GET', '/api/painel/pedidos/abc')
ok(r.status === 404, 'pedido com id inválido: 404')
r = await api('POST', `/api/painel/pedidos/${idA}/entregue`, {})
ok(r.status === 200 && r.dados.situacao === 'entregue', 'pago → entregue', r.dados)
r = await api('POST', `/api/painel/pedidos/${idA}/enviado`, { rastreio: 'qb 123 456 789 br' })
ok(r.status === 409, 'entregue não volta para enviado', r)
r = await api('POST', `/api/painel/pedidos/${idA}/cancelar`, {})
pe = (await api('GET', `/api/painel/pecas/${peca.id}`)).dados
ok(r.dados.situacao === 'cancelado' && !r.dados.estoqueBaixado && pe.estoque.find((e) => e.tamanho === 'P').quantidade === 1, 'cancelar: as peças voltam (P 0→1)', pe.estoque)
r = await api('POST', `/api/painel/pedidos/${idA}/cancelar`, {})
ok(r.status === 409, 'cancelar duas vezes: 409')
pe = (await api('GET', `/api/painel/pecas/${peca.id}`)).dados
ok(pe.estoque.find((e) => e.tamanho === 'P').quantidade === 1, 'e o estoque não volta duas vezes')

const idC1 = lista.find((p) => p.situacao === 'pago' && p.unidades === 1 && p.primeira === nomePeca)?.id
r = await api('POST', `/api/painel/pedidos/${idC1}/enviado`, { rastreio: 'qb 123 456 789 br' })
ok(r.dados.situacao === 'enviado' && r.dados.rastreio === 'QB123456789BR' && r.dados.enviadoEm, 'pago → enviado com rastreio arrumado', r.dados)
r = await api('POST', `/api/painel/pedidos/${idC1}/enviado`, { rastreio: 'AA111111111BR' })
ok(r.dados.rastreio === 'AA111111111BR', 'trocar o código de rastreio')
r = await api('GET', `/api/pedidos/${C1}`, null, { semLogin: true })
ok(r.dados.rastreio === 'AA111111111BR' && r.dados.situacao === 'enviado', 'página do pedido mostra o rastreio')
r = await api('PUT', `/api/painel/pedidos/${idC1}/observacao`, { observacao: 'Cliente pediu embrulho' })
ok(r.dados.observacao === 'Cliente pediu embrulho', 'anotação interna')

// marcar como pago à mão um pedido vencido (o dinheiro apareceu no app)
const idD = (await api('GET', '/api/painel/pedidos')).dados.find((p) => p.situacao === 'aguardando')?.id
sql(`UPDATE pedidos SET reserva_ate = unixepoch() - 1 WHERE id = ${idD}`)
r = await api('POST', `/api/painel/pedidos/${idD}/pago`, { pagamento: 'pix' })
ok(r.status === 200 && r.dados.situacao === 'pago' && r.dados.pagamento === 'pix' && r.dados.estoqueBaixado, 'vencido marcado como pago à mão: baixa o estoque', r.dados)
r = await api('POST', `/api/painel/pedidos/${idD}/pago`, {})
ok(r.status === 409, 'marcar como pago duas vezes: 409')

/* ---------- 4.2: venda fora do site ---------- */
const op = (await api('GET', '/api/painel/pedidos/opcoes')).dados.find((p) => p.id === peca.id)
ok(op && op.cores[0].id === 'c1' && typeof op.livre['c1|M'] === 'number', 'opções da venda: peças com cor, tamanho e disponível', op)
const mAntes = pe.estoque.find((e) => e.tamanho === 'M').quantidade
r = await api('POST', '/api/painel/pedidos', { itens: [{ pecaId: peca.id, cor: 'c1', tamanho: 'M', quantidade: 1, precoCentavos: 20000 }], nome: 'Ana', whatsapp: '82 99999-1111', pagamento: 'dinheiro', entregue: true })
ok(r.status === 201, 'venda fora do site registrada', r)
const venda = (await api('GET', `/api/painel/pedidos/${r.dados.id}`)).dados
pe = (await api('GET', `/api/painel/pecas/${peca.id}`)).dados
ok(venda.situacao === 'entregue' && venda.origem === 'fora' && venda.totalCentavos === 20000 && venda.whatsapp === '5582999991111' && venda.estoqueBaixado, 'venda: entregue, com o preço cobrado', venda)
ok(pe.estoque.find((e) => e.tamanho === 'M').quantidade === mAntes - 1, `venda baixou o estoque M ${mAntes}→${mAntes - 1}`)
r = await api('GET', `/api/pedidos/${venda.codigo}`, null, { semLogin: true })
ok(r.status === 404, 'venda do painel não aparece na página pública')
r = await api('POST', '/api/painel/pedidos', { itens: [{ pecaId: peca.id, cor: 'c1', tamanho: 'M', quantidade: 99, precoCentavos: 1 }], pagamento: 'pix' })
ok(r.status === 409 && /M/.test(r.dados.erro), 'venda com mais do que tem: 409', r)
r = await api('POST', '/api/painel/pedidos', { itens: [{ pecaId: peca.id, cor: 'zz', tamanho: 'M', quantidade: 1, precoCentavos: 1 }] })
ok(r.status === 409, 'venda com cor errada: 409')
r = await api('POST', '/api/painel/pedidos', { itens: [] })
ok(r.status === 400, 'venda sem peças: 400')
r = await api('POST', '/api/painel/pedidos', { itens: [{ pecaId: peca.id, cor: 'c1', tamanho: 'M', quantidade: 1, precoCentavos: 1 }], whatsapp: '123' })
ok(r.status === 400, 'venda com WhatsApp errado: 400')
r = await api('POST', '/api/painel/pedidos', { itens: [{ pecaId: peca.id, cor: 'c1', tamanho: 'P', quantidade: 1, precoCentavos: 25990 }], pagamento: 'pix', entregue: false })
const vendaPendente = (await api('GET', `/api/painel/pedidos/${r.dados.id}`)).dados
ok(vendaPendente.situacao === 'pago' && vendaPendente.entrega === 'combinar', 'venda ainda não entregue fica "pra enviar"')

/* ---------- peça apagada: o pedido continua legível ---------- */
// alguém ainda está pagando esta peça: o painel não deixa apagar (migrations/0004)
const reservadas = sql(
  `SELECT count(*) AS n FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id WHERE i.peca_id = ${peca.id} AND p.situacao = 'aguardando' AND p.reserva_ate > unixepoch()`,
)[0].n
if (reservadas) {
  r = await api('DELETE', `/api/painel/pecas/${peca.id}`)
  ok(r.status === 409 && /pagando/.test(r.dados.erro), 'peça com reserva ativa: o painel não deixa apagar', r)
  sql(`UPDATE pedidos SET reserva_ate = unixepoch() - 1 WHERE situacao = 'aguardando' AND id IN (SELECT pedido_id FROM pedido_itens WHERE peca_id = ${peca.id})`)
}
r = await api('DELETE', `/api/painel/pecas/${peca.id}`)
ok(r.status === 200, 'peça sem reserva ativa: apaga', r)
r = await api('GET', `/api/painel/pedidos/${venda.id}`)
ok(r.status === 200 && r.dados.itens[0].nome === nomePeca && r.dados.itens[0].pecaId === null, 'peça apagada: o pedido mantém nome, cor e tamanho')
r = await api('POST', `/api/painel/pedidos/${venda.id}/cancelar`, {})
ok(r.status === 200, 'cancelar pedido de peça apagada não quebra')
await api('DELETE', `/api/painel/pecas/${encomenda.id}`)

/* ---------- limpeza ---------- */
sql("DELETE FROM pedidos WHERE id IN (SELECT pedido_id FROM pedido_itens WHERE nome LIKE 'Teste %')")
zerarLimites()
servidor.close()
console.log(`\n${falhas ? `${falhas} FALHA(S)` : 'tudo certo'}`)
process.exit(falhas ? 1 : 0)
