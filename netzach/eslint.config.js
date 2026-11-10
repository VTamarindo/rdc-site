// Netzach · regras do verificador de código (ESLint). Rodar: npm run verificar, na pasta netzach.
// O jogo é JavaScript puro (ES5, scripts comuns no navegador, tudo pendurado em window.NZ). O verificador procura
// erro de digitação, variável que não existe, código que nunca roda; não mexe no estilo.
// node_modules/ (as ferramentas instaladas) fica fora do git.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'tools/**', 'eslint.config.js'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: { ...globals.es2021, ...globals.browser, NZ: 'writable', Conta: 'readonly', supabase: 'readonly' } // es2021: Promise, Float32Array... (o código é ES5, mas usa esses objetos do navegador)
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  { files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } }
];
