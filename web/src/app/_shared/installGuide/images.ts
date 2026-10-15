import type { StaticImageData } from "next/image";
import androidInstalar from "./shots/android-03-instalar.webp";
import androidMenu from "./shots/android-02-menu.webp";
import androidPagina from "./shots/android-01-pagina.webp";
import iosPagina from "./shots/ios-01-pagina.webp";
import iosMenu from "./shots/ios-02-menu.webp";
import iosFolha from "./shots/ios-03-folha.webp";
import iosLista from "./shots/ios-04-lista.webp";
import iosConfirmar from "./shots/ios-05-confirmar.webp";

// GOALS.md §40i: the captured screens of the install guide, keyed by `GuideStep.shot` (domain/installGuide.ts). Each is a
// static import of a WebP prepared by `npm run shots:install` (§40h) — hashed file name, intrinsic size, base path
// handled by Next. A step whose key is missing here is shown as text only.
export interface Shot {
  image: StaticImageData;
  /** What the screen shows, for someone who cannot see it. */
  alt: string;
}

export const SHOTS: Readonly<Record<string, Shot>> = {
  "ios-pagina": {
    image: iosPagina,
    alt: "Tela de entrada do ALLU aberta no Safari, com o botão de três pontinhos, no canto de baixo à direita, em destaque.",
  },
  "ios-menu": {
    image: iosMenu,
    alt: "Menu do Safari aberto, com a opção Compartilhar, a primeira da lista, em destaque.",
  },
  "ios-folha": {
    image: iosFolha,
    alt: "Janela de compartilhar do iPhone, com o botão Ver Mais, o último da fileira de baixo, em destaque.",
  },
  "ios-lista": {
    image: iosLista,
    alt: "Lista completa de ações do compartilhamento, com a opção Adicionar à Tela de Início em destaque.",
  },
  "ios-confirmar": {
    image: iosConfirmar,
    alt: "Janela Adicionar à Tela de Início, com a opção Abrir como app web ligada e o botão Adicionar, no canto de cima à direita, em destaque.",
  },
  "android-pagina": {
    image: androidPagina,
    alt: "Tela de entrada do ALLU aberta no Chrome, com o botão de três pontinhos, no canto de cima à direita, em destaque.",
  },
  "android-menu": {
    image: androidMenu,
    alt: "Menu do Chrome aberto, com a última opção da lista, Instalar e criar atalho, em destaque na parte de baixo.",
  },
  "android-instalar": {
    image: androidInstalar,
    alt: "Janela Instalar e criar atalho do Chrome, com a opção Instalar, a primeira da janela, em destaque.",
  },
};
