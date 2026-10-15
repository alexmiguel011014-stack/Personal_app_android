# Lista de prints — "Instalar no celular" (GOALS.md §40g)

Os prints viram as imagens do guia em *Configurações → Instalar no celular*. Os arquivos originais ficam só nesta
máquina (`raw/`, fora do git); o que vai para o repositório são os recortes pequenos em `src/app/_shared/installGuide/shots/`.

## Regras para todo print

- Celular em **Português (Brasil)** — os textos do guia são copiados da tela.
- Site aberto em `/entrar/` (`https://alexmiguel011014-stack.github.io/Personal_app_android/entrar/`). **Nunca** tire print de uma
  tela com conta aberta (nome, e-mail, alunos), e não digite senha na frente do print.
- Notificações desligadas (modo Não Perturbe) e nenhum aplicativo aberto por cima. A barra de status (hora, bateria) é cortada
  na preparação, então não precisa se preocupar com ela.
- Antes de começar um fluxo, **remova o atalho antigo** da tela inicial (iPhone: segure o ícone → Remover; Android: segure → Desinstalar),
  para o fluxo começar do zero.
- Tire o print com cada janela aberta como no exemplo; cada arquivo recebe o nome da lista abaixo.

## iPhone (iOS 26, Safari) — recebidos em 2026-10-15

| Arquivo | O que mostra | Estado |
|---|---|---|
| `ios-01-pagina` | Tela de entrada no Safari, com a barra de baixo e o botão ⋯ | recebido |
| `ios-02-menu` | Menu do ⋯ aberto, com **Compartilhar** na primeira linha | recebido |
| `ios-03-folha` | Janela de compartilhar, com **Ver Mais** na fileira de baixo | recebido |
| `ios-04-lista` | Lista completa, com **Adicionar à Tela de Início** | recebido |
| `ios-05-confirmar` | Janela **Adicionar à Tela de Início**: ícone, nome, **Abrir como app web** ligado, botão **Adicionar** | **refazer depois de publicar** — o print atual mostra o ícone antigo ("E"), o nome "Entrar — ALLU personal" e o teclado aberto. Refaça sem o teclado (toque numa área vazia da janela para fechá-lo); o ícone deve ser o "A" com a barra e o nome "ALLU" |
| `ios-06-icone` | **Novo.** Tela de Início com o ícone do ALLU (de preferência numa página só com ele) | falta |
| `ios-07-app-aberto` | **Novo.** O app aberto pelo ícone, em tela cheia, na tela de entrada (sem a barra do Safari) | falta |

## Android (Chrome) — 3 recebidos em 2026-10-15

| Arquivo | O que mostra | Estado |
|---|---|---|
| `android-01-pagina` | Tela de entrada no Chrome, com o menu ⋮ no canto de cima à direita | recebido |
| `android-02-menu` | Menu ⋮ aberto, **rolado até o fim**, com **Instalar e criar atalho** (a última opção) inteira na tela | recebido, **provisório**: nesse print o item aparece cortado embaixo; refaça rolando o menu |
| `android-03-instalar` | A janela **Instalar e criar atalho**, com **Instalar** disponível | **temporário, refazer depois de publicar** — o print de 15/10 dizia "Instalar — Não é possível instalar o app." (o site ainda não tinha o manifest). No guia entra uma cópia **retocada**: só a linha de erro foi apagada e o "Instalar" centralizado (`retouch` em `crops.json`); o original fica em `raw/` e o ícone "G" cinza continua nele |
| `android-04-confirmar` | A confirmação, se o Chrome pedir uma depois de tocar em **Instalar** | falta (só se aparecer) |
| `android-05-icone` | O ícone do ALLU na tela inicial ou na lista de aplicativos | falta |
| `android-06-app-aberto` | O app aberto em tela cheia, na tela de entrada | falta |

O menu do Chrome desta versão não tem "Instalar app" nem "Adicionar à tela inicial": a opção chama **Instalar e criar atalho**, e abre
uma janela com **Instalar** e **Criar atalho**. Se, depois de publicar, **Instalar** continuar indisponível, tire print do que o Chrome diz.
Anote também a **versão do Android** (Configurações → Sobre o telefone) e a do **Chrome** (Chrome → ⋮ → Configurações → Sobre o Chrome).

## Como me enviar

Arraste os prints para a conversa, na ordem da lista. Eu guardo os originais em `raw/` e preparo os recortes.
