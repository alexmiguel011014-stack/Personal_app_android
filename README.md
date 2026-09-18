# Personal Tracker 🏋️‍♂️

O **Personal Tracker** é um aplicativo em **Kotlin Multiplatform** (Android hoje; iOS em
preparação) para Personal Trainers gerenciarem alunos, fichas de treino, agenda e evolução
física — com o aluno tendo o próprio login para ver a ficha e registrar as cargas de cada sessão,
e geração de fichas assistida por IA.

## 🚀 Funcionalidades

- **Personal:** cadastro de alunos (perfil, objetivos, observações médicas), agenda semanal,
  fichas de treino manuais ou por IA, evolução (peso/medidas + progressão de carga por
  exercício), convite por código para conectar o aluno.
- **Aluno:** vê as fichas atribuídas, registra séries × carga × repetições de cada sessão,
  acompanha a própria evolução.
- **ADM:** gestão de personais (aprovação de solicitações), status das integrações, logs.
- **Fichas por IA:** ChatGPT, DeepSeek ou Claude (chave própria, em Configurações) ou Gemini
  (Firebase AI Logic, sem chave) — mais o fluxo "copiar prompt / colar resposta" para usar
  qualquer IA externa via **Smart Paste**, que interpreta texto colado (`Supino 3x12`, anotações
  de ativação muscular) em exercícios. A geração é guiada por uma tabela de volume efetivo por
  grupo muscular.
- **Atualização in-app:** o app avisa quando há versão nova (`latest.json` neste repositório).

## 🛠️ Stack

- **Kotlin Multiplatform** — módulo `:shared` (`commonMain` com toda a lógica e UI;
  `androidMain`/`iosMain` só para o que é específico de plataforma) + `:app`, um shell Android
  fino. Targets: Android, `iosArm64`, `iosSimulatorArm64`.
- **UI:** [Compose Multiplatform](https://www.jetbrains.com/compose-multiplatform/) (Material 3)
  + Navigation Compose multiplatform.
- **Banco local:** [Room 3 (`androidx.room3`)](https://developer.android.com/kotlin/multiplatform/room)
  com `BundledSQLiteDriver` — cache offline; o Firestore é a fonte de verdade.
- **Preferências:** [DataStore Preferences](https://developer.android.com/kotlin/multiplatform/datastore) (KMP).
- **Backend:** [Firebase](https://firebase.google.com/) Auth + Firestore + Crashlytics + App
  Check, via o SDK [GitLive firebase-kotlin-sdk](https://github.com/GitLiveApp/firebase-kotlin-sdk).
- **HTTP:** [Ktor Client](https://ktor.io/) (OkHttp no Android, Darwin no iOS).
- **DI:** [Koin](https://insert-koin.io/).
- **IA:** Firebase AI Logic (Gemini) + APIs REST da OpenAI/DeepSeek/Anthropic.

## 📦 Pré-requisitos

1. **Android Studio** recente (AGP 9.3, Kotlin 2.3, JDK 17+).
2. **Android SDK 37**.
3. **`app/google-services.json`** do Console do Firebase (gitignorado).
4. Para IA com chave própria: cadastre a chave de OpenAI/DeepSeek/Claude em **Configurações → IA**
   dentro do app. Gemini não precisa de chave (configurado no projeto Firebase).

## ⚙️ Rodando e verificando

```bash
git clone git@github.com:alexmiguel011014-stack/Personal_app_android.git
# Abra no Android Studio, aguarde o Gradle sync e rode :app em um aparelho/emulador.

./gradlew verify assembleDebug   # unitários + lint (:app), testes do :shared na JVM,
                                 # compilação dos testes instrumentados, APK de debug
```

Os testes instrumentados (`:app` golden path, `:shared` round-trips do Room) precisam de um
aparelho/emulador para *rodar*: `connectedAndroidTest` / `:shared:connectedAndroidDeviceTest`.

**iOS:** **pausado por enquanto** (decisão de 2026-09-17). O código compartilhado compila para
iOS via GitHub Actions (`.github/workflows/ios-ci.yml`, runner macOS), mas ainda não há projeto
Xcode nem o Firebase iOS SDK linkado; a distribuição planejada é por SideStore (ver `GOALS.md` §18).

## 📐 Arquitetura

MVVM com repositórios: as telas leem do Room via `Flow`, o `TrainerRepository` escreve no Firestore
primeiro e listeners espelham as mudanças de volta para o Room. As convenções não óbvias
(roteamento por papel, formato do Smart Paste, regras do Firestore, o que é `expect`/`actual`)
estão em [CLAUDE.md](CLAUDE.md); o plano completo e o estado atual, em [GOALS.md](GOALS.md).

## 📲 Distribuição

Sem loja por enquanto: APK assinado distribuído diretamente (GitHub Release + `latest.json`, que
alimenta o verificador de atualização do app). Política de privacidade em
`store-listing/privacy-policy.md`.

---
Desenvolvido por **Alex Miguel** & Assistente AI.
