import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Carrega as variáveis de ambiente para os testes de integração.
 *
 * Não dá para usar o `loadEnvConfig` do Next aqui: ele ignora `.env.local` de
 * propósito quando `NODE_ENV=test`, que é justamente o que o vitest define. E
 * é no `.env.local` que mora o DATABASE_URL do branch de desenvolvimento.
 *
 * `process.loadEnvFile` não faz expansão de variável, o que também evita o
 * problema de valores que começam com cifrão (a chave do Asaas, por exemplo).
 */
const raiz = process.cwd();
for (const arquivo of ['.env', '.env.local']) {
  const caminho = path.join(raiz, arquivo);
  if (existsSync(caminho)) process.loadEnvFile(caminho);
}
