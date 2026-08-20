# Política de Privacidade — Personal Tracker

**Última atualização: [PREENCHER DATA ANTES DE PUBLICAR]**

> ⚠️ **Rascunho inicial, não é aconselhamento jurídico.** Este texto foi gerado como ponto de
> partida a partir dos dados que o código do app efetivamente coleta (ver `GOALS.md` §4/§7/§8).
> Antes de publicar: (1) preencha os campos entre colchetes, (2) hospede este texto em uma URL
> pública (GitHub Pages, um site simples, etc. — a Play Store exige um link, não um arquivo), e
> (3) considere revisão por um advogado, especialmente por lidar com dados de saúde (LGPD Art. 5º,
> II — dado sensível) e potencialmente por usuários menores de idade dependendo do seu público.

## 1. Quem somos

Personal Tracker é um aplicativo Android para personal trainers gerenciarem alunos, treinos e
acompanhamento de evolução física. Desenvolvido por [PREENCHER: seu nome/empresa].
Contato: [PREENCHER: e-mail de suporte].

## 2. Quais dados coletamos

| Dado | Para quê | Onde fica |
|---|---|---|
| E-mail e senha | Login (Firebase Authentication) | Firebase Auth (Google) |
| Nome, telefone, objetivo, nível de experiência, dias de treino | Perfil do aluno, montagem de fichas | Firestore (Google Cloud) + cache local no dispositivo |
| **Observações médicas** (`medicalNotes`) | Restrições/condições de saúde relevantes ao treino | Firestore + cache local — **dado sensível de saúde** |
| **Peso, % de gordura, altura** (biometria) | Acompanhar evolução física | Firestore + cache local — **dado sensível de saúde** |
| Sessões de treino registradas (exercícios, séries, repetições, cargas) | Histórico de progressão | Firestore + cache local |
| Código de convite | Vincular a conta do aluno à do trainer | Firestore |
| Chave de API (Gemini e/ou OpenAI), se o trainer configurar | Gerar fichas de treino com IA | Armazenada apenas no dispositivo do trainer; enviada diretamente à Google/OpenAI a cada geração — nunca passa pelos nossos servidores, porque não temos servidor próprio |
| Relatórios de falha e desempenho | Diagnosticar e corrigir erros do app | Firebase Crashlytics (Google) |
| Sinal de integridade do dispositivo | Impedir abuso/bots (Firebase App Check / Play Integrity) | Google Play Integrity |

Não coletamos localização, contatos, câmera/microfone, nem dados de pagamento — o app não tem
recursos de pagamento.

## 3. Como os dados são usados

- Autenticar o login e determinar o papel do usuário (Trainer, Aluno ou Administrador).
- Permitir que o trainer monte e acompanhe fichas de treino de seus alunos.
- Permitir que o aluno visualize suas fichas e registre suas sessões.
- Gerar fichas de treino com auxílio de IA, quando o trainer opta por usar esse recurso e fornece
  sua própria chave de API.
- Diagnosticar falhas técnicas (Crashlytics) e impedir abuso automatizado (App Check).

Não usamos os dados para publicidade, não vendemos dados a terceiros, e não fazemos perfilamento
para fins comerciais.

## 4. Compartilhamento com terceiros

| Terceiro | Dado compartilhado | Finalidade |
|---|---|---|
| Google Firebase (Auth, Firestore, Crashlytics, App Check) | Todos os dados listados acima | Infraestrutura de backend do app |
| Google Gemini API | Perfil do aluno (nome, objetivo, nível, restrições) + prompt do trainer | Somente se o trainer configurar e usar a geração de treino com IA |
| OpenAI API | Perfil do aluno (nome, objetivo, nível, restrições) + prompt do trainer | Somente se o trainer configurar e usar a geração de treino com IA via OpenAI |

Esses provedores têm suas próprias políticas de privacidade
([Google](https://policies.google.com/privacy), [OpenAI](https://openai.com/policies/privacy-policy)).

## 5. Retenção e exclusão

Os dados permanecem armazenados enquanto a conta existir. O trainer pode excluir o cadastro de um
aluno diretamente no app, o que remove o registro do Firestore. Para solicitar exclusão completa
da conta e de todos os dados associados, entre em contato pelo e-mail informado na seção 1.

## 6. Segurança

Os dados trafegam via conexões criptografadas (HTTPS/TLS) para os servidores do Firebase e das
APIs de IA. O acesso ao banco de dados é restrito por regras de segurança do Firestore
(`firestore.rules`), garantindo que um trainer só acesse os dados dos próprios alunos.

## 7. Dados de menores de idade

[PREENCHER: se alunos menores de idade poderão ter conta própria no app, ou se o cadastro é feito
apenas pelo trainer em nome de um aluno menor — isso muda os requisitos legais aplicáveis.]

## 8. Seus direitos (LGPD)

Você pode solicitar, a qualquer momento, confirmação da existência de tratamento, acesso,
correção, anonimização, portabilidade ou eliminação dos seus dados, entrando em contato pelo
e-mail informado na seção 1.

## 9. Alterações nesta política

Podemos atualizar esta política conforme o app evolui. A data no topo deste documento indica a
última revisão.
