# Personal Tracker 🏋️‍♂️

O **Personal Tracker** é um app Kotlin Multiplatform (Android nativo hoje, iOS em migração)
projetado para auxiliar Personal Trainers na gestão de seus alunos, treinos, agenda e evolução
física, com integração de Inteligência Artificial para geração de fichas.

## 🚀 Funcionalidades Atuais

- **Gestão de Alunos:** Cadastro completo com perfil biométrico, objetivos e observações médicas.
- **Agenda Interativa:** Organização semanal de horários com vínculo direto aos alunos.
- **Fichas de Treino:**
    - **Manual:** Criação detalhada de exercícios.
    - **Smart Paste:** Importador inteligente que processa textos externos (ex: ChatGPT) e identifica exercícios e séries automaticamente.
    - **IA:** Geração de treinos personalizados baseados no perfil do aluno (lesões, nível e objetivos) — Gemini (grátis, via Firebase, hoje só Android) ou uma chave própria de OpenAI/DeepSeek/Claude (funciona nas duas plataformas).
- **Evolução Física:** Gráficos nativos (Canvas) para acompanhamento de peso e medidas.
- **Autenticação Multi-Nível:** Login via Firebase com distinção de papéis (**ADM**, **Personal** e **Aluno**) — cada papel com sua própria navegação.
- **Verificação de Atualização:** o app checa uma vez por sessão se há uma versão mais nova e avisa sem bloquear o uso.

## 🛠️ Stack Tecnológica

- **Linguagem:** [Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform.html) — módulo `:shared` (comum a Android/iOS) + `:app` (host Android)
- **UI:** [Compose Multiplatform](https://www.jetbrains.com/compose-multiplatform/) (Material 3)
- **Banco de Dados:** [SQLDelight](https://cashapp.github.io/sqldelight/) (cache offline, espelhado do Firestore)
- **Injeção de Dependência:** [Koin](https://insert-koin.io/)
- **Navegação:** [Navigation Compose Multiplatform](https://kotlinlang.org/docs/multiplatform/compose-navigation.html)
- **Rede:** [Ktor Client](https://ktor.io/) (OpenAI/DeepSeek/Claude, verificador de atualização)
- **Persistência de Chaves:** [DataStore Multiplatform](https://developer.android.com/kotlin/multiplatform/datastore)
- **Backend:** [Firebase](https://firebase.google.com/) (Auth & Firestore) via o SDK Kotlin Multiplatform da [GitLive](https://github.com/GitLiveApp/firebase-kotlin-sdk)
- **IA:** Firebase AI Logic (Gemini, Android) + Ktor direto para OpenAI/DeepSeek/Claude (ambas plataformas)

O suporte a iOS está em migração ativa (ver [GOALS.md](GOALS.md) §18) — o código comum já compila
para iOS via CI, mas ainda não existe um app iOS de verdade (falta projeto Xcode e assinatura).

## 📦 Pré-requisitos para Rodar o Projeto

Para compilar e rodar o projeto (Android), você precisará:

1.  **Android Studio** (versão recente, com suporte a AGP 9 e Kotlin 2.3+).
2.  **Android SDK 37** instalado.
3.  **Google Services:**
    - Obtenha o arquivo `google-services.json` no Console do Firebase e coloque-o na pasta `/app`.
4.  **Chaves de API (opcional):**
    - Gemini já funciona sem chave (via Firebase). OpenAI/DeepSeek/Claude são opcionais — cadastre sua chave na tela de configurações do aplicativo (ícone de engrenagem) para habilitá-los.

## ⚙️ Instalação

```bash
# Clone o repositório
git clone git@github.com:alexmiguel011014-stack/Personal_app_android.git

# Abra o projeto no Android Studio
# Aguarde a sincronização do Gradle
# Rode o app no seu dispositivo ou emulador
```

## 📐 Arquitetura

O projeto é um módulo Kotlin Multiplatform: quase todo o código (modelos, repositórios, banco
de dados, ViewModels, telas, navegação) vive em `shared/src/commonMain`, com peças
específicas de plataforma isoladas via `expect`/`actual` em `shared/src/androidMain`/`iosMain`.
`:app` é hoje só o host Android (`MainActivity`, `MainApplication`, o módulo Koin). Segue os
princípios de **Clean Architecture** e o padrão **MVVM (Model-View-ViewModel)**, com Firestore
como fonte de verdade e o banco local como cache offline reativo.

---
Desenvolvido por **Alex Miguel** & Assistente AI.
