# Texto de listagem — Google Play Console

> Rascunho para colar em **Play Console → Presença na loja → Ficha da loja principal**. Ajuste o
> nome do app se `Personal APP` (valor atual de `app_name` em `strings.xml`) não for o nome final
> de marca — esse é o nome que aparece na Play Store, vale a pena decidir antes de publicar.

## Título do app (30 caracteres)

```
Personal Tracker
```

## Descrição curta (80 caracteres)

```
Gestão de alunos, fichas de treino e evolução para personal trainers.
```

## Descrição completa (até 4000 caracteres)

```
Personal Tracker é o app para personal trainers organizarem alunos, fichas de treino e
acompanhamento de evolução — tudo em um só lugar, sincronizado na nuvem.

PARA O PERSONAL TRAINER
• Cadastre alunos com objetivo, nível de experiência, restrições e dias de treino
• Monte fichas de treino manualmente ou com auxílio de Inteligência Artificial (Gemini ou ChatGPT)
• Acompanhe peso, % de gordura e progressão de carga de cada aluno com gráficos
• Vincule a conta do aluno por código de convite — sem precisar compartilhar senha
• Veja a atividade recente: quando o aluno treinou e o que registrou

PARA O ALUNO
• Veja as fichas de treino atribuídas pelo seu personal
• Registre cada sessão de treino (séries, repetições, carga)
• Acompanhe sua própria evolução ao longo do tempo

GERAÇÃO DE TREINO COM IA
Ao configurar sua própria chave de API (Gemini ou OpenAI), o personal trainer pode gerar fichas de
treino personalizadas com base no perfil do aluno, usando como referência uma tabela de volume de
treino por grupo muscular para equilibrar a distribuição de exercícios.

PRIVACIDADE
Seus dados ficam protegidos por autenticação e regras de acesso que garantem que cada trainer só
vê os próprios alunos. Veja a política de privacidade completa: [PREENCHER URL]
```

## Categoria sugerida

Saúde e fitness

## Ícone e capturas de tela

**Ainda não gerados** — dependem de um build rodando em dispositivo/emulador (não disponível neste
ambiente). Quando for gerar:
- Ícone: 512×512px, PNG, já referenciado como `ic_launcher` em `app/src/main/res/mipmap-*` —
  confirmar se a arte atual é a final antes de exportar para a loja.
- Capturas de tela: mínimo 2, recomendado 4–8, telas-chave: login, lista de alunos, detalhes do
  aluno com gráficos, construtor de fichas, tela do aluno ("Meus Treinos"/"Minha Evolução").

## Formulário "Segurança dos dados" (Data Safety)

**Ainda não preenchido** — precisa ser respondido diretamente no Play Console (não é um arquivo
que se anexa). Use a tabela da seção 2 de `privacy-policy.md` como referência direta: cada linha
mapeia para uma categoria de dado do formulário (informações de saúde, identificadores, etc.).
