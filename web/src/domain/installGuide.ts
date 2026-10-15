// GOALS.md §40d: the "Instalar no celular" guide — what to tell someone who wants the site on their phone's home screen.
// Pure: no browser, no React. The page (`app/_shared/InstallGuide.tsx`) renders this data; the pictures are matched to
// `shot` keys by `app/_shared/installGuide/images.ts` once §40i adds them.
//
// The wording is a DRAFT written before anyone looked at the phones: §40i replaces every quoted label (menu entries,
// buttons, the switch) with the exact text on the captured screens, and §40j corrects the "Problemas comuns" answers
// to what the devices really do. Bodies are plain text; `**…**` marks a control's name and is shown in bold.

export type Platform = "ios" | "android";

/** A rectangle over a step's picture, in percentages of the picture (0–100): the control the step is about. */
export interface Highlight {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  /** The picture's key in `installGuide/images.ts`; a step without one is text only. */
  shot?: string;
  /** Only with a picture. The ring is never the only cue: the body names the control in words too. */
  highlight?: Highlight;
}

export interface GuideProblem {
  id: string;
  question: string;
  answer: string;
}

export interface Guide {
  platform: Platform;
  /** The tab's label. */
  label: string;
  browser: string;
  steps: readonly GuideStep[];
  problems: readonly GuideProblem[];
  /** What the pictures were taken on, for the footnote ("iPhone com iOS 26, Safari"); absent while a guide has no pictures. */
  captured?: string;
}

export const INSTALL_INTRO =
  "O ALLU é um site. Colocando ele na tela inicial do celular, ganha um ícone próprio e abre em tela cheia, sem a barra do navegador — como um aplicativo. Não precisa de loja de aplicativos, não baixa nada e se atualiza sozinho. Sua conta e seus dados são os mesmos.";

export const INSTALLED_NOTICE = "Você já está usando o ALLU como aplicativo. Os passos abaixo servem para instalar em outro celular.";

export const SCREENS_MAY_DIFFER = "As telas mudam um pouco de acordo com o modelo do celular e a versão do sistema, mas os nomes dos botões são os mesmos.";

const KEEP_SIGNED_IN = "Entre com seu e-mail e senha e marque **Manter conectado**, para não precisar entrar toda vez.";

