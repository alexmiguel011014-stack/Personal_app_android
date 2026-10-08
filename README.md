# Personal Tracker 🏋️‍♂️

O **Personal Tracker** ajuda Personal Trainers a gerir alunos, fichas de treino, agenda, evolução física e mensalidades. Hoje existe em duas frentes:

| Frente | Estado |
|---|---|
| **Site** (`web/`) | **Ativo** — é a frente em uso: <https://alexmiguel011014-stack.github.io/Personal_app_android/> |
| **App Android** (`app/`, `shared/`) | Versão nativa anterior, mantida no repositório. Os apps Android e iOS serão **refeitos do zero no futuro** (decisão de 2026-10-07); a migração para Kotlin Multiplatform foi abandonada. |

## 🌐 Site (`web/`)

Painéis para o **ADM**, o **Personal** e o **Aluno**, entrada por convite (`/convite/?c=CÓDIGO`) com e-mail confirmado, fichas, registro das sessões, evolução, agenda e mensalidades.

- **Stack:** [Next.js](https://nextjs.org/) 16 (App Router) exportado como site estático, Firebase Auth + Firestore + Storage pelo SDK no navegador, hospedado no GitHub Pages. A segurança está em [`firestore.rules`](firestore.rules) (um único arquivo ao vivo para todos os clientes, publicado à mão; as versões ficam em `firestore-rules/versions/`).
- **Funções na nuvem:** `functions/` (Node 22) guarda a lógica de cobrança da plataforma; depende da decisão do dono sobre o plano Blaze (veja `GOALS.md` §30).
- **Rodar localmente** (Node 24+; para os emuladores, Java 21):

```bash
cd web
npm ci
npm run dev:local        # PowerShell: emuladores do Firebase + dados de teste + o site em http://localhost:3000/entrar/
```

- **Checagens** (a partir de `web/`): `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` e `npm run test:rules`. O CI (`web-ci.yml`) roda todas; `web-deploy.yml` publica a partir da `main`.
- **Mais detalhes:** [`web/README.md`](web/README.md) (passos do console do Firebase, rotas), [`CLAUDE.md`](CLAUDE.md) (convenções) e [`GOALS.md`](GOALS.md) (plano e estado).

## 🚀 Funcionalidades do app Android (versão anterior)

- **Gestão de Alunos:** Cadastro completo com perfil biométrico, objetivos e observações médicas.
- **Agenda Interativa:** Organização semanal de horários com vínculo direto aos alunos.
- **Fichas de Treino:** 
    - **Manual:** Criação detalhada de exercícios.
    - **Smart Paste:** Importador inteligente que processa textos externos (ex: ChatGPT) e identifica exercícios e séries automaticamente.
    - **IA (Gemini):** Geração de treinos personalizados baseados no perfil do aluno (lesões, nível e objetivos).
- **Evolução Física:** Gráficos nativos (Canvas) para acompanhamento de peso e medidas.
- **Autenticação Multi-Nível:** Login via Firebase com distinção de papéis (**ADM**, **Personal** e **Aluno**).

## 🛠️ Stack Tecnológica

- **Linguagem:** [Kotlin](https://kotlinlang.org/)
- **UI:** [Jetpack Compose](https://developer.android.com/jetpack/compose) (Material 3)
- **Banco de Dados:** [Room Persistence Library](https://developer.android.com/training/data-storage/room)
- **Injeção de Dependência:** [Hilt](https://developer.android.com/training/dependency-injection/hilt-android)
- **Navegação:** [Jetpack Navigation](https://developer.android.com/jetpack/compose/navigation)
- **Processamento:** [KSP (Kotlin Symbol Processing)](https://kotlinlang.org/docs/ksp-overview.html)
- **Persistência de Chaves:** [Jetpack DataStore](https://developer.android.com/topic/libraries/architecture/datastore)
- **Backend:** [Firebase](https://firebase.google.com/) (Auth & Firestore)
- **IA:** [Google Generative AI SDK (Gemini)](https://ai.google.dev/)

## 📦 Pré-requisitos para Rodar o Projeto

Para compilar e rodar o projeto, você precisará:

1.  **Android Studio Ladybug** (ou superior).
2.  **Android SDK 37** instalado.
3.  **Google Services:** 
    - Obtenha o arquivo `google-services.json` no Console do Firebase e coloque-o na pasta `/app`.
4.  **Chaves de API:**
    - Cadastre sua **Gemini API Key** na tela de configurações do aplicativo (ícone de engrenagem) para habilitar as funcionalidades de IA.

## ⚙️ Instalação

```bash
# Clone o repositório
git clone git@github.com:alexmiguel011014-stack/Personal_app_android.git

# Abra o projeto no Android Studio
# Aguarde a sincronização do Gradle
# Rode o app no seu dispositivo ou emulador
```

## 📐 Arquitetura

O projeto segue os princípios da **Clean Architecture** e o padrão **MVVM (Model-View-ViewModel)**, garantindo que a lógica de negócio esteja separada da interface e facilitando a manutenção e testes.

---
Desenvolvido por **Alex Miguel** & Assistente AI.
