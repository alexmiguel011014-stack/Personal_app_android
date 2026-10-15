# De onde vêm os prints (GOALS.md §40g) — alimenta o rodapé "Telas do …" do guia

| | iPhone | Android |
|---|---|---|
| Data | 2026-10-15 | 2026-10-15 (3 prints) |
| Aparelho | iPhone (modelo não informado) | modelo não informado (a barra de status é a do Android 14+; confirmar) |
| Sistema | iOS 26 — deduzido do Safari com barra flutuante embaixo e da opção "Abrir como app web", que só existe no iOS 26; **confirmar a versão exata** em Ajustes → Geral → Sobre | versão do Android não informada; **confirmar** em Configurações → Sobre o telefone |
| Navegador | Safari (layout compacto: barra de endereço embaixo, menu ⋯) | Chrome, menu ⋮ com a opção **Instalar e criar atalho** (versão a confirmar) |
| Idioma | Português (Brasil) | Português (Brasil) |
| Site | `https://alexmiguel011014-stack.github.io/Personal_app_android/` | o mesmo |
| Estado do site | **antes** da publicação do manifest/ícone novo: o ícone na janela "Adicionar à Tela de Início" ainda é o "E" gerado pelo iOS | **antes** da publicação: a janela "Instalar e criar atalho" diz "Instalar — Não é possível instalar o app." e mostra um "G" cinza como ícone, porque o site ainda não tinha manifest |

O rodapé do guia diz hoje "Telas do iPhone com iOS 26, no Safari" e "Telas do Android, no Chrome" (`captured` em `src/domain/installGuide.ts`). Ajustar quando as versões exatas forem conhecidas.
