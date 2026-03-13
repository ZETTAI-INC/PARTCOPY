export const FAMILY_COLORS: Record<string, string> = {
  navigation: '#6366f1',
  hero: '#3b82f6',
  feature: '#10b981',
  social_proof: '#ec4899',
  stats: '#84cc16',
  pricing: '#8b5cf6',
  faq: '#14b8a6',
  content: '#64748b',
  cta: '#f59e0b',
  contact: '#f97316',
  recruit: '#06b6d4',
  footer: '#6b7280',
  news_list: '#a855f7',
  timeline: '#0ea5e9',
  company_profile: '#059669',
  gallery: '#06b6d4',
  logo_cloud: '#a855f7',
  carousel: '#e11d48',
  tabs: '#0284c7',
  accordion: '#7c3aed',
  modal: '#d946ef',
  card: '#f59e0b'
}

export interface FamilyMeta {
  key: string
  label: string
  icon: string
  description: string
  group: 'page_top' | 'main_content' | 'conversion' | 'page_bottom' | 'other'
}

export const FAMILY_GROUP_LABELS: Record<string, string> = {
  page_top: 'ページ上部',
  main_content: 'メインコンテンツ',
  conversion: 'コンバージョン',
  page_bottom: 'ページ下部',
  other: 'その他',
}

export const FAMILY_META: FamilyMeta[] = [
  // ページ上部
  { key: 'navigation',      label: 'メニュー',         icon: '',  description: 'ロゴ＋リンクが並ぶヘッダー部分',       group: 'page_top' },
  { key: 'hero',             label: 'メインビジュアル',  icon: '',  description: '最初に目に入る大きい画像＋キャッチコピー', group: 'page_top' },

  // メインコンテンツ
  { key: 'feature',          label: '特徴・サービス紹介', icon: '',  description: 'サービスの強みをカード等で並べたエリア',   group: 'main_content' },
  { key: 'social_proof',     label: 'お客様の声',        icon: '',  description: '利用者の感想・導入事例',                  group: 'main_content' },
  { key: 'stats',            label: '数字で見る実績',    icon: '',  description: '導入社数・満足度など数字の訴求',           group: 'main_content' },
  { key: 'logo_cloud',       label: '導入企業ロゴ',      icon: '',  description: '取引先・パートナーのロゴを並べたエリア',   group: 'main_content' },
  { key: 'pricing',          label: '料金プラン',        icon: '',  description: '価格表やプラン比較',                      group: 'main_content' },
  { key: 'faq',              label: 'よくある質問',      icon: '',  description: 'Q&A形式の質問と回答',                     group: 'main_content' },
  { key: 'content',          label: '読み物・説明',      icon: '',  description: 'テキスト中心の説明エリア',                group: 'main_content' },
  { key: 'news_list',        label: 'お知らせ一覧',      icon: '',  description: 'ニュース・ブログの一覧',                  group: 'main_content' },
  { key: 'gallery',          label: '写真ギャラリー',    icon: '',  description: '写真や作品を並べて見せるエリア',           group: 'main_content' },
  { key: 'company_profile',  label: '会社情報',          icon: '',  description: '会社概要・代表挨拶など',                  group: 'main_content' },
  { key: 'timeline',         label: '沿革・ステップ',    icon: '',  description: '時系列や手順をステップで表示',             group: 'main_content' },
  { key: 'recruit',          label: '採用情報',          icon: '',  description: '求人・採用に関するセクション',             group: 'main_content' },
  { key: 'carousel',         label: 'カルーセル',        icon: '',  description: 'スライダー・画像切替の横並びUI',           group: 'main_content' },
  { key: 'tabs',             label: 'タブ切替',          icon: '',  description: 'タブで内容を切り替えるUI',                 group: 'main_content' },
  { key: 'accordion',        label: 'アコーディオン',    icon: '',  description: '開閉式の折りたたみUI',                     group: 'main_content' },
  { key: 'modal',            label: 'モーダル・ポップアップ', icon: '', description: 'ダイアログ・ポップアップUI',             group: 'main_content' },
  { key: 'card',             label: 'カード',            icon: '',  description: '情報をまとめた単体カードUI',               group: 'main_content' },

  // コンバージョン
  { key: 'cta',              label: 'アクションボタン',  icon: '',  description: '申し込み・資料請求などの誘導',             group: 'conversion' },
  { key: 'contact',          label: '問い合わせフォーム', icon: '',  description: 'メールフォーム・電話番号など',             group: 'conversion' },

  // ページ下部
  { key: 'footer',           label: 'フッター',          icon: '',  description: 'ページ最下部のリンク集・著作権表示',       group: 'page_bottom' },
]

/** key → FamilyMeta のルックアップ */
export const FAMILY_META_MAP: Record<string, FamilyMeta> = Object.fromEntries(
  FAMILY_META.map(m => [m.key, m])
)
