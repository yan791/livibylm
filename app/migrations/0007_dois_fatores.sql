-- Verificação em duas etapas do painel: depois da senha, o código de 6 números
-- de um app autenticador (Google Authenticator, Microsoft Authenticator...).
-- Cada pessoa liga a sua em "Acesso". O segredo fica cifrado com uma chave
-- tirada do SENHA_PEPPER (worker/dois-fatores.ts), nunca como foi gerado.

-- ligada quando preenchido
ALTER TABLE admins ADD COLUMN totp_segredo TEXT;
-- gerado ao começar a configurar; vira o segredo quando a pessoa confirma um código
ALTER TABLE admins ADD COLUMN totp_pendente TEXT;
-- último intervalo de 30 segundos usado: o mesmo código não vale duas vezes
ALTER TABLE admins ADD COLUMN totp_ultimo INTEGER NOT NULL DEFAULT 0;

-- códigos de recuperação, para quando o celular some: cada um vale uma vez; só o hash
CREATE TABLE codigos_recuperacao (
  codigo_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE
);
CREATE INDEX codigos_recuperacao_admin ON codigos_recuperacao (admin_id);