export const GUIDES: Record<Platform, Guide> = {
  ios: {
    platform: "ios",
    label: "iPhone",
    browser: "Safari",
    captured: "iPhone com iOS 26, no Safari",
    steps: [
      {
        id: "abrir-no-safari",
        title: "Abra o site no Safari",
        body: "Abra o endereço do ALLU no **Safari**. Se você chegou por um link no WhatsApp, no Instagram ou em outro aplicativo, toque em **Abrir no Safari** primeiro: o navegador de dentro desses aplicativos não deixa adicionar à tela inicial.",
      },
      {
        id: "tres-pontinhos",
        title: "Toque nos três pontinhos",
        body: "Com o site aberto no Safari, toque nos três pontinhos **⋯**, no canto de baixo à direita da tela.",
        shot: "ios-pagina",
        highlight: { x: 77.8, y: 76, w: 14.9, h: 16 },
      },
      {
        id: "compartilhar",
        title: "Toque em Compartilhar",
        body: "No menu que abrir, toque em **Compartilhar**, a primeira opção da lista.",
        shot: "ios-menu",
        highlight: { x: 30.6, y: 6.3, w: 58, h: 8 },
      },
      {
        id: "ver-mais",
        title: "Toque em Ver Mais",
        body: "Na janela de compartilhar, toque em **Ver Mais**, o último botão da fileira de baixo, para abrir a lista completa.",
        shot: "ios-folha",
        highlight: { x: 72.9, y: 63.1, w: 20.3, h: 24.2 },
      },
      {
        id: "adicionar-a-tela-de-inicio",
        title: "Escolha Adicionar à Tela de Início",
        body: "Na lista, toque em **Adicionar à Tela de Início**.",
        shot: "ios-lista",
        highlight: { x: 4.1, y: 73.8, w: 91.9, h: 19.2 },
      },
      {
        id: "confirmar",
        title: "Confirme",
        body: "Deixe ligada a opção **Abrir como app web** e toque em **Adicionar**, no canto de cima à direita. O nome pode ficar \"ALLU\".",
        shot: "ios-confirmar",
        highlight: { x: 67.5, y: 6.3, w: 29.7, h: 16.3 },
      },
      {
        id: "abrir-e-entrar",
        title: "Abra pelo ícone e entre",
        body: `O ícone do ALLU apareceu na Tela de Início. Abra por ele. ${KEEP_SIGNED_IN}`,
      },
    ],
    problems: [
      {
        id: "sem-opcao",
        question: "Não aparece \"Adicionar à Tela de Início\"",
        answer: "Abra o site direto no Safari (não dentro do WhatsApp ou do Instagram), toque em **Ver Mais** para abrir a lista completa e role até o fim.",
      },
      {
        id: "pediu-login",
        question: "Pediu meu e-mail e senha de novo",
        answer: "É normal na primeira vez: o aplicativo da Tela de Início guarda a entrada separada do Safari. Entre uma vez e marque **Manter conectado**.",
      },
      {
        id: "link-do-email",
        question: "Um link do meu e-mail abriu no navegador, não no aplicativo",
        answer: "Links de e-mail abrem no navegador. Termine o que o link pedia e depois abra o ALLU pelo ícone.",
      },
      {
        id: "remover",
        question: "Como tirar da tela inicial",
        answer: "Segure o dedo sobre o ícone do ALLU e escolha a opção de remover.",
      },
      {
        id: "atualiza",
        question: "Ele se atualiza?",
        answer: "Sim. É o próprio site: sempre abre a versão mais nova e usa os mesmos dados.",
      },
    ],
  },
  android: {
    platform: "android",
    label: "Android",
    browser: "Chrome",
    captured: "Android, no Chrome",
    steps: [
      {
        id: "abrir-no-chrome",
        title: "Abra o site no Chrome",
        body: "Abra o endereço do ALLU no **Chrome**. Se você chegou por um link no WhatsApp ou em outro aplicativo, abra o menu dele e escolha abrir no Chrome primeiro.",
      },
      {
        id: "menu",
        title: "Toque nos três pontinhos",
        body: "Toque nos três pontinhos **⋮**, no canto de cima à direita da tela.",
        shot: "android-pagina",
        highlight: { x: 88.8, y: 2.4, w: 9.5, h: 15.5 },
      },
      {
        id: "instalar-e-criar-atalho",
        title: "Toque em Instalar e criar atalho",
        body: "O menu é comprido: role até o fim e toque em **Instalar e criar atalho**, a última opção da lista.",
        shot: "android-menu",
        highlight: { x: 23.7, y: 78.7, w: 73.2, h: 9.3 },
      },
      {
        id: "instalar",
        title: "Toque em Instalar",
        body: "Na janela **Instalar e criar atalho**, toque em **Instalar**. Se o Chrome pedir uma confirmação, toque em **Instalar** de novo.",
        shot: "android-instalar",
        highlight: { x: 5.4, y: 27.9, w: 89.2, h: 29.6 },
      },
      {
        id: "achar-o-icone",
        title: "Encontre o ícone",
        body: "O ícone do ALLU aparece na tela inicial ou na lista de aplicativos do celular.",
      },
      {
        id: "abrir-e-entrar",
        title: "Abra pelo ícone e entre",
        body: `Abra o ALLU pelo ícone. ${KEEP_SIGNED_IN}`,
      },
    ],
    problems: [
      {
        id: "sem-opcao",
        question: "Não encontro \"Instalar e criar atalho\"",
        answer: "Use o Chrome (não o navegador de dentro de outro aplicativo) e role o menu ⋮ até o fim: é a última opção da lista.",
      },
      {
        id: "nao-e-possivel-instalar",
        question: "Aparece \"Não é possível instalar o app\"",
        answer: "Espere a página carregar por inteiro e tente de novo. Se continuar, atualize o Chrome na Play Store.",
      },
      {
        id: "pediu-login",
        question: "Pediu meu e-mail e senha de novo",
        answer: "Entre uma vez no aplicativo e marque **Manter conectado**; depois disso ele lembra de você.",
      },
      {
        id: "link-do-email",
        question: "Um link do meu e-mail abriu no navegador, não no aplicativo",
        answer: "Links de e-mail podem abrir no navegador. Termine o que o link pedia e depois abra o ALLU pelo ícone.",
      },
      {
        id: "remover",
        question: "Como tirar da tela inicial",
        answer: "Segure o dedo sobre o ícone do ALLU e escolha **Desinstalar** (ou **Remover**).",
      },
      {
        id: "atualiza",
        question: "Ele se atualiza?",
        answer: "Sim. É o próprio site: sempre abre a versão mais nova e usa os mesmos dados.",
      },
    ],
  },
};

/**
 * Which guide to open first. An iPad that asks for the desktop site reports a Mac user agent, so a Mac with a touch
 * screen is an iPad. "other" (a computer, an unknown browser) opens the iPhone guide with both tabs still on offer.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform | "other" {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "other";
}

/**
 * Running as an installed app: the `display-mode: standalone` media query (Android, and iOS 16.4+), or Safari's older
 * `navigator.standalone` flag. The caller reads the two from the browser; this only combines them.
 */
export function isStandaloneDisplay(displayModeStandalone: boolean, navigatorStandalone: boolean | undefined): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export interface TextRun {
  text: string;
  strong: boolean;
}

/** `Toque em **Compartilhar**` → [{Toque em }, {Compartilhar, strong}]. An unpaired `**` stays as plain text. */
export function emphasisRuns(text: string): TextRun[] {
  const parts = text.split("**");
  if (parts.length % 2 === 0) return [{ text, strong: false }];
  return parts.map((part, index) => ({ text: part, strong: index % 2 === 1 })).filter((run) => run.text !== "");
}
