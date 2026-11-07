# Avatares personalizados

Em **Configurações → Avatar** você tem três jeitos de dar cara ao seu Bitu.

## 1. Criar o meu

Escolha formato (gotinha, bolinha, robozinho, fantasminha, gatinho), cor, olhos e acessório. Todas as animações e emoções (rir, dançar, dormir, ficar tonto, coração nos olhos, óculos escuros…) funcionam automaticamente.

## 2. Usar uma imagem

Qualquer **PNG, GIF animado, WebP ou SVG** com fundo transparente. O Bitu anima a imagem (respira, pula, dança, balança) e mostra os efeitos por cima (notas musicais, zzz, corações, confete).

Dicas:
- Use fundo transparente e o personagem "em pé", ocupando a imagem toda.
- 400×400 px já fica ótimo.
- GIF animado funciona — ele fica se mexendo sozinho.

## 3. Pacote animado

Uma pasta com uma imagem para cada estado e um arquivo `bitu-avatar.json`:

```json
{
  "name": "Meu Personagem",
  "author": "Seu nome",
  "states": {
    "idle":  "parado.gif",
    "talk":  "falando.gif",
    "walk":  "andando.gif",
    "dance": "dancando.gif",
    "sleep": "dormindo.gif",
    "think": "pensando.gif"
  }
}
```

Estados reconhecidos: `idle`, `talk`, `walk`, `dance`, `sleep`, `think`, `listen` e também as emoções `feliz`, `rindo`, `triste`, `surpreso`, `pensativo`, `apaixonado`, `bravo`, `tonto`, `comemorando`, `cafe`, `oculos_escuros`. Só o `idle` é obrigatório; o que faltar usa o `idle`.

Formatos aceitos: PNG, APNG, GIF, WebP e SVG.

Veja o exemplo pronto em [`exemplo-pacote`](exemplo-pacote) — é só escolher essa pasta em **Pacote animado**.

> Use apenas imagens que você criou ou tem direito de usar.
