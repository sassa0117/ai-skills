# app-starter テンプレートリポジトリ仕様書

## 目的
新しいExpo React Nativeアプリを素早く立ち上げるためのテンプレートリポジトリ。
既存リポジトリ内で別アプリを作ると干渉（ブランチ分岐で変更消失等）するため、
新規アプリは必ずこのテンプレートからクローンして別リポで始める。

## GitHub情報
- アカウント: sassa0117
- リポ名: `app-starter`
- ローカル: `C:\Users\user\ai-skills\app-starter`

## 技術スタック
- Expo SDK 54
- React Native
- Expo Router v6（ファイルベースルーティング）
- TypeScript
- SQLite + Drizzle ORM（ローカルDB）
- Zustand v5（状態管理）
- expo-haptics
- @expo/vector-icons (FontAwesome)
- EAS Build / EAS Update（OTAデプロイ）

## テーマシステム
複数テーマから選択可能にする。初期テーマは以下の3種類：

### 1. パステルスカイ（ポケモンスリープ風） ← デフォルト
```typescript
bg: { primary: "#EAF4FB", secondary: "#F0F7FF", card: "#FFFFFF", tabBar: "#FFFFFF" }
accent: { gold: "#F5A623", mint: "#7ECFC0", lavender: "#B8A9E8", coral: "#F28B82", sky: "#7EB8E0" }
text: { primary: "#2D3748", secondary: "#718096", tertiary: "#A0AEC0" }
```

### 2. ウォームナチュラル（暖色系）
```typescript
bg: { primary: "#FFF8F0", secondary: "#FFF5EB", card: "#FFFFFF", tabBar: "#FFFFFF" }
accent: { gold: "#E8A838", mint: "#6DBF8B", lavender: "#C4A4D8", coral: "#E87461", sky: "#72A8D4" }
text: { primary: "#3D2C1E", secondary: "#7A6B5D", tertiary: "#B0A396" }
```

### 3. クールダーク（ダークモード）
```typescript
bg: { primary: "#1A1A2E", secondary: "#16213E", card: "#202040", tabBar: "#1A1A2E" }
accent: { gold: "#FFD93D", mint: "#6BCB77", lavender: "#A66CFF", coral: "#FF6B6B", sky: "#4FC0E8" }
text: { primary: "#E8E8E8", secondary: "#A0A0B0", tertiary: "#6B6B80" }
```

テーマは `constants/themes/` に各ファイルで定義し、`constants/Colors.ts` でエクスポートする。
アプリ起動時に `app.json` の `extra.theme` もしくは設定画面から切り替え可能にする。

## ディレクトリ構成
```
app-starter/
├── app/
│   ├── _layout.tsx          # ルートレイアウト
│   ├── (tabs)/
│   │   ├── _layout.tsx      # タブレイアウト（3タブ: ホーム/設定/その他）
│   │   ├── index.tsx        # ホーム画面（空テンプレート）
│   │   └── settings.tsx     # 設定画面（テーマ切り替え）
│   └── auth.tsx             # 認証画面（プレースホルダー）
├── components/
│   └── (空、必要に応じて追加)
├── constants/
│   ├── Colors.ts            # テーマエクスポート
│   └── themes/
│       ├── pastel-sky.ts
│       ├── warm-natural.ts
│       └── cool-dark.ts
├── db/
│   ├── client.ts            # Drizzle + expo-sqlite クライアント
│   ├── schema.ts            # テーブル定義（appSettings のみ）
│   ├── migrations.ts        # マイグレーション基盤
│   └── seed.ts              # 初期データ
├── store/
│   └── useSettingsStore.ts   # テーマ設定等
├── lib/
│   └── utils.ts             # generateId, formatCurrency, formatDate 等
├── app.json
├── eas.json
├── package.json
├── tsconfig.json
├── CLAUDE.md                # AIへの指示ファイル
└── README.md
```

## CLAUDE.md に含めるルール
```markdown
# ルール
- このリポジトリ内で別のアプリを作成するな。新しいアプリはapp-starterテンプレートから別リポで作れ。
- ブランチを切る前に必ず `git stash` で未コミットの変更を保護しろ。
- コミットは必ず最新のHEAD上に作れ。古いコミットから分岐するな。
- OTAデプロイ: `npx eas update --branch preview`
```

## 共通ユーティリティ (lib/utils.ts)
```typescript
export function generateId(): string // タイムスタンプ + ランダム8文字
export function formatCurrency(amount: number): string // ¥1,234形式
export function formatNumber(n: number): string // 1,234形式
export function formatDate(date: Date): string // YYYY/MM/DD
export function getTodayString(): string // YYYY-MM-DD
export function getYesterdayString(): string // YYYY-MM-DD
```

## DB基盤 (db/)
- `client.ts`: `expo-sqlite` + `drizzle-orm` 初期化
- `schema.ts`: `appSettings` テーブルのみ（key-value）
- `migrations.ts`: バージョン管理パターン（v1から開始、`app_settings`にバージョン保存）

## EAS設定
- `eas.json`: development / preview / production プロファイル
- `app.json`: `extra.eas.projectId` はクローン後に設定

## 使い方（READMEに書く）
1. このリポをテンプレートとしてGitHubで新規リポ作成
2. `git clone` してローカルに落とす
3. `app.json` の `name`, `slug`, `extra.eas.projectId` を変更
4. `npm install`
5. `npx expo start` で開発開始

## 注意事項
- reward-appの `constants/Colors.ts` を参考にテーマを作る
- reward-appの `lib/utils.ts` をそのままコピーしてOK
- reward-appの `db/client.ts` と `db/migrations.ts` のパターンを踏襲
