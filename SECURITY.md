# Segurança

## Como o Bitu protege você

- Chaves de API, conversas e anotações ficam só no seu computador, criptografadas pelo Windows (DPAPI via `safeStorage` do Electron).
- As telas do app rodam isoladas (`contextIsolation`, `sandbox`, sem Node) e só falam com o processo principal por uma lista fechada de canais.
- Ações sensíveis (ver a tela, mouse/teclado, comandos, arquivos) vêm desligadas e precisam ser liberadas pelo usuário. Comandos e gravação de arquivos sempre pedem confirmação.
- Conteúdo de páginas, arquivos e notificações é tratado como dado, nunca como instrução para a IA.
- `Ctrl+Alt+X` interrompe qualquer ação em andamento.

## Encontrou uma falha?

Não abra uma issue pública. Escreva para o mantenedor pelo GitHub [@sdalberto](https://github.com/sdalberto) descrevendo o problema e como reproduzir.
