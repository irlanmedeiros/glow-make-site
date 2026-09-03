import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `import 'server-only'` lança fora do servidor. Os módulos de negócio
      // (frete, pdv, planilha, asaas) têm esse import DE PROPÓSITO, para o
      // build quebrar se alguém importá-los num componente de cliente — ver
      // docs/DECISOES.md #5. O próprio pacote traz um `empty.js` para a
      // condição "react-server"; apontar para ele aqui deixa os testes
      // rodarem sem tirar a proteção do código de produção.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Carrega o .env.local dentro do processo de teste (banco de dev).
    setupFiles: ['tests/setup.ts'],
    // O teste de corrida no estoque abre várias conexões ao Neon de uma vez.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Os testes de integração compartilham as mesmas linhas no banco: rodar
    // dois arquivos em paralelo faria um apagar o kit do outro.
    fileParallelism: false,
  },
});
