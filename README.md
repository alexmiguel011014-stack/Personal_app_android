# Personal Tracker 🏋️‍♂️

O **Personal Tracker** é um aplicativo Android nativo desenvolvido em Kotlin, projetado para auxiliar Personal Trainers na gestão de seus alunos, treinos, agenda e evolução física, com integração de Inteligência Artificial para geração de fichas.

## 🚀 Funcionalidades Atuais

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
