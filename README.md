<p align="center">
  <img src="build/icon.png" width="120" alt="Bitu">
</p>

<h1 align="center">Bitu</h1>

<p align="center">
  <b>Um amigo digital que mora no canto da sua tela.</b><br>
  Conversa por voz, dança com a sua música, avisa quando chega mensagem, ajuda no trabalho e no código.<br>
  Funciona com <b>Claude</b> ou <b>ChatGPT</b>. Tudo fica salvo só no seu PC.
</p>

<p align="center">
  <a href="https://github.com/sdalberto/bitu/releases/latest"><b>⬇ Baixar para Windows</b></a> ·
  <a href="#english">English</a> ·
  <a href="#español">Español</a>
</p>

---

## O que ele faz

- **Fica em cima do relógio do Windows**, sempre visível, sem atrapalhar. Clique para conversar, arraste para mudar de lugar, botão direito para o menu.
- **Conversa de verdade** — com memória local do que você contou (gostos, nomes, projetos). Respostas curtinhas e faladas em voz alta.
- **Escuta você** pelo microfone (`Ctrl+Alt+Espaço`).
- **Percebe a música** que está tocando (Spotify, YouTube, Deezer…), comenta e dança junto.
- **Avisa as notificações** (WhatsApp, Teams, Discord, Outlook…).
- **Ajuda no PC**: pesquisa na internet, abre sites e programas, controla a música, olha a sua tela quando você pede, clica e digita (se você deixar), roda comandos e lê/salva arquivos de código.
- **Lembretes** ("me lembra em 20 minutos de tirar o bolo do forno").
- **Tem personalidade**: pisca, boceja, espirra, cochila quando você sai, fica tonto se você chacoalhar, faz memes originais com a própria cara, solta piada de tiozão, comemora o "sextou" e tem um código secreto 🤫.
- **Seu avatar, do seu jeito**: monte o seu (formato, cor, olhos, acessório), use qualquer imagem (PNG, GIF animado, WebP, SVG) ou um pacote animado com várias poses.
- **Português, inglês e espanhol.**

## Instalação (para qualquer pessoa)

1. Baixe o **Bitu-Setup.exe** na página de [Releases](https://github.com/sdalberto/bitu/releases/latest).
2. Dê dois cliques. Ele instala sozinho e já abre.
   > O Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**. Isso acontece com todo app novo sem certificado pago.
3. Siga o assistente de 1 minuto: idioma → nomes → conectar → avatar. Pronto.

### Como conectar no Claude ou no ChatGPT

No assistente (ou em **Configurações → Conexão**), clique em **Conectar**:

1. A página da sua conta abre no navegador.
2. Clique em **Create Key / Criar chave** e depois em **Copiar**.
3. Pronto — o Bitu percebe a chave copiada, testa, conecta e limpa a área de transferência.

| | Onde criar a chave | Observação |
|---|---|---|
| **Claude** | [console.anthropic.com](https://console.anthropic.com/settings/keys) | É a conta de desenvolvedor da Anthropic, com créditos pré-pagos. A assinatura do app Claude (Pro/Max) não serve para apps de terceiros. |
| **ChatGPT** | [platform.openai.com](https://platform.openai.com/api-keys) | Também libera o microfone e as vozes naturais, mesmo que você use o Claude para pensar. |

A chave fica **criptografada pelo Windows** e nunca sai do seu PC, a não ser para falar com a IA que você escolheu.

### Voz

- **Vozes do Windows** (padrão): grátis e offline. Para vozes melhores em português, vá em *Configurações do Windows → Hora e idioma → Fala* e baixe mais vozes.
- **Vozes da OpenAI**: bem mais naturais (coral, nova, sage…), usam créditos da chave da OpenAI.
- A API do Claude não gera áudio, por isso a voz vem do Windows ou da OpenAI.

## Segurança e privacidade

- **Tudo local**: conversas, caderninho e lembretes ficam em `%APPDATA%\Bitu\bitu-data`, criptografados com a proteção de dados do Windows.
- **Permissões desligadas por padrão** para ver a tela, mexer no mouse/teclado, rodar comandos e mexer em arquivos. Você liga só o que quiser em **Configurações → Permissões**.
- **Ele pergunta antes de agir** no seu PC. Comandos e salvar arquivos *sempre* perguntam (e salvar faz backup do arquivo anterior).
- **Botão de pânico**: `Ctrl+Alt+X` para tudo na hora.
- Ele **nunca digita senhas**, não faz compras nem transferências, e trata o conteúdo de sites, arquivos e notificações como informação — nunca como ordem.
- Exportar ou apagar tudo: **Configurações → Memória e privacidade**.

## Atalhos e comandos

| Atalho | O que faz |
|---|---|
| `Ctrl+Alt+B` | Abre/fecha a conversa |
| `Ctrl+Alt+Espaço` | Fala por voz |
| `Ctrl+Alt+X` | Para tudo |
| `Esc` (no chat) | Para ou fecha |

No chat: `/piada` `/danca` `/dorme` `/cafe` `/estilo` `/festa` `/meme` `/casa` `/limpar` `/config` `/ajuda`

## Avatares personalizados

Veja [docs/AVATARES.md](docs/AVATARES.md). Tem um pacote de exemplo em [docs/exemplo-pacote](docs/exemplo-pacote).

---

## Para desenvolvedores

Requisitos: Windows 10/11 e [Node.js 22+](https://nodejs.org).

```bash
git clone https://github.com/sdalberto/bitu.git
cd bitu
npm install
npm start          # roda o app
npm run check      # confere sintaxe e traduções
npm run dist       # gera o instalador em dist/
```

Ou dê dois cliques em `instalar.bat`.

### Publicar uma versão nova (gera o instalador sozinho)

1. Altere `"version"` no `package.json` (ex.: `1.0.1`).
2. Faça commit e crie a tag:
   ```bash
   git add . && git commit -m "Versão 1.0.1"
   git tag v1.0.1
   git push && git push --tags
   ```
3. O GitHub Actions monta o `Bitu-Setup-1.0.1.exe` e publica em **Releases**. É esse link que você manda para as pessoas.

### Como está organizado

```
src/
  main/            processo principal (Node)
    main.js        janelas, bandeja, atalhos, permissões, conexão
    agent.js       personalidade + laço de ferramentas da IA
    providers.js   Claude (Anthropic) e ChatGPT (OpenAI), voz e transcrição
    tools.js       o que a IA pode fazer (com permissão e confirmação)
    winactions.js  mouse, teclado, mídia e janela ativa (user32 via PowerShell)
    watchers.js    música tocando e notificações do Windows
    store.js       armazenamento local criptografado
  preload/         ponte segura (lista fechada de canais)
  renderer/
    buddy/         o personagem na tela (janela transparente)
    chat/          conversa + gerador de memes
    settings/      configurações e assistente de primeira vez
    shared/        avatar SVG, animações, voz, traduções, estilos
```

Sem dependências nativas para compilar: as ações no Windows usam o PowerShell que já vem no sistema.

### Limitações conhecidas

- **Notificações**: o Windows só deixa ler o conteúdo das notificações se você permitir em *Privacidade → Notificações*. Sem isso, o Bitu percebe pelos contadores no título das janelas (Discord, Teams, Telegram…), o que nem todo app mostra.
- **Mouse e teclado** não funcionam em janelas de administrador (proteção do Windows).
- O controle do PC usa a tela principal.

## Licença

[MIT](LICENSE) © 2026 Silviano Dalberto Pessi — Ideias Livres Desenvolvimentos.

---

## English

**Bitu** is a desktop buddy for Windows that lives above your taskbar clock. It chats (text or voice), notices the music you play and dances to it, tells you about new messages, searches the web, controls media, and — only with your permission — looks at your screen, uses the mouse and keyboard, runs commands, and reads/writes code files. It works with **Claude** (Anthropic API) or **ChatGPT** (OpenAI API), stores everything locally and encrypted, and speaks English, Portuguese and Spanish.

Install: download **Bitu-Setup.exe** from [Releases](https://github.com/sdalberto/bitu/releases/latest), run it, follow the 1-minute setup. To connect, click **Connect**, create a key on the page that opens, click copy — Bitu picks it up automatically.

## Español

**Bitu** es un amigo digital para Windows que vive encima del reloj. Conversa (texto o voz), nota la música que suena y baila, avisa de mensajes nuevos, busca en internet, controla la música y, solo con tu permiso, mira tu pantalla, usa el mouse y el teclado, ejecuta comandos y lee/guarda archivos de código. Funciona con **Claude** o **ChatGPT**, guarda todo localmente y cifrado, y habla español, portugués e inglés.

Instalación: descarga **Bitu-Setup.exe** en [Releases](https://github.com/sdalberto/bitu/releases/latest), ejecútalo y sigue el asistente. Para conectar, haz clic en **Conectar**, crea una clave en la página que se abre y cópiala: Bitu la detecta solo.
