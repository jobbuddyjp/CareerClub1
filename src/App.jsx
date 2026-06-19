import React, { useState, useEffect, useRef } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";


// エラー境界 - レンダリングエラーをキャッチして表示する
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding:40, textAlign:"center", fontFamily:"sans-serif" }}>
          <h2 style={{ color:"#DC2626", marginBottom:16 }}>エラーが発生しました</h2>
          <pre style={{ background:"#FEF2F2", padding:16, borderRadius:8, textAlign:"left", fontSize:12, overflow:"auto", maxWidth:600, margin:"0 auto" }}>
            {String(this.state.error)}
          </pre>
          <p style={{ marginTop:16, color:"#666", fontSize:13 }}>このエラー内容をClaudeに送ってください</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── 定数 ─────────────────────────────────────────────────────────────────────
const INDUSTRY_GROUPS = {
  "金融・銀行":   ["銀行","信託銀行","地方銀行","証券会社","生命保険","損害保険","消費者金融"],
  "商社":         ["総合商社","専門商社"],
  "メーカー":     ["自動車","電機・電子","機械・重工","化学・素材","食品・飲料","医薬品","その他メーカー"],
  "IT・テック":   ["SIer","ソフトウェア","Web・インターネット","通信","半導体・電子部品"],
  "コンサル":     ["経営コンサル","ITコンサル","会計・税務","法律・特許"],
  "不動産・建設": ["デベロッパー","建設・ゼネコン","設備・インフラ"],
  "小売・流通":   ["百貨店・スーパー","EC・通販","物流・運輸","専門小売"],
  "サービス":     ["人材・派遣","広告・PR","メディア","ホテル・旅行","外食"],
  "医療・ヘルス": ["病院・クリニック","医療機器","医薬品卸"],
  "教育・公共":   ["学校・予備校","官公庁・公務員","NPO・団体"],
  "エンタメ":     ["ゲーム","映像・音楽","スポーツ","出版"],
  "航空":         ["航空会社","空港運営","ヘリコプター","航空整備"],
  "交通・運輸":   ["鉄道","バス","海運","タクシー","物流"],
};
const ALL_GROUPS   = Object.keys(INDUSTRY_GROUPS);
const STAGES       = ["書類選考","一次面接","二次面接","三次面接","最終面接","内定","内定辞退","不合格","辞退"];
const BOARD_STAGES = ["書類選考中","書類通過","一次選考","二次選考","三次選考","四次選考","最終選考","内定","内定辞退","不合格","辞退"];
// 投稿者バッジ
const BADGES = [
  { name:"プラチナ",  emoji:"💎", min:50, color:"#0EA5E9", bg:"#E0F2FE" },
  { name:"ゴールド",  emoji:"🥇", min:20, color:"#D97706", bg:"#FEF3C7" },
  { name:"シルバー",  emoji:"🥈", min:5,  color:"#64748B", bg:"#F1F5F9" },
  { name:"ブロンズ",  emoji:"🥉", min:1,  color:"#92400E", bg:"#FEF3C7" },
];
const STREAK_BADGES = [
  { name:"殿堂入り",   emoji:"👑", min:30, color:"#9333EA", bg:"#F3E8FF" },
  { name:"週間連投",   emoji:"🌟", min:7,  color:"#EA580C", bg:"#FFEDD5" },
  { name:"3日連投",    emoji:"🔥", min:3,  color:"#DC2626", bg:"#FEE2E2" },
];
const getStreakBadge = (streak) => STREAK_BADGES.find(b => streak >= b.min) || null;
const getBadge = (count) => BADGES.find(b => count >= b.min) || null;

const APPLY_METHODS = ["転職エージェント経由","ビズリーチ経由","企業ホームページから直接","リファラル(社員紹介)","求人サイト経由","ヘッドハンター経由","SNS経由","その他"];
const HOUSING_TYPES = ["なし","あり（金額不明）","あり（月1万円未満）","あり（月1~3万円）","あり（月3~5万円）","あり（月5万円以上）"];
const EMP_TYPES    = ["正社員","契約社員","派遣社員","アルバイト","インターン","元社員"];
const TENURES      = ["~1年未満","1~3年","3~5年","5~10年","10年以上"];
const AGE_RANGES   = ["20~24歳","25~29歳","30~34歳","35~39歳","40~44歳","45歳以上"];
const JOB_TYPES    = ["エンジニア","営業","マーケティング","企画・経営","管理","デザイナー","研究・開発","人事","法務","その他"];
const JOB_CATEGORIES_BY_GROUP = {
  "金融・銀行":   ["全職種","総合職","法人営業","リテール営業","トレーダー","アナリスト","アクチュアリー","ITエンジニア","管理・バックオフィス","その他"],
  "商社":         ["全職種","総合職","営業（素材）","営業（食料）","営業（機械）","営業（エネルギー）","営業（化学品）","企画・経営","ITエンジニア","その他"],
  "メーカー":     ["全職種","総合職","技術職","研究・開発","生産管理","品質管理","営業","マーケティング","管理・バックオフィス","その他"],
  "IT・テック":   ["全職種","エンジニア（バックエンド）","エンジニア（フロントエンド）","インフラエンジニア","データサイエンティスト","PM・PdM","デザイナー","営業","その他"],
  "コンサル":     ["全職種","コンサルタント","シニアコンサルタント","マネージャー","シニアマネージャー","パートナー","スペシャリスト","その他"],
  "不動産・建設": ["全職種","総合職","施工管理","設計","営業","用地仕入","プロパティマネジメント","その他"],
  "小売・流通":   ["全職種","総合職","バイヤー","店舗スタッフ","SCM・物流","マーケティング","ITエンジニア","その他"],
  "サービス":     ["全職種","総合職","営業","マーケティング","クリエイター","プランナー","人事・採用","その他"],
  "医療・ヘルス": ["全職種","MR","臨床開発","薬剤師","研究・開発","営業","管理・バックオフィス","その他"],
  "教育・公共":   ["全職種","総合職","技術職","行政職","教員・講師","その他"],
  "エンタメ":     ["全職種","総合職","エンジニア","クリエイター","プランナー","営業","その他"],
  "航空":         ["全職種","パイロット（自社養成）","パイロット（既卒）","キャビンアテンダント","グランドスタッフ","整備士","運航管理","空港地上業務","その他"],
  "交通・運輸":   ["全職種","運転士","車掌","駅員","運行管理","整備士","物流オペレーション","営業","その他"],
};
const DEFAULT_JOB_CATEGORIES = ["全職種","総合職","技術職","営業","管理・バックオフィス","その他"];
const getJobCategories = (group) => JOB_CATEGORIES_BY_GROUP[group] || DEFAULT_JOB_CATEGORIES;
const POSITIONS    = ["一般社員","主任・係長","課長","部長","本部長・執行役員","役員・取締役","社長・CEO","その他"];
const EMOJIS       = ["🏢","🌐","💻","🚗","🛒","📱","🏦","📋","🎮","🏥","📢","🏭","✈️","🍜","📚","🎯","💊","🔬","⚡","🌿"];
const RCATS        = [
  { key:"motivation", label:"働きがい" },
  { key:"morale",     label:"社員のやる気" },
  { key:"relations",  label:"同僚・上司との関係" },
  { key:"white",      label:"ホワイト度" },
  { key:"growth",     label:"成長環境" },
  { key:"wlb",        label:"ワークライフバランス" },
  { key:"salary",     label:"待遇・給与の満足度" },
  { key:"mgmt",       label:"経営の安定性・将来性" },
];

// 部門カテゴリ
const DEPARTMENTS = ["全部門","営業","マーケティング","企画・経営","技術・開発","研究開発","製造・生産","品質管理","管理・バックオフィス","人事","経理・財務","法務","IT・システム","クリエイティブ","コンサル","その他"];

// 退職検討理由
const QUIT_REASONS = [
  "給与・待遇への不満",
  "残業・労働時間",
  "人間関係・社風",
  "キャリア・成長機会",
  "業務内容のミスマッチ",
  "経営方針への疑問",
  "評価制度への不満",
  "昇進・昇格の停滞",
  "ワークライフバランス",
  "勤務地・転勤",
  "家庭の事情",
  "健康上の理由",
  "退職検討なし",
  "その他"
];

// 残業時間カテゴリ（数値統計用）
const OVERTIME_BUCKETS = [
  { label:"~10時間", value:5 },
  { label:"10~20時間", value:15 },
  { label:"20~30時間", value:25 },
  { label:"30~45時間", value:37 },
  { label:"45~60時間", value:52 },
  { label:"60~80時間", value:70 },
  { label:"80時間~", value:90 },
];

// 有給消化率カテゴリ
const PAID_LEAVE_BUCKETS = [
  { label:"0~20%", value:10 },
  { label:"20~40%", value:30 },
  { label:"40~60%", value:50 },
  { label:"60~80%", value:70 },
  { label:"80~100%", value:90 },
];
const STAGE_COLORS = {
  "書類選考":    { bg:"#F0F4FF", tx:"#1E3A8A", br:"#BFCCF0" },
  "一次面接":    { bg:"#F0FBF4", tx:"#14532D", br:"#A7D7B5" },
  "二次面接":    { bg:"#FEFCE8", tx:"#713F12", br:"#E9D06A" },
  "最終面接":    { bg:"#FFF1F1", tx:"#7F1D1D", br:"#F5BBBB" },
  "内定":        { bg:"#F0FBF4", tx:"#14532D", br:"#6BCF8E" },
  "辞退・不合格":{ bg:"#F9FAFB", tx:"#525252", br:"#CCC"    },
};
const PLANS = {
  free:     { id:"free",     name:"無料",         color:"#555",    price:0    },
  standard: { id:"standard", name:"スタンダード", color:"#1a5276", price:980  },
  premium:  { id:"premium",  name:"プレミアム",   color:"#7B0000", price:2980 },
};

// ─── カラーパレット ────────────────────────────────────────────────────────────
const C = {
  bg:"#FAF8F3",          // 温かみのある紙色の背景
  surface:"#FFFFFF",     // カード背景
  ink:"#1C2B3A",         // 深い紺（テキスト）
  sub:"#6E7A88",         // サブテキスト
  accent:"#1E5FA6",      // 信頼の青（メイン/リンク）
  accent2:"#2C72BE",     // ホバー用の青
  accentDark:"#15406F",  // 強調用の濃紺
  light:"#EAF1F8",       // 淡い青
  warm:"#FBF4E6",        // 柔らかいクリーム（パネル）
  warmAccent:"#E0512F",  // 単一のエネルギー色（新着・盛り上がり・CTA）
  border:"#E8E2D6",      // 温かいヘアライン境界線
  success:"#2C7A4B",     // 成功色
};

// 会社をまたぐ「みんなの相談」用の仮想企業（企業一覧・業種集計には出さない）
const GENERAL_ID = "__general__";
const GENERAL_CO = { id: GENERAL_ID, name: "みんなの相談", emoji: "📣", group: "総合", industry: "総合", isGeneral: true };

// ゲスト（未ログイン）の表示名を自動生成（変更可・localStorageで保持）
// 投稿者名の自動生成（業種に合わせたウィットのある表示名・変更可）
const GUEST_NAME_POOLS = {
  "金融・銀行": ["数字に強い人", "M&Aのプロ", "元バンカー志望", "与信は任せろ", "金利が気になる", "決算オタク", "リスク管理担当", "融資の現場から", "簿記2級保持"],
  "コンサル": ["論点整理する人", "スライド職人", "フレームワーク好き", "仮説思考の人", "稼働率200%", "パワポの達人", "元コンサル志望", "示唆出しマン"],
  "IT・テック": ["コード書く人", "元エンジニア志望", "深夜デプロイ", "技術選定中", "UXが気になる", "PdM志望", "スタートアップ脳", "型は大事"],
  "メーカー": ["ものづくり志望", "現場が好き", "品質第一", "図面読める人", "生産管理志望", "技術で勝負", "試作品マニア"],
  "商社": ["駐在したい人", "ラーメンより商社", "資源好き", "語学勉強中", "出張多め希望", "ラオスに行きたい", "トレード志望"],
  "不動産・建設": ["街をつくる人", "元デベ志望", "再開発が好き", "間取り厨", "容積率を語る", "現場監督志望", "都市計画クラスタ"],
  "サービス": ["接客のプロ", "現場たたき上げ", "CS志望", "おもてなし担当"],
  "小売・流通": ["売場が好き", "元バイヤー志望", "物流の人", "棚割り職人"],
  "医療・ヘルス": ["白衣の志望者", "MR志望", "治験に詳しい", "元看護志望"],
};
const GUEST_NAME_GENERAL = ["名無しの求職者", "就活生", "転職検討中", "キャリア迷子", "情報収集中", "次の一手を探す人", "面接帰りの人", "ESに追われる人", "内定ほしい人", "逆質問は準備済み", "沈黙が苦手", "逆求人待ち"];
const genGuestName = (group) => {
  const pool = (group && GUEST_NAME_POOLS[group]) ? GUEST_NAME_POOLS[group].concat(GUEST_NAME_GENERAL) : GUEST_NAME_GENERAL;
  return pool[Math.floor(Math.random() * pool.length)];
};

// 荒らし・自演対策の投稿者ID（5ch風）。IP不使用のため端末/アカウント＋日付をハッシュ化。同一投稿者・同日は同じIDになる
const _fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const makePosterId = (seed) => ("0000000" + _fnv(String(seed == null ? "?" : seed)).toString(16)).slice(-8);

// ─── ユーティリティ ────────────────────────────────────────────────────────────
const ini   = (n) => n ? String(n).slice(0,2) : "?";
const today = () => new Date().toISOString().slice(0,10);
const ago   = (ts) => {
  if (!ts) return "-";
  const d    = ts?.toDate ? ts.toDate() : new Date(typeof ts === "number" ? ts * 1000 : ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "今日";
  if (diff  <  7) return diff + "日前";
  if (diff  < 30) return Math.floor(diff / 7) + "週間前";
  return Math.floor(diff / 30) + "ヶ月前";
};
const calcAvg = (revs) => {
  if (!revs || !revs.length) return null;
  const keys = RCATS.map(c => c.key);
  const s = { overall: 0 };
  keys.forEach(k => { s[k] = 0; });
  revs.forEach(r => {
    s.overall += r.overall || 0;
    keys.forEach(k => { s[k] += (r.rats && r.rats[k]) || 0; });
  });
  const n = revs.length;
  const out = { overall: s.overall / n };
  keys.forEach(k => { out[k] = s[k] / n; });
  return out;
};
const calcAvgSal = (sals) => {
  if (!sals || !sals.length) return null;
  return Math.round(sals.reduce((a, s) => a + (s.annualSalary || 0), 0) / sals.length);
};
const getGroup = (ind) => {
  for (const [g, ss] of Object.entries(INDUSTRY_GROUPS)) {
    if (g === ind || ss.includes(ind)) return g;
  }
  return ind;
};
function useWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── Firestore ヘルパー ────────────────────────────────────────────────────────
const col  = (name)     => collection(db, name);
const dref = (c, id)    => doc(db, c, id);

const fsAdd = async (c, data) => {
  const ref = await addDoc(col(c), { ...data, createdAt: serverTimestamp() });
  return ref.id;
};
const fsSet = async (c, id, data) => {
  await setDoc(dref(c, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
};
const fsDel = async (c, id) => {
  await deleteDoc(dref(c, id));
};
const fsGet = async (c, id) => {
  const snap = await getDoc(dref(c, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};
const fsAll = async (c, orderField = null) => {
  const q   = orderField ? query(col(c), orderBy(orderField, "desc")) : col(c);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
const fsWhere = async (c, field, op, val) => {
  const snap = await getDocs(query(col(c), where(field, op, val)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
const fsUpdate = async (c, id, data) => {
  await updateDoc(dref(c, id), { ...data, updatedAt: serverTimestamp() });
};

const SEED_COMPANIES = [
  { name:"三菱UFJ銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:1 },
  { name:"三井住友銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:2 },
  { name:"みずほ銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:3 },
  { name:"りそな銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:4 },
  { name:"埼玉りそな銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:5 },
  { name:"三井住友信託銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:6 },
  { name:"SBI新生銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:7 },
  { name:"あおぞら銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:8 },
  { name:"ゆうちょ銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:9 },
  { name:"農林中央金庫", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:10 },
  { name:"日本政策投資銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:11 },
  { name:"商工組合中央金庫", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:12 },
  { name:"新生銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:13 },
  { name:"日本政策金融公庫", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:14 },
  { name:"住信SBIネット銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:15 },
  { name:"セブン銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:16 },
  { name:"イオン銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:17 },
  { name:"楽天銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:18 },
  { name:"auじぶん銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:19 },
  { name:"ソニー銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:20 },
  { name:"PayPay銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:21 },
  { name:"横浜銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:22 },
  { name:"千葉銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:23 },
  { name:"常陽銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:24 },
  { name:"静岡銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:25 },
  { name:"ふくおかフィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:26 },
  { name:"西日本シティ銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:27 },
  { name:"八十二銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:28 },
  { name:"群馬銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:29 },
  { name:"京都銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:30 },
  { name:"広島銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:31 },
  { name:"北陸銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:32 },
  { name:"北海道銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:33 },
  { name:"山口フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:34 },
  { name:"めぶきフィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:35 },
  { name:"コンコルディア・フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:36 },
  { name:"九州フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:37 },
  { name:"北國フィナンシャルホールディングス", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:38 },
  { name:"岩手銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:39 },
  { name:"秋田銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:40 },
  { name:"東邦銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:41 },
  { name:"武蔵野銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:42 },
  { name:"千葉興業銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:43 },
  { name:"東京きらぼしフィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:44 },
  { name:"スルガ銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:45 },
  { name:"山梨中央銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:46 },
  { name:"北越銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:47 },
  { name:"富山第一銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:48 },
  { name:"福井銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:49 },
  { name:"百五銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:50 },
  { name:"三十三フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:51 },
  { name:"滋賀銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:52 },
  { name:"南都銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:53 },
  { name:"紀陽銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:54 },
  { name:"但馬銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:55 },
  { name:"池田泉州ホールディングス", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:56 },
  { name:"阿波銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:57 },
  { name:"百十四銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:58 },
  { name:"伊予銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:59 },
  { name:"四国銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:60 },
  { name:"佐賀銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:61 },
  { name:"十八親和銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:62 },
  { name:"肥後銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:63 },
  { name:"大分銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:64 },
  { name:"宮崎銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:65 },
  { name:"鹿児島銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:66 },
  { name:"琉球銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:67 },
  { name:"沖縄銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦", sortRank:68 },
  { name:"三菱UFJ信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦", sortRank:69 },
  { name:"みずほ信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦", sortRank:70 },
  { name:"野村信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦", sortRank:71 },
  { name:"SMBC信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦", sortRank:72 },
  { name:"野村證券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:73 },
  { name:"大和証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:74 },
  { name:"SMBC日興証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:75 },
  { name:"みずほ証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:76 },
  { name:"三菱UFJモルガン・スタンレー証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:77 },
  { name:"岡三証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:78 },
  { name:"東海東京証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:79 },
  { name:"松井証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:80 },
  { name:"マネックスグループ", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:81 },
  { name:"SBI証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:82 },
  { name:"楽天証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:83 },
  { name:"au カブコム証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:84 },
  { name:"GMOクリック証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:85 },
  { name:"ジャフコ グループ", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:86 },
  { name:"東京証券取引所", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:87 },
  { name:"日本取引所グループ", group:"金融・銀行", industry:"証券会社", emoji:"🏦", sortRank:88 },
  { name:"日本生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:89 },
  { name:"第一生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:90 },
  { name:"明治安田生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:91 },
  { name:"住友生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:92 },
  { name:"かんぽ生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:93 },
  { name:"ソニー生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:94 },
  { name:"アフラック生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:95 },
  { name:"プルデンシャル生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:96 },
  { name:"T&Dホールディングス", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:97 },
  { name:"大樹生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:98 },
  { name:"太陽生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:99 },
  { name:"富国生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:100 },
  { name:"朝日生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:101 },
  { name:"ライフネット生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:102 },
  { name:"アクサ生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:103 },
  { name:"オリックス生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:104 },
  { name:"三井住友海上あいおい生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:105 },
  { name:"東京海上日動あんしん生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦", sortRank:106 },
  { name:"東京海上日動火災保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:107 },
  { name:"三井住友海上火災保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:108 },
  { name:"損害保険ジャパン", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:109 },
  { name:"あいおいニッセイ同和損害保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:110 },
  { name:"東京海上ホールディングス", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:111 },
  { name:"SOMPOホールディングス", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:112 },
  { name:"MS&ADインシュアランスグループホールディングス", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:113 },
  { name:"AIG損害保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:114 },
  { name:"Chubb損害保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:115 },
  { name:"ゼネラリ・ホールディングス・ジャパン", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:116 },
  { name:"チューリッヒ保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦", sortRank:117 },
  { name:"オリックス", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:118 },
  { name:"三菱HCキャピタル", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:119 },
  { name:"東京センチュリー", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:120 },
  { name:"リコーリース", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:121 },
  { name:"NECキャピタルソリューション", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:122 },
  { name:"クレディセゾン", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:123 },
  { name:"ジャックス", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:124 },
  { name:"アコム", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:125 },
  { name:"アイフル", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:126 },
  { name:"SBIホールディングス", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:127 },
  { name:"オリエントコーポレーション", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:128 },
  { name:"イオンフィナンシャルサービス", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:129 },
  { name:"ジャパンネット銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:130 },
  { name:"セゾン情報システムズ", group:"金融・銀行", industry:"銀行", emoji:"🏦", sortRank:131 },
  { name:"三菱商事", group:"商社", industry:"総合商社", emoji:"🌐", sortRank:132 },
  { name:"三井物産", group:"商社", industry:"総合商社", emoji:"🌐", sortRank:133 },
  { name:"伊藤忠商事", group:"商社", industry:"総合商社", emoji:"🌐", sortRank:134 },
  { name:"住友商事", group:"商社", industry:"総合商社", emoji:"🌐", sortRank:135 },
  { name:"丸紅", group:"商社", industry:"総合商社", emoji:"🌐", sortRank:136 },
  { name:"豊田通商", group:"商社", industry:"総合商社", emoji:"🌐", sortRank:137 },
  { name:"双日", group:"商社", industry:"総合商社", emoji:"🌐", sortRank:138 },
  { name:"メタルワン", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:139 },
  { name:"三菱食品", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:140 },
  { name:"伊藤忠食品", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:141 },
  { name:"三井食品", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:142 },
  { name:"加賀電子", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:143 },
  { name:"稲畑産業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:144 },
  { name:"兼松", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:145 },
  { name:"日鉄物産", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:146 },
  { name:"JFE商事", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:147 },
  { name:"阪和興業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:148 },
  { name:"エレマテック", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:149 },
  { name:"因幡電機産業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:150 },
  { name:"日伝", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:151 },
  { name:"西華産業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:152 },
  { name:"光世証券", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:153 },
  { name:"岡谷鋼機", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:154 },
  { name:"蝶理", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:155 },
  { name:"東邦HD", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:156 },
  { name:"スズケン", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:157 },
  { name:"アルフレッサ ホールディングス", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:158 },
  { name:"メディパルホールディングス", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:159 },
  { name:"ユアサ商事", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:160 },
  { name:"岩谷産業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:161 },
  { name:"中外鉱業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:162 },
  { name:"ハピネット", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:163 },
  { name:"あらた", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:164 },
  { name:"パルタック", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:165 },
  { name:"三谷商事", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:166 },
  { name:"ミスミグループ本社", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:167 },
  { name:"正栄食品工業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:168 },
  { name:"明和産業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:169 },
  { name:"東京産業", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:170 },
  { name:"TKC", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:171 },
  { name:"シナネンホールディングス", group:"商社", industry:"専門商社", emoji:"🌐", sortRank:172 },
  { name:"トヨタ自動車", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:173 },
  { name:"ホンダ", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:174 },
  { name:"日産自動車", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:175 },
  { name:"スズキ", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:176 },
  { name:"マツダ", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:177 },
  { name:"SUBARU", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:178 },
  { name:"いすゞ自動車", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:179 },
  { name:"三菱自動車工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:180 },
  { name:"ヤマハ発動機", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:181 },
  { name:"川崎重工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:182 },
  { name:"日野自動車", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:183 },
  { name:"UDトラックス", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:184 },
  { name:"デンソー", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:185 },
  { name:"アイシン", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:186 },
  { name:"豊田自動織機", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:187 },
  { name:"ジェイテクト", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:188 },
  { name:"トヨタ紡織", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:189 },
  { name:"小糸製作所", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:190 },
  { name:"豊田合成", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:191 },
  { name:"NTN", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:192 },
  { name:"NSK", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:193 },
  { name:"日本特殊陶業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:194 },
  { name:"ブリヂストン", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:195 },
  { name:"住友ゴム工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:196 },
  { name:"横浜ゴム", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:197 },
  { name:"TOYO TIRE", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:198 },
  { name:"曙ブレーキ工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:199 },
  { name:"ボッシュ", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:200 },
  { name:"エクセディ", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:201 },
  { name:"太平洋工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:202 },
  { name:"河西工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:203 },
  { name:"スタンレー電気", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:204 },
  { name:"市光工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:205 },
  { name:"日本電産", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:206 },
  { name:"ミツバ", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:207 },
  { name:"ヨロズ", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:208 },
  { name:"ハイレックス", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:209 },
  { name:"フタバ産業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:210 },
  { name:"シロキ工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:211 },
  { name:"愛三工業", group:"メーカー", industry:"自動車", emoji:"🏭", sortRank:212 },
  { name:"ソニーグループ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:213 },
  { name:"パナソニックホールディングス", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:214 },
  { name:"日立製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:215 },
  { name:"三菱電機", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:216 },
  { name:"東芝", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:217 },
  { name:"シャープ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:218 },
  { name:"富士通", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:219 },
  { name:"NEC", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:220 },
  { name:"キヤノン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:221 },
  { name:"リコー", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:222 },
  { name:"コニカミノルタ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:223 },
  { name:"セイコーエプソン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:224 },
  { name:"ブラザー工業", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:225 },
  { name:"オムロン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:226 },
  { name:"横河電機", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:227 },
  { name:"アンリツ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:228 },
  { name:"島津製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:229 },
  { name:"島田理化工業", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:230 },
  { name:"HOYA", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:231 },
  { name:"オリンパス", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:232 },
  { name:"ニコン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:233 },
  { name:"富士フイルムホールディングス", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:234 },
  { name:"アドバンテスト", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:235 },
  { name:"スクリーンホールディングス", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:236 },
  { name:"ディスコ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:237 },
  { name:"東京精密", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:238 },
  { name:"新光電気工業", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:239 },
  { name:"イビデン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:240 },
  { name:"太陽誘電", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:241 },
  { name:"ニチコン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:242 },
  { name:"ルビコン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:243 },
  { name:"FDK", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:244 },
  { name:"古河電池", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:245 },
  { name:"GSユアサ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:246 },
  { name:"ローム", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:247 },
  { name:"ルネサスエレクトロニクス", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:248 },
  { name:"東京エレクトロン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:249 },
  { name:"SUMCO", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:250 },
  { name:"信越化学工業", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:251 },
  { name:"レーザーテック", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:252 },
  { name:"アルプスアルパイン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:253 },
  { name:"TDK", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:254 },
  { name:"村田製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:255 },
  { name:"京セラ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:256 },
  { name:"ミネベアミツミ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:257 },
  { name:"ヒロセ電機", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:258 },
  { name:"ヤマハ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:259 },
  { name:"コルグ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:260 },
  { name:"JVCケンウッド", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:261 },
  { name:"パイオニア", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:262 },
  { name:"アイホン", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:263 },
  { name:"アイコム", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:264 },
  { name:"リョービ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:265 },
  { name:"マキタ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:266 },
  { name:"ホシザキ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:267 },
  { name:"パナソニック", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:268 },
  { name:"アイリスオーヤマ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:269 },
  { name:"ダイキン工業", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:270 },
  { name:"三菱重工サーマルシステムズ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:271 },
  { name:"富士電機", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:272 },
  { name:"明電舎", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:273 },
  { name:"東芝テック", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:274 },
  { name:"NECネッツエスアイ", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:275 },
  { name:"パナホーム", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:276 },
  { name:"東光電気", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:277 },
  { name:"タムラ製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭", sortRank:278 },
  { name:"ロームグループ", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:279 },
  { name:"KOKUSAI ELECTRIC", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:280 },
  { name:"東京応化工業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:281 },
  { name:"JSR", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:282 },
  { name:"アドテック", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:283 },
  { name:"東洋合成工業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:284 },
  { name:"住友ベークライト", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:285 },
  { name:"三菱マテリアル", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:286 },
  { name:"三井金属鉱業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:287 },
  { name:"古河電気工業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:288 },
  { name:"昭和電工", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:289 },
  { name:"レゾナック", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:290 },
  { name:"DOWAホールディングス", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭", sortRank:291 },
  { name:"三菱重工業", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:292 },
  { name:"IHI", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:293 },
  { name:"クボタ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:294 },
  { name:"ファナック", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:295 },
  { name:"コマツ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:296 },
  { name:"日立建機", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:297 },
  { name:"オークマ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:298 },
  { name:"DMG森精機", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:299 },
  { name:"アマダ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:300 },
  { name:"JUKI", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:301 },
  { name:"ナブテスコ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:302 },
  { name:"ヤンマーホールディングス", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:303 },
  { name:"タダノ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:304 },
  { name:"タクボ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:305 },
  { name:"新明和工業", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:306 },
  { name:"住友重機械工業", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:307 },
  { name:"日本製鋼所", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:308 },
  { name:"椿本チエイン", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:309 },
  { name:"ハーモニック・ドライブ・システムズ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:310 },
  { name:"ジャパンマテリアル", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:311 },
  { name:"SMC", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:312 },
  { name:"CKD", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:313 },
  { name:"エスペック", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:314 },
  { name:"ナガオカ", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:315 },
  { name:"日本精工", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:316 },
  { name:"東京瓦斯", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:317 },
  { name:"大阪ガス", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:318 },
  { name:"東邦ガス", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:319 },
  { name:"西部ガス", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:320 },
  { name:"JERA", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:321 },
  { name:"関西電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:322 },
  { name:"東北電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:323 },
  { name:"中部電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:324 },
  { name:"北陸電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:325 },
  { name:"中国電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:326 },
  { name:"四国電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:327 },
  { name:"九州電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:328 },
  { name:"沖縄電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:329 },
  { name:"北海道電力", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:330 },
  { name:"東京電力ホールディングス", group:"メーカー", industry:"機械・重工", emoji:"🏭", sortRank:331 },
  { name:"三菱ケミカルグループ", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:332 },
  { name:"住友化学", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:333 },
  { name:"三井化学", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:334 },
  { name:"旭化成", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:335 },
  { name:"東レ", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:336 },
  { name:"帝人", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:337 },
  { name:"クラレ", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:338 },
  { name:"DIC", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:339 },
  { name:"日本触媒", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:340 },
  { name:"日油", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:341 },
  { name:"花王", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:342 },
  { name:"ライオン", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:343 },
  { name:"資生堂", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:344 },
  { name:"コーセー", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:345 },
  { name:"ポーラ・オルビスホールディングス", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:346 },
  { name:"マンダム", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:347 },
  { name:"小林製薬", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:348 },
  { name:"アース製薬", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:349 },
  { name:"ピジョン", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:350 },
  { name:"ユニ・チャーム", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:351 },
  { name:"エステー", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:352 },
  { name:"白元アース", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:353 },
  { name:"日本製鉄", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:354 },
  { name:"JFEホールディングス", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:355 },
  { name:"神戸製鋼所", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:356 },
  { name:"日新製鋼", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:357 },
  { name:"大同特殊鋼", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:358 },
  { name:"山陽特殊製鋼", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:359 },
  { name:"住友金属鉱山", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:360 },
  { name:"古河機械金属", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:361 },
  { name:"AGC", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:362 },
  { name:"日本電気硝子", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:363 },
  { name:"日本板硝子", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:364 },
  { name:"太平洋セメント", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:365 },
  { name:"住友大阪セメント", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:366 },
  { name:"UBE", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:367 },
  { name:"TOTO", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:368 },
  { name:"LIXILグループ", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:369 },
  { name:"INAX", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:370 },
  { name:"タカラスタンダード", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:371 },
  { name:"クリナップ", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:372 },
  { name:"リクシル", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:373 },
  { name:"パナソニックハウジング", group:"メーカー", industry:"化学・素材", emoji:"🏭", sortRank:374 },
  { name:"サントリーホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:375 },
  { name:"アサヒグループホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:376 },
  { name:"キリンホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:377 },
  { name:"サッポロホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:378 },
  { name:"オリオンビール", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:379 },
  { name:"コカ・コーラボトラーズジャパンホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:380 },
  { name:"ダイドーグループホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:381 },
  { name:"ポッカサッポロフード&ビバレッジ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:382 },
  { name:"伊藤園", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:383 },
  { name:"コカ・コーラ ボトラーズジャパン", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:384 },
  { name:"味の素", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:385 },
  { name:"ヤマザキビスケット", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:386 },
  { name:"明治ホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:387 },
  { name:"森永製菓", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:388 },
  { name:"江崎グリコ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:389 },
  { name:"カルビー", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:390 },
  { name:"ロッテ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:391 },
  { name:"森永乳業", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:392 },
  { name:"雪印メグミルク", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:393 },
  { name:"ヤクルト本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:394 },
  { name:"フジパングループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:395 },
  { name:"敷島製パン", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:396 },
  { name:"山崎製パン", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:397 },
  { name:"パスコ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:398 },
  { name:"日清食品ホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:399 },
  { name:"東洋水産", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:400 },
  { name:"ハウス食品グループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:401 },
  { name:"エスビー食品", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:402 },
  { name:"ミツカン", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:403 },
  { name:"キッコーマン", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:404 },
  { name:"カゴメ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:405 },
  { name:"Mizkan", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:406 },
  { name:"プリマハム", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:407 },
  { name:"伊藤ハム", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:408 },
  { name:"日本ハム", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:409 },
  { name:"ニチレイ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:410 },
  { name:"マルハニチロ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:411 },
  { name:"ニチロ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:412 },
  { name:"極洋", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:413 },
  { name:"東洋製罐", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:414 },
  { name:"東京製鐵", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:415 },
  { name:"日清製粉グループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:416 },
  { name:"日清オイリオグループ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:417 },
  { name:"J-オイルミルズ", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:418 },
  { name:"不二製油グループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:419 },
  { name:"日東富士製粉", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:420 },
  { name:"昭和産業", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:421 },
  { name:"王子ホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:422 },
  { name:"日本製紙", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:423 },
  { name:"北越コーポレーション", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:424 },
  { name:"三菱製紙", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:425 },
  { name:"レンゴー", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:426 },
  { name:"大王製紙", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:427 },
  { name:"日本紙パルプ商事", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:428 },
  { name:"凸版印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:429 },
  { name:"大日本印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:430 },
  { name:"共同印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:431 },
  { name:"図書印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:432 },
  { name:"DNP大日本印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭", sortRank:433 },
  { name:"武田薬品工業", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:434 },
  { name:"アステラス製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:435 },
  { name:"第一三共", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:436 },
  { name:"エーザイ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:437 },
  { name:"中外製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:438 },
  { name:"大塚ホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:439 },
  { name:"塩野義製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:440 },
  { name:"協和キリン", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:441 },
  { name:"参天製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:442 },
  { name:"小野薬品工業", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:443 },
  { name:"大日本住友製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:444 },
  { name:"住友ファーマ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:445 },
  { name:"東邦ホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:446 },
  { name:"ロート製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:447 },
  { name:"久光製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:448 },
  { name:"ツムラ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:449 },
  { name:"ロハス・モチベーション", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:450 },
  { name:"沢井製薬", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:451 },
  { name:"日医工", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:452 },
  { name:"ソレイジア・ファーマ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:453 },
  { name:"クラシエホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:454 },
  { name:"テルモ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:455 },
  { name:"ニプロ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:456 },
  { name:"シスメックス", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:457 },
  { name:"JMS", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:458 },
  { name:"日本光電工業", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:459 },
  { name:"フクダ電子", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:460 },
  { name:"アズビル", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:461 },
  { name:"PHCホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:462 },
  { name:"エム・スリー", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:463 },
  { name:"ペプチドリーム", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:464 },
  { name:"アンジェス", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:465 },
  { name:"Chugai Pharmabody Research", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:466 },
  { name:"GSK", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:467 },
  { name:"ノバルティス ファーマ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:468 },
  { name:"ファイザー", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:469 },
  { name:"メルク", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:470 },
  { name:"サノフィ", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:471 },
  { name:"ロシュ・ダイアグノスティックス", group:"メーカー", industry:"医薬品", emoji:"🏭", sortRank:472 },
  { name:"YKK", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:473 },
  { name:"YKK AP", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:474 },
  { name:"三菱鉛筆", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:475 },
  { name:"パイロットコーポレーション", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:476 },
  { name:"コクヨ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:477 },
  { name:"プラス", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:478 },
  { name:"セーラー万年筆", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:479 },
  { name:"ぺんてる", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:480 },
  { name:"マブチモーター", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:481 },
  { name:"ナカニシ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:482 },
  { name:"ユニチャーム", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:483 },
  { name:"アシックス", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:484 },
  { name:"ミズノ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:485 },
  { name:"デサント", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:486 },
  { name:"ゴールドウイン", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:487 },
  { name:"ヨネックス", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:488 },
  { name:"シマノ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:489 },
  { name:"ジーシー", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:490 },
  { name:"モリタホールディングス", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:491 },
  { name:"松風", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:492 },
  { name:"シキボウ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:493 },
  { name:"セーレン", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:494 },
  { name:"三菱レイヨン", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:495 },
  { name:"東洋紡", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:496 },
  { name:"クラボウ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:497 },
  { name:"ヘリオス テクノ ホールディング", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:498 },
  { name:"タカラトミー", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:499 },
  { name:"エポック社", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:500 },
  { name:"セガサミーホールディングス", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:501 },
  { name:"アディダス", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:502 },
  { name:"ナイキ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:503 },
  { name:"プーマ", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:504 },
  { name:"タイガー魔法瓶", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:505 },
  { name:"象印マホービン", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:506 },
  { name:"ピーコック魔法瓶工業", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:507 },
  { name:"ティファール", group:"メーカー", industry:"その他メーカー", emoji:"🏭", sortRank:508 },
  { name:"NTTデータ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:509 },
  { name:"野村総合研究所", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:510 },
  { name:"日鉄ソリューションズ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:511 },
  { name:"SCSK", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:512 },
  { name:"TIS", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:513 },
  { name:"BIPROGY", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:514 },
  { name:"伊藤忠テクノソリューションズ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:515 },
  { name:"日本ユニシス", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:516 },
  { name:"オービックビジネスコンサルタント", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:517 },
  { name:"オービック", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:518 },
  { name:"日立ソリューションズ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:519 },
  { name:"NSD", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:520 },
  { name:"コムチュア", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:521 },
  { name:"アルファシステムズ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:522 },
  { name:"DTS", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:523 },
  { name:"ＳＣＳＫ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:524 },
  { name:"システナ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:525 },
  { name:"NSSOL", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:526 },
  { name:"ネットワンシステムズ", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:527 },
  { name:"クエスト", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:528 },
  { name:"アイネット", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:529 },
  { name:"電通国際情報サービス", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:530 },
  { name:"CTC", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:531 },
  { name:"TDCソフト", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:532 },
  { name:"アルゴグラフィックス", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:533 },
  { name:"インフォコム", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:534 },
  { name:"ウェルネット", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:535 },
  { name:"ITホールディングス", group:"IT・テック", industry:"SIer", emoji:"💻", sortRank:536 },
  { name:"サイボウズ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:537 },
  { name:"マネーフォワード", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:538 },
  { name:"freee", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:539 },
  { name:"Sansan", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:540 },
  { name:"ラクス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:541 },
  { name:"ラクスル", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:542 },
  { name:"BASE", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:543 },
  { name:"STORES", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:544 },
  { name:"Chatwork", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:545 },
  { name:"kintone", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:546 },
  { name:"ZOHO", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:547 },
  { name:"セールスフォース", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:548 },
  { name:"SAP", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:549 },
  { name:"オラクル", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:550 },
  { name:"アドビ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:551 },
  { name:"ワークス アプリケーションズ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:552 },
  { name:"プロネクサス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:553 },
  { name:"ジーニー", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:554 },
  { name:"アドウェイズ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:555 },
  { name:"DACホールディングス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:556 },
  { name:"VOYAGE GROUP", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:557 },
  { name:"Speee", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:558 },
  { name:"エフルート", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:559 },
  { name:"インタースペース", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:560 },
  { name:"アジャイルメディア・ネットワーク", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:561 },
  { name:"アイレップ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:562 },
  { name:"セプテーニ・ホールディングス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:563 },
  { name:"オプトホールディング", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:564 },
  { name:"オープンエイト", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:565 },
  { name:"フリークアウト", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:566 },
  { name:"アシスト", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:567 },
  { name:"オロ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:568 },
  { name:"ユーザベース", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:569 },
  { name:"JBCC", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:570 },
  { name:"JBS", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:571 },
  { name:"クニエ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:572 },
  { name:"Diquest", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:573 },
  { name:"Ridge-i", group:"IT・テック", industry:"ソフトウェア", emoji:"💻", sortRank:574 },
  { name:"楽天グループ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:575 },
  { name:"LINEヤフー", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:576 },
  { name:"Zホールディングス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:577 },
  { name:"メルカリ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:578 },
  { name:"DeNA", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:579 },
  { name:"サイバーエージェント", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:580 },
  { name:"リクルートホールディングス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:581 },
  { name:"ZOZO", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:582 },
  { name:"エムスリー", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:583 },
  { name:"クックパッド", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:584 },
  { name:"エニグモ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:585 },
  { name:"スタートトゥデイ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:586 },
  { name:"クラウドワークス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:587 },
  { name:"ランサーズ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:588 },
  { name:"ココナラ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:589 },
  { name:"ベース", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:590 },
  { name:"ミクシィ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:591 },
  { name:"グリー", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:592 },
  { name:"コロプラ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:593 },
  { name:"アカツキ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:594 },
  { name:"エイチーム", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:595 },
  { name:"Klab", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:596 },
  { name:"ガンホー・オンライン・エンターテイメント", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:597 },
  { name:"SHIFT", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:598 },
  { name:"エス・エム・エス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:599 },
  { name:"ビジョナル", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:600 },
  { name:"ビズリーチ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:601 },
  { name:"ユナイテッド", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:602 },
  { name:"ぐるなび", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:603 },
  { name:"食べログ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:604 },
  { name:"カカクコム", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:605 },
  { name:"オリコ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:606 },
  { name:"ぴあ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:607 },
  { name:"ローソンチケット", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:608 },
  { name:"Tマガジン", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:609 },
  { name:"ヤフオク", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:610 },
  { name:"モバオク", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:611 },
  { name:"ZOZOTOWN", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:612 },
  { name:"ZOZOUSED", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:613 },
  { name:"ピクシブ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:614 },
  { name:"ニコニコ動画", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:615 },
  { name:"ドワンゴ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:616 },
  { name:"KADOKAWA", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:617 },
  { name:"ユーチューブ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:618 },
  { name:"TikTok", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:619 },
  { name:"インスタグラム", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:620 },
  { name:"Twitter", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:621 },
  { name:"ペイパル", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:622 },
  { name:"Stripe", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:623 },
  { name:"スマレジ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:624 },
  { name:"Square", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:625 },
  { name:"アマゾンジャパン", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:626 },
  { name:"ネットプロテクションズ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:627 },
  { name:"WiL", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:628 },
  { name:"スパイラル", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:629 },
  { name:"Smarpony", group:"IT・テック", industry:"Web・インターネット", emoji:"💻", sortRank:630 },
  { name:"NTT", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:631 },
  { name:"NTTドコモ", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:632 },
  { name:"KDDI", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:633 },
  { name:"ソフトバンク", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:634 },
  { name:"楽天モバイル", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:635 },
  { name:"沖縄セルラー電話", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:636 },
  { name:"インターネットイニシアティブ", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:637 },
  { name:"ソフトバンクテクノロジー", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:638 },
  { name:"ニフティ", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:639 },
  { name:"BIGLOBE", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:640 },
  { name:"エキサイト", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:641 },
  { name:"USEN-NEXT HOLDINGS", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:642 },
  { name:"スカパーJSATホールディングス", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:643 },
  { name:"ジュピターテレコム", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:644 },
  { name:"ケーブルテレビジョン東京", group:"IT・テック", industry:"通信", emoji:"💻", sortRank:645 },
  { name:"アクセンチュア", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:646 },
  { name:"デロイトトーマツコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:647 },
  { name:"PwCコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:648 },
  { name:"ベイカレント・コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:649 },
  { name:"アビームコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:650 },
  { name:"EYストラテジー・アンド・コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:651 },
  { name:"KPMGコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:652 },
  { name:"ボストン コンサルティング グループ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:653 },
  { name:"マッキンゼー・アンド・カンパニー", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:654 },
  { name:"ベイン・アンド・カンパニー", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:655 },
  { name:"アーサー・ディ・リトル", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:656 },
  { name:"ローランド・ベルガー", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:657 },
  { name:"A.T. カーニー", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:658 },
  { name:"ストラテジー&", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:659 },
  { name:"オリバー・ワイマン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:660 },
  { name:"ATカーニー", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:661 },
  { name:"シグマクシス", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:662 },
  { name:"リブ・コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:663 },
  { name:"リッジラインズ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:664 },
  { name:"フィールドマネージメント", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:665 },
  { name:"コーポレイトディレクション", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:666 },
  { name:"ドリームインキュベータ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:667 },
  { name:"経営共創基盤", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:668 },
  { name:"リクルートマネジメントソリューションズ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:669 },
  { name:"船井総合研究所", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:670 },
  { name:"タナベコンサルティンググループ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:671 },
  { name:"山田コンサルティンググループ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:672 },
  { name:"プライスウォーターハウスクーパース", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:673 },
  { name:"フューチャー", group:"コンサル", industry:"ITコンサル", emoji:"💡", sortRank:674 },
  { name:"JBCCホールディングス", group:"コンサル", industry:"ITコンサル", emoji:"💡", sortRank:675 },
  { name:"ガートナー ジャパン", group:"コンサル", industry:"ITコンサル", emoji:"💡", sortRank:676 },
  { name:"フロスト&サリバン ジャパン", group:"コンサル", industry:"ITコンサル", emoji:"💡", sortRank:677 },
  { name:"三井不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:678 },
  { name:"三菱地所", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:679 },
  { name:"住友不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:680 },
  { name:"東急不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:681 },
  { name:"野村不動産ホールディングス", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:682 },
  { name:"森ビル", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:683 },
  { name:"ヒューリック", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:684 },
  { name:"東京建物", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:685 },
  { name:"オープンハウスグループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:686 },
  { name:"レオパレス21", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:687 },
  { name:"大東建託", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:688 },
  { name:"スターツコーポレーション", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:689 },
  { name:"アパグループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:690 },
  { name:"サンフロンティア不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:691 },
  { name:"プレサンスコーポレーション", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:692 },
  { name:"タカラレーベン", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:693 },
  { name:"フージャースホールディングス", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:694 },
  { name:"シノケングループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:695 },
  { name:"INTERTRUST", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:696 },
  { name:"SREホールディングス", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:697 },
  { name:"リログループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:698 },
  { name:"平和不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:699 },
  { name:"平河ヒューテック", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:700 },
  { name:"東京楽天地", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:701 },
  { name:"京阪神ビルディング", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:702 },
  { name:"近鉄不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:703 },
  { name:"阪急阪神不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:704 },
  { name:"南海不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:705 },
  { name:"ユーシン精機", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:706 },
  { name:"関電不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢", sortRank:707 },
  { name:"大成建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:708 },
  { name:"鹿島建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:709 },
  { name:"清水建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:710 },
  { name:"大林組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:711 },
  { name:"竹中工務店", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:712 },
  { name:"戸田建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:713 },
  { name:"熊谷組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:714 },
  { name:"前田建設工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:715 },
  { name:"西松建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:716 },
  { name:"鴻池組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:717 },
  { name:"奥村組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:718 },
  { name:"鉄建建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:719 },
  { name:"東鉄工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:720 },
  { name:"錢高組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:721 },
  { name:"東洋建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:722 },
  { name:"佐藤工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:723 },
  { name:"長谷工コーポレーション", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:724 },
  { name:"木下グループ", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:725 },
  { name:"三井住友建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:726 },
  { name:"東急建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:727 },
  { name:"JR西日本テクノス", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:728 },
  { name:"住友林業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:729 },
  { name:"積水ハウス", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:730 },
  { name:"大和ハウス工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:731 },
  { name:"ミサワホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:732 },
  { name:"旭化成ホームズ", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:733 },
  { name:"三井ホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:734 },
  { name:"トヨタホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:735 },
  { name:"タマホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:736 },
  { name:"アキュラホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:737 },
  { name:"オープンハウス", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:738 },
  { name:"建築工房零", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:739 },
  { name:"コタ", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢", sortRank:740 },
  { name:"セブン&アイ・ホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:741 },
  { name:"イオン", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:742 },
  { name:"ファーストリテイリング", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:743 },
  { name:"ニトリホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:744 },
  { name:"良品計画", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:745 },
  { name:"三越伊勢丹ホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:746 },
  { name:"高島屋", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:747 },
  { name:"大丸松坂屋百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:748 },
  { name:"Jフロント リテイリング", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:749 },
  { name:"H2Oリテイリング", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:750 },
  { name:"近鉄百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:751 },
  { name:"松屋", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:752 },
  { name:"東急百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:753 },
  { name:"小田急百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:754 },
  { name:"西武百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:755 },
  { name:"そごう", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:756 },
  { name:"コクミン", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:757 },
  { name:"ココカラファイン", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:758 },
  { name:"スギ薬局", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:759 },
  { name:"マツモトキヨシ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:760 },
  { name:"ツルハホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:761 },
  { name:"ウエルシアホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:762 },
  { name:"コスモス薬品", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:763 },
  { name:"クスリのアオキ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:764 },
  { name:"ドラッグストアマツモトキヨシ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:765 },
  { name:"ヤマダホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:766 },
  { name:"ビックカメラ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:767 },
  { name:"ヨドバシカメラ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:768 },
  { name:"ノジマ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:769 },
  { name:"ケーズホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:770 },
  { name:"エディオン", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:771 },
  { name:"上新電機", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:772 },
  { name:"コジマ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:773 },
  { name:"ベスト電器", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:774 },
  { name:"ヨドバシ・ドット・コム", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:775 },
  { name:"Amazon", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:776 },
  { name:"楽天市場", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:777 },
  { name:"Yahoo!ショッピング", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:778 },
  { name:"BUYMA", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:779 },
  { name:"ZARA", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:780 },
  { name:"H&M", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:781 },
  { name:"GAP", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:782 },
  { name:"UNIQLO", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:783 },
  { name:"しまむら", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:784 },
  { name:"西松屋チェーン", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:785 },
  { name:"アダストリア", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:786 },
  { name:"ユナイテッドアローズ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:787 },
  { name:"ビームス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:788 },
  { name:"シップス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:789 },
  { name:"オンワードホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:790 },
  { name:"ワールド", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:791 },
  { name:"TSI ホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:792 },
  { name:"ストライプインターナショナル", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:793 },
  { name:"ハニーズホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:794 },
  { name:"ABCマート", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:795 },
  { name:"チヨダ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:796 },
  { name:"エービーシー・マート", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:797 },
  { name:"ジーフット", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:798 },
  { name:"ヒラキ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:799 },
  { name:"オアシスライフスタイルグループ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:800 },
  { name:"コナカ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:801 },
  { name:"AOKIホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:802 },
  { name:"青山商事", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:803 },
  { name:"はるやまホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:804 },
  { name:"タカキュー", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:805 },
  { name:"アスクル", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:806 },
  { name:"ロハコ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:807 },
  { name:"モノタロウ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:808 },
  { name:"ミスミ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:809 },
  { name:"コクヨマーケティング", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:810 },
  { name:"アイリスプラザ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:811 },
  { name:"ヨーカドー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:812 },
  { name:"ライフコーポレーション", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:813 },
  { name:"ロピア", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:814 },
  { name:"オーケー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:815 },
  { name:"サミット", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:816 },
  { name:"成城石井", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:817 },
  { name:"紀ノ国屋", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:818 },
  { name:"クイーンズ伊勢丹", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:819 },
  { name:"ヤオコー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:820 },
  { name:"ベルク", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:821 },
  { name:"マルエツ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:822 },
  { name:"東急ストア", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:823 },
  { name:"東武ストア", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:824 },
  { name:"小田急OX", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:825 },
  { name:"ライフ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:826 },
  { name:"ダイエー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:827 },
  { name:"西友", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:828 },
  { name:"平和堂", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:829 },
  { name:"アークス", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:830 },
  { name:"アクシアル リテイリング", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:831 },
  { name:"ヤマナカ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:832 },
  { name:"ハローズ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:833 },
  { name:"イズミ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:834 },
  { name:"フジ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:835 },
  { name:"コープこうべ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:836 },
  { name:"ユーコープ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:837 },
  { name:"コープみらい", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒", sortRank:838 },
  { name:"ベルーナ", group:"小売・流通", industry:"EC・通販", emoji:"🛒", sortRank:839 },
  { name:"ニッセン・ホールディングス", group:"小売・流通", industry:"EC・通販", emoji:"🛒", sortRank:840 },
  { name:"千趣会", group:"小売・流通", industry:"EC・通販", emoji:"🛒", sortRank:841 },
  { name:"スターゼン", group:"小売・流通", industry:"EC・通販", emoji:"🛒", sortRank:842 },
  { name:"オイシックス・ラ・大地", group:"小売・流通", industry:"EC・通販", emoji:"🛒", sortRank:843 },
  { name:"日本郵船", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:844 },
  { name:"商船三井", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:845 },
  { name:"川崎汽船", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:846 },
  { name:"NSユナイテッド海運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:847 },
  { name:"飯野海運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:848 },
  { name:"明治海運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:849 },
  { name:"東京汽船", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:850 },
  { name:"名村造船所", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:851 },
  { name:"ヤマトホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:852 },
  { name:"SGホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:853 },
  { name:"佐川急便", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:854 },
  { name:"日本通運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:855 },
  { name:"NIPPON EXPRESSホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:856 },
  { name:"近鉄エクスプレス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:857 },
  { name:"上組", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:858 },
  { name:"三井倉庫ホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:859 },
  { name:"住友倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:860 },
  { name:"三菱倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:861 },
  { name:"澁澤倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:862 },
  { name:"安田倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:863 },
  { name:"日本梱包運輸倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:864 },
  { name:"C&Fロジホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:865 },
  { name:"セイノーホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:866 },
  { name:"セイノー", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:867 },
  { name:"福山通運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:868 },
  { name:"トナミホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:869 },
  { name:"ハマキョウレックス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:870 },
  { name:"センコーグループホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:871 },
  { name:"鴻池運輸", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:872 },
  { name:"関西エアポート", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:873 },
  { name:"成田国際空港", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:874 },
  { name:"羽田空港ターミナルサービス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:875 },
  { name:"JR貨物", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:876 },
  { name:"JFEエンジニアリング", group:"小売・流通", industry:"物流・運輸", emoji:"🛒", sortRank:877 },
  { name:"リクルート", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:878 },
  { name:"パーソルホールディングス", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:879 },
  { name:"パソナグループ", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:880 },
  { name:"エン・ジャパン", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:881 },
  { name:"マイナビ", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:882 },
  { name:"ディップ", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:883 },
  { name:"レバレジーズ", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:884 },
  { name:"インフォマート", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:885 },
  { name:"クイック", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:886 },
  { name:"JAC Recruitment", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:887 },
  { name:"ヒューマンホールディングス", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:888 },
  { name:"ニッソーネット", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:889 },
  { name:"アウトソーシング", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:890 },
  { name:"キャリアデザインセンター", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:891 },
  { name:"UTグループ", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:892 },
  { name:"アヴァンティスタッフ", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:893 },
  { name:"ヒトコム", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:894 },
  { name:"アイデムホールディングス", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:895 },
  { name:"アクセス・ジャパン", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:896 },
  { name:"ウィルグループ", group:"サービス", industry:"人材・派遣", emoji:"📢", sortRank:897 },
  { name:"電通グループ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:898 },
  { name:"博報堂DYホールディングス", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:899 },
  { name:"ADKホールディングス", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:900 },
  { name:"東急エージェンシー", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:901 },
  { name:"デルフィス", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:902 },
  { name:"DAサーチ&リンク", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:903 },
  { name:"ジェイアール東日本企画", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:904 },
  { name:"読売広告社", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:905 },
  { name:"アサツー ディ・ケイ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:906 },
  { name:"ベクトル", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:907 },
  { name:"プラップジャパン", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:908 },
  { name:"共同ピーアール", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:909 },
  { name:"電通PR", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:910 },
  { name:"オズマピーアール", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:911 },
  { name:"朝日新聞社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:912 },
  { name:"読売新聞社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:913 },
  { name:"毎日新聞社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:914 },
  { name:"産業経済新聞社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:915 },
  { name:"日本経済新聞社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:916 },
  { name:"共同通信社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:917 },
  { name:"時事通信社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:918 },
  { name:"NHK", group:"サービス", industry:"メディア", emoji:"📢", sortRank:919 },
  { name:"日本テレビホールディングス", group:"サービス", industry:"メディア", emoji:"📢", sortRank:920 },
  { name:"TBSホールディングス", group:"サービス", industry:"メディア", emoji:"📢", sortRank:921 },
  { name:"フジ・メディア・ホールディングス", group:"サービス", industry:"メディア", emoji:"📢", sortRank:922 },
  { name:"テレビ朝日ホールディングス", group:"サービス", industry:"メディア", emoji:"📢", sortRank:923 },
  { name:"テレビ東京ホールディングス", group:"サービス", industry:"メディア", emoji:"📢", sortRank:924 },
  { name:"WOWOW", group:"サービス", industry:"メディア", emoji:"📢", sortRank:925 },
  { name:"スカパーJSAT", group:"サービス", industry:"メディア", emoji:"📢", sortRank:926 },
  { name:"TOKYO MX", group:"サービス", industry:"メディア", emoji:"📢", sortRank:927 },
  { name:"毎日放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:928 },
  { name:"朝日放送グループホールディングス", group:"サービス", industry:"メディア", emoji:"📢", sortRank:929 },
  { name:"関西テレビ放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:930 },
  { name:"読売テレビ放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:931 },
  { name:"東海テレビ放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:932 },
  { name:"中部日本放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:933 },
  { name:"北海道放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:934 },
  { name:"東北放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:935 },
  { name:"RKB毎日放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:936 },
  { name:"琉球放送", group:"サービス", industry:"メディア", emoji:"📢", sortRank:937 },
  { name:"琉球新報社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:938 },
  { name:"沖縄タイムス社", group:"サービス", industry:"メディア", emoji:"📢", sortRank:939 },
  { name:"日本マクドナルドホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:940 },
  { name:"ゼンショーホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:941 },
  { name:"コロワイド", group:"サービス", industry:"外食", emoji:"📢", sortRank:942 },
  { name:"くら寿司", group:"サービス", industry:"外食", emoji:"📢", sortRank:943 },
  { name:"スシロー", group:"サービス", industry:"外食", emoji:"📢", sortRank:944 },
  { name:"FOOD&LIFE COMPANIES", group:"サービス", industry:"外食", emoji:"📢", sortRank:945 },
  { name:"王将フードサービス", group:"サービス", industry:"外食", emoji:"📢", sortRank:946 },
  { name:"松屋フーズホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:947 },
  { name:"吉野家ホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:948 },
  { name:"ロイヤルホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:949 },
  { name:"ロッテリア", group:"サービス", industry:"外食", emoji:"📢", sortRank:950 },
  { name:"モスフードサービス", group:"サービス", industry:"外食", emoji:"📢", sortRank:951 },
  { name:"ドトール・日レスホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:952 },
  { name:"スターバックスコーヒージャパン", group:"サービス", industry:"外食", emoji:"📢", sortRank:953 },
  { name:"タリーズコーヒージャパン", group:"サービス", industry:"外食", emoji:"📢", sortRank:954 },
  { name:"プロント コーポレーション", group:"サービス", industry:"外食", emoji:"📢", sortRank:955 },
  { name:"コメダ", group:"サービス", industry:"外食", emoji:"📢", sortRank:956 },
  { name:"ピザハット", group:"サービス", industry:"外食", emoji:"📢", sortRank:957 },
  { name:"ピザーラ", group:"サービス", industry:"外食", emoji:"📢", sortRank:958 },
  { name:"ドミノ・ピザ", group:"サービス", industry:"外食", emoji:"📢", sortRank:959 },
  { name:"フォーシーズ", group:"サービス", industry:"外食", emoji:"📢", sortRank:960 },
  { name:"クリエイト・レストランツ・ホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:961 },
  { name:"ワタミ", group:"サービス", industry:"外食", emoji:"📢", sortRank:962 },
  { name:"チムニー", group:"サービス", industry:"外食", emoji:"📢", sortRank:963 },
  { name:"ダイヤモンドダイニング", group:"サービス", industry:"外食", emoji:"📢", sortRank:964 },
  { name:"エスエルディー", group:"サービス", industry:"外食", emoji:"📢", sortRank:965 },
  { name:"和民", group:"サービス", industry:"外食", emoji:"📢", sortRank:966 },
  { name:"モンテローザ", group:"サービス", industry:"外食", emoji:"📢", sortRank:967 },
  { name:"金の蔵", group:"サービス", industry:"外食", emoji:"📢", sortRank:968 },
  { name:"白木屋", group:"サービス", industry:"外食", emoji:"📢", sortRank:969 },
  { name:"笑笑", group:"サービス", industry:"外食", emoji:"📢", sortRank:970 },
  { name:"ハイデイ日高", group:"サービス", industry:"外食", emoji:"📢", sortRank:971 },
  { name:"リンガーハット", group:"サービス", industry:"外食", emoji:"📢", sortRank:972 },
  { name:"幸楽苑ホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:973 },
  { name:"物語コーポレーション", group:"サービス", industry:"外食", emoji:"📢", sortRank:974 },
  { name:"あみやき亭", group:"サービス", industry:"外食", emoji:"📢", sortRank:975 },
  { name:"木曽路", group:"サービス", industry:"外食", emoji:"📢", sortRank:976 },
  { name:"アークランドサービスホールディングス", group:"サービス", industry:"外食", emoji:"📢", sortRank:977 },
  { name:"サイゼリヤ", group:"サービス", industry:"外食", emoji:"📢", sortRank:978 },
  { name:"フジオフードグループ本社", group:"サービス", industry:"外食", emoji:"📢", sortRank:979 },
  { name:"ジョイフル", group:"サービス", industry:"外食", emoji:"📢", sortRank:980 },
  { name:"ガスト", group:"サービス", industry:"外食", emoji:"📢", sortRank:981 },
  { name:"バーミヤン", group:"サービス", industry:"外食", emoji:"📢", sortRank:982 },
  { name:"ジョナサン", group:"サービス", industry:"外食", emoji:"📢", sortRank:983 },
  { name:"カフェ・ベローチェ", group:"サービス", industry:"外食", emoji:"📢", sortRank:984 },
  { name:"エクセルシオール カフェ", group:"サービス", industry:"外食", emoji:"📢", sortRank:985 },
  { name:"プロント", group:"サービス", industry:"外食", emoji:"📢", sortRank:986 },
  { name:"タリーズ", group:"サービス", industry:"外食", emoji:"📢", sortRank:987 },
  { name:"スタバ", group:"サービス", industry:"外食", emoji:"📢", sortRank:988 },
  { name:"コメダ珈琲店", group:"サービス", industry:"外食", emoji:"📢", sortRank:989 },
  { name:"コーヒーチェーン", group:"サービス", industry:"外食", emoji:"📢", sortRank:990 },
  { name:"ロイヤルホスト", group:"サービス", industry:"外食", emoji:"📢", sortRank:991 },
  { name:"びっくりドンキー", group:"サービス", industry:"外食", emoji:"📢", sortRank:992 },
  { name:"ステーキガスト", group:"サービス", industry:"外食", emoji:"📢", sortRank:993 },
  { name:"SMS", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:994 },
  { name:"アイビー化粧品", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:995 },
  { name:"ファンケル", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:996 },
  { name:"DHC", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:997 },
  { name:"ノエビアホールディングス", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:998 },
  { name:"ポーラ", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:999 },
  { name:"オルビス", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:1000 },
  { name:"アルビオン", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:1001 },
  { name:"カネボウ化粧品", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:1002 },
  { name:"アクセーヌ", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:1003 },
  { name:"クラブコスメチックス", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:1004 },
  { name:"シャネル", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:1005 },
  { name:"ディオール", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥", sortRank:1006 },
  { name:"ベネッセホールディングス", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1007 },
  { name:"学研ホールディングス", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1008 },
  { name:"ナガセ", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1009 },
  { name:"東進ハイスクール", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1010 },
  { name:"河合塾", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1011 },
  { name:"駿台予備学校", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1012 },
  { name:"代々木ゼミナール", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1013 },
  { name:"Z会", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1014 },
  { name:"早稲田アカデミー", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1015 },
  { name:"臨海セミナー", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1016 },
  { name:"TAC", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1017 },
  { name:"資格の大原", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1018 },
  { name:"LEC東京リーガルマインド", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1019 },
  { name:"ECC", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1020 },
  { name:"ベルリッツ", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1021 },
  { name:"ステップ", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1022 },
  { name:"明光ネットワークジャパン", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1023 },
  { name:"リソー教育", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1024 },
  { name:"幼児活動研究会", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1025 },
  { name:"ヒューマンアカデミー", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1026 },
  { name:"シナジア・キャピタル", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1027 },
  { name:"リクルート(スタディサプリ)", group:"教育・公共", industry:"学校・予備校", emoji:"📚", sortRank:1028 },
  { name:"バンダイナムコホールディングス", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1029 },
  { name:"任天堂", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1030 },
  { name:"カプコン", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1031 },
  { name:"コナミグループ", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1032 },
  { name:"スクウェア・エニックス・ホールディングス", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1033 },
  { name:"コーエーテクモホールディングス", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1034 },
  { name:"KLab", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1035 },
  { name:"Aiming", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1036 },
  { name:"gumi", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1037 },
  { name:"フジ・スタートアップ・ベンチャーズ", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1038 },
  { name:"ソニー・インタラクティブエンタテインメント", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1039 },
  { name:"マイクロソフト", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1040 },
  { name:"エレクトロニック・アーツ", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1041 },
  { name:"ユービーアイソフト", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1042 },
  { name:"ブリザード", group:"エンタメ", industry:"ゲーム", emoji:"🎮", sortRank:1043 },
  { name:"東宝", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1044 },
  { name:"東映", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1045 },
  { name:"松竹", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1046 },
  { name:"角川映画", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1047 },
  { name:"ワーナー ブラザース", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1048 },
  { name:"ディズニー", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1049 },
  { name:"ジブリ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1050 },
  { name:"ソニー・ミュージックエンタテインメント", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1051 },
  { name:"エイベックス", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1052 },
  { name:"ユニバーサル ミュージック", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1053 },
  { name:"ワーナーミュージック・ジャパン", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1054 },
  { name:"アミューズ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1055 },
  { name:"ホリプロ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1056 },
  { name:"研音", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1057 },
  { name:"スターダストプロモーション", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1058 },
  { name:"太田プロダクション", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1059 },
  { name:"吉本興業", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1060 },
  { name:"松竹芸能", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1061 },
  { name:"ナベプロ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮", sortRank:1062 },
  { name:"講談社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1063 },
  { name:"集英社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1064 },
  { name:"小学館", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1065 },
  { name:"新潮社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1066 },
  { name:"文藝春秋", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1067 },
  { name:"幻冬舎", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1068 },
  { name:"早川書房", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1069 },
  { name:"東洋経済新報社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1070 },
  { name:"ダイヤモンド社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1071 },
  { name:"プレジデント社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1072 },
  { name:"日経BP", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1073 },
  { name:"日本経済新聞出版", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1074 },
  { name:"日経BPマーケティング", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1075 },
  { name:"ベネッセコーポレーション", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1076 },
  { name:"学研プラス", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1077 },
  { name:"旺文社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1078 },
  { name:"河出書房新社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1079 },
  { name:"岩波書店", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1080 },
  { name:"三省堂", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1081 },
  { name:"学研ステイフル", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1082 },
  { name:"主婦の友社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1083 },
  { name:"主婦と生活社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1084 },
  { name:"光文社", group:"エンタメ", industry:"出版", emoji:"🎮", sortRank:1085 },
  { name:"ANAホールディングス", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1086 },
  { name:"日本航空", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1087 },
  { name:"スカイマーク", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1088 },
  { name:"Peach Aviation", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1089 },
  { name:"ジェットスター・ジャパン", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1090 },
  { name:"春秋航空日本", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1091 },
  { name:"AIRDO", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1092 },
  { name:"ソラシドエア", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1093 },
  { name:"スターフライヤー", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1094 },
  { name:"アイベックスエアラインズ", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1095 },
  { name:"フジドリームエアラインズ", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1096 },
  { name:"オリエンタルエアブリッジ", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1097 },
  { name:"新中央航空", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1098 },
  { name:"天草エアライン", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1099 },
  { name:"琉球エアーコミューター", group:"航空", industry:"航空会社", emoji:"✈️", sortRank:1100 },
  { name:"JR東日本", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1101 },
  { name:"JR東海", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1102 },
  { name:"JR西日本", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1103 },
  { name:"JR北海道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1104 },
  { name:"JR九州", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1105 },
  { name:"JR四国", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1106 },
  { name:"東京地下鉄(東京メトロ)", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1107 },
  { name:"東京都交通局", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1108 },
  { name:"小田急電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1109 },
  { name:"東急電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1110 },
  { name:"京王電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1111 },
  { name:"京急電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1112 },
  { name:"京成電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1113 },
  { name:"京浜急行電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1114 },
  { name:"西武鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1115 },
  { name:"東武鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1116 },
  { name:"名古屋鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1117 },
  { name:"近鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1118 },
  { name:"南海電気鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1119 },
  { name:"阪急電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1120 },
  { name:"阪神電気鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1121 },
  { name:"京阪電気鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1122 },
  { name:"西日本鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1123 },
  { name:"新京成電鉄", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1124 },
  { name:"北総鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1125 },
  { name:"相模鉄道", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1126 },
  { name:"横浜市交通局", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1127 },
  { name:"名古屋市交通局", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1128 },
  { name:"大阪市高速電気軌道(Osaka Metro)", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1129 },
  { name:"京都市交通局", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1130 },
  { name:"札幌市交通局", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1131 },
  { name:"仙台市交通局", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1132 },
  { name:"九州旅客鉄道(JR九州)", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1133 },
  { name:"小田急バス", group:"交通・運輸", industry:"鉄道", emoji:"🚄", sortRank:1134 },
  { name:"JR東日本バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1135 },
  { name:"JRバス関東", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1136 },
  { name:"京王電鉄バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1137 },
  { name:"京急バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1138 },
  { name:"京成バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1139 },
  { name:"東急バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1140 },
  { name:"西武バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1141 },
  { name:"東武バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1142 },
  { name:"西鉄バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1143 },
  { name:"近鉄バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1144 },
  { name:"阪急バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1145 },
  { name:"南海バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1146 },
  { name:"京阪バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1147 },
  { name:"名鉄バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1148 },
  { name:"千葉中央バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1149 },
  { name:"関東バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1150 },
  { name:"横浜市営バス", group:"交通・運輸", industry:"バス", emoji:"🚄", sortRank:1151 },
  { name:"ゴールドマン・サックス証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1152 },
  { name:"モルガン・スタンレーMUFG証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1153 },
  { name:"JPモルガン証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1154 },
  { name:"メリルリンチ日本証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1155 },
  { name:"バンク・オブ・アメリカ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1156 },
  { name:"シティグループ証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1157 },
  { name:"UBS証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1158 },
  { name:"ドイツ証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1159 },
  { name:"クレディ・スイス証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1160 },
  { name:"バークレイズ証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1161 },
  { name:"BNPパリバ証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1162 },
  { name:"HSBC証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1163 },
  { name:"ジェフリーズ証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1164 },
  { name:"ナティクシス・ジャパン証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1165 },
  { name:"ソシエテジェネラル証券", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1166 },
  { name:"ノムラ・インターナショナル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1167 },
  { name:"Citadel Securities Japan", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1168 },
  { name:"ジェーン・ストリート", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1169 },
  { name:"オプティバー", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1170 },
  { name:"Two Sigma", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1171 },
  { name:"ブラックロック・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1172 },
  { name:"ステート・ストリート信託銀行", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1173 },
  { name:"ヴァンガード・インベストメンツ・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1174 },
  { name:"JPモルガン・アセット・マネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1175 },
  { name:"フィデリティ投信", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1176 },
  { name:"ピムコジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1177 },
  { name:"ピクテ・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1178 },
  { name:"アライアンス・バーンスタイン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1179 },
  { name:"ウエリントン・マネージメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1180 },
  { name:"インベスコ・アセット・マネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1181 },
  { name:"シュローダー・インベストメント・マネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1182 },
  { name:"ニューバーガー・バーマン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1183 },
  { name:"アムンディ・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1184 },
  { name:"アクサ・インベストメント・マネージャーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1185 },
  { name:"ニューヨーク・ライフ・インベストメンツ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1186 },
  { name:"ニッセイアセットマネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1187 },
  { name:"三菱UFJアセットマネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1188 },
  { name:"野村アセットマネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1189 },
  { name:"大和アセットマネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1190 },
  { name:"三井住友DSアセットマネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1191 },
  { name:"アセットマネジメントOne", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1192 },
  { name:"カーライル・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1193 },
  { name:"KKRジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1194 },
  { name:"ベインキャピタル・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1195 },
  { name:"アドベント・インターナショナル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1196 },
  { name:"TPGキャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1197 },
  { name:"CVCキャピタルパートナーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1198 },
  { name:"ブラックストーン・グループ・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1199 },
  { name:"アポロ・グローバル・マネジメント", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1200 },
  { name:"ローンスター", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1201 },
  { name:"ジャパン・インダストリアル・パートナーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1202 },
  { name:"アント・キャピタル・パートナーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1203 },
  { name:"アドバンテッジパートナーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1204 },
  { name:"MBKパートナーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1205 },
  { name:"ユニゾン・キャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1206 },
  { name:"インテグラル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1207 },
  { name:"ニューホライズンキャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1208 },
  { name:"ポラリス・キャピタル・グループ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1209 },
  { name:"丸の内キャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1210 },
  { name:"日本産業パートナーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1211 },
  { name:"産業革新投資機構", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1212 },
  { name:"DBJキャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1213 },
  { name:"三菱UFJキャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1214 },
  { name:"SMBCベンチャーキャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1215 },
  { name:"みずほキャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1216 },
  { name:"グロービス・キャピタル・パートナーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1217 },
  { name:"JAFCO", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1218 },
  { name:"コーラルキャピタル", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1219 },
  { name:"DCMベンチャーズ", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1220 },
  { name:"セコイア・ジャパン", group:"金融・銀行", industry:"外資系金融", emoji:"🏦", sortRank:1221 },
  { name:"有限責任あずさ監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1222 },
  { name:"EY新日本有限責任監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1223 },
  { name:"有限責任監査法人トーマツ", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1224 },
  { name:"PwC Japan有限責任監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1225 },
  { name:"PwC あらた有限責任監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1226 },
  { name:"BDO三優監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1227 },
  { name:"太陽有限責任監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1228 },
  { name:"RSM清和監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1229 },
  { name:"仰星監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1230 },
  { name:"監査法人A&Aパートナーズ", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1231 },
  { name:"東陽監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1232 },
  { name:"応用監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1233 },
  { name:"アーク有限責任監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1234 },
  { name:"大手前監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1235 },
  { name:"明治監査法人", group:"コンサル", industry:"監査法人", emoji:"💡", sortRank:1236 },
  { name:"KPMG税理士法人", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1237 },
  { name:"EY税理士法人", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1238 },
  { name:"デロイト トーマツ税理士法人", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1239 },
  { name:"PwC税理士法人", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1240 },
  { name:"ベーカー&マッケンジー外国法事務弁護士事務所", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1241 },
  { name:"税理士法人山田&パートナーズ", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1242 },
  { name:"辻・本郷税理士法人", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1243 },
  { name:"アクタス税理士法人", group:"コンサル", industry:"税理士法人", emoji:"💡", sortRank:1244 },
  { name:"西村あさひ法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1245 },
  { name:"森・濱田松本法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1246 },
  { name:"アンダーソン・毛利・友常法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1247 },
  { name:"長島・大野・常松法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1248 },
  { name:"TMI総合法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1249 },
  { name:"ベーカー&マッケンジー法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1250 },
  { name:"ホワイト&ケース法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1251 },
  { name:"ラサール法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1252 },
  { name:"ジョーンズ・デイ法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1253 },
  { name:"シャーマン・アンド・スターリング外国法共同事業法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1254 },
  { name:"デービス・ポーク・アンド・ウォードウェル法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1255 },
  { name:"クリフォード・チャンス法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1256 },
  { name:"シティ・ユーワ法律事務所", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1257 },
  { name:"渥美坂井法律事務所・外国法共同事業", group:"コンサル", industry:"法律事務所", emoji:"💡", sortRank:1258 },
  { name:"マッキンゼー・アンド・カンパニー・ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1259 },
  { name:"ボストン コンサルティング グループ ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1260 },
  { name:"ベイン・アンド・カンパニー・ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1261 },
  { name:"A.T. カーニー ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1262 },
  { name:"アーサー・D・リトル・ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1263 },
  { name:"ローランド・ベルガー・ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1264 },
  { name:"オリバー・ワイマン・ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1265 },
  { name:"ストラテジーアンド", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1266 },
  { name:"L.E.K.コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1267 },
  { name:"ZSアソシエイツ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1268 },
  { name:"Strategy& (PwC)", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1269 },
  { name:"EYパルテノン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1270 },
  { name:"コーン・フェリー", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1271 },
  { name:"ヘイ・グループ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1272 },
  { name:"マーサー・ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1273 },
  { name:"ウイリス・タワーズワトソン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1274 },
  { name:"エーオン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1275 },
  { name:"ガートナー・ジャパン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1276 },
  { name:"IDC Japan", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1277 },
  { name:"フロスト&サリバン", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1278 },
  { name:"アクセンチュア・ストラテジー", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1279 },
  { name:"シグマクシス・ホールディングス", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1280 },
  { name:"AGSコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1281 },
  { name:"コーポレイト ディレクション", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1282 },
  { name:"タナベコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1283 },
  { name:"山田ビジネスコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1284 },
  { name:"識学", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1285 },
  { name:"プロレド・パートナーズ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1286 },
  { name:"野村総合研究所(コンサル部門)", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1287 },
  { name:"三菱総合研究所", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1288 },
  { name:"三菱UFJリサーチ&コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1289 },
  { name:"みずほリサーチ&テクノロジーズ", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1290 },
  { name:"日本総合研究所", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1291 },
  { name:"大和総研", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1292 },
  { name:"電通総研", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1293 },
  { name:"NTTデータ経営研究所", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1294 },
  { name:"NRIサイバーパテント", group:"コンサル", industry:"経営コンサル", emoji:"💡", sortRank:1295 },
  { name:"Google合同会社", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1296 },
  { name:"アマゾン ウェブ サービス ジャパン", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1297 },
  { name:"Amazon Japan合同会社", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1298 },
  { name:"メタ・プラットフォームズ ジャパン", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1299 },
  { name:"アップル ジャパン", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1300 },
  { name:"日本マイクロソフト", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1301 },
  { name:"Salesforce Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1302 },
  { name:"Oracle Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1303 },
  { name:"SAP Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1304 },
  { name:"アドビ システムズ", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1305 },
  { name:"ServiceNow Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1306 },
  { name:"Workday Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1307 },
  { name:"シスコシステムズ合同会社", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1308 },
  { name:"VMware Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1309 },
  { name:"デル・テクノロジーズ", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1310 },
  { name:"ヒューレット・パッカード ジャパン", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1311 },
  { name:"IBM Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1312 },
  { name:"EMCジャパン", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1313 },
  { name:"ZScaler Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1314 },
  { name:"Palo Alto Networks Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1315 },
  { name:"CrowdStrike Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1316 },
  { name:"Splunk Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1317 },
  { name:"Datadog Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1318 },
  { name:"MongoDB Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1319 },
  { name:"Confluent Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1320 },
  { name:"Snowflake合同会社", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1321 },
  { name:"Databricks Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1322 },
  { name:"GitHub Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1323 },
  { name:"GitLab Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1324 },
  { name:"Atlassian Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1325 },
  { name:"Slack Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1326 },
  { name:"Zoom Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1327 },
  { name:"Box Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1328 },
  { name:"Dropbox Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1329 },
  { name:"Stripe Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1330 },
  { name:"Square Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1331 },
  { name:"PayPal Pte. Ltd.", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1332 },
  { name:"Coinbase Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1333 },
  { name:"Tesla Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1334 },
  { name:"OpenAI Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1335 },
  { name:"Anthropic Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1336 },
  { name:"Hugging Face", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1337 },
  { name:"NVIDIA Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1338 },
  { name:"AMD Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1339 },
  { name:"Intel Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1340 },
  { name:"Qualcomm Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1341 },
  { name:"Arm Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1342 },
  { name:"TSMC Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1343 },
  { name:"Bloomberg L.P.", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1344 },
  { name:"Refinitiv Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1345 },
  { name:"S&P Global Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1346 },
  { name:"Moody's Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1347 },
  { name:"FactSet Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1348 },
  { name:"MSCI Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1349 },
  { name:"ICE Japan", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1350 },
  { name:"ナレッジソサエティ", group:"IT・テック", industry:"外資IT", emoji:"💻", sortRank:1351 },
  { name:"WPP Japan", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1352 },
  { name:"オムニコム ジャパン", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1353 },
  { name:"ピュブリシスグループ・ジャパン", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1354 },
  { name:"デンツウ・グループ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1355 },
  { name:"サイバー・コミュニケーションズ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1356 },
  { name:"アサツーディ・ケイ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1357 },
  { name:"イニシアティブ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1358 },
  { name:"オプト", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1359 },
  { name:"メンバーズ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1360 },
  { name:"GMOアドパートナーズ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1361 },
  { name:"ジオロジック", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1362 },
  { name:"電通デジタル", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1363 },
  { name:"博報堂DYメディアパートナーズ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1364 },
  { name:"日経BP社", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1365 },
  { name:"リクルートメディアコミュニケーションズ", group:"サービス", industry:"広告・PR", emoji:"📢", sortRank:1366 },
  { name:"ナガセ(東進)", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1367 },
  { name:"リクルートマーケティングパートナーズ(スタディサプリ)", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1368 },
  { name:"ベルリッツ・ジャパン", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1369 },
  { name:"GABA", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1370 },
  { name:"イーオン", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1371 },
  { name:"シェーン英会話", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1372 },
  { name:"アゴス・ジャパン", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1373 },
  { name:"プログリット", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1374 },
  { name:"TORAIZ", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1375 },
  { name:"DMM英会話", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1376 },
  { name:"レアジョブ", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1377 },
  { name:"ネイティブキャンプ", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1378 },
  { name:"ビザビ", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1379 },
  { name:"ECCジュニア", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1380 },
  { name:"公文教育研究会", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1381 },
  { name:"学研教室", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1382 },
  { name:"栄光ゼミナール", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1383 },
  { name:"市進学院", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1384 },
  { name:"京進", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1385 },
  { name:"誠文堂新光社", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1386 },
  { name:"ZUU", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1387 },
  { name:"Schoo", group:"教育・公共", industry:"人材・学校", emoji:"📚", sortRank:1388 },
  { name:"弁護士ドットコム", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1389 },
  { name:"メドピア", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1390 },
  { name:"PR TIMES", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1391 },
  { name:"オープンドア(トラベルコ)", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1392 },
  { name:"じげん", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1393 },
  { name:"MIXI", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1394 },
  { name:"ラクサス", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1395 },
  { name:"メルペイ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1396 },
  { name:"atama plus", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1397 },
  { name:"エクサウィザーズ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1398 },
  { name:"FastDOCTOR", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1399 },
  { name:"カケハシ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1400 },
  { name:"Ubie", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1401 },
  { name:"Smartround", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1402 },
  { name:"10X", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1403 },
  { name:"LayerX", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1404 },
  { name:"MNTSQ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1405 },
  { name:"ウェルスナビ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1406 },
  { name:"FOLIO", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1407 },
  { name:"クラウドクレジット", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1408 },
  { name:"SBIインベストメント", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1409 },
  { name:"ファインデックス", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1410 },
  { name:"ニューラルポケット", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1411 },
  { name:"PKSHA Technology", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1412 },
  { name:"Hmcomm", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1413 },
  { name:"ABEJA", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1414 },
  { name:"ストックマーク", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1415 },
  { name:"プレイド", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1416 },
  { name:"Kaizen Platform", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1417 },
  { name:"ヤプリ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1418 },
  { name:"AnyMind Group", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1419 },
  { name:"Magic Moment", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1420 },
  { name:"SmartHR", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1421 },
  { name:"カミナシ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1422 },
  { name:"ROUTE06", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1423 },
  { name:"Algomatic", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1424 },
  { name:"アンドパッド", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1425 },
  { name:"Visional", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1426 },
  { name:"GMOペパボ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1427 },
  { name:"GMOグローバルサインHD", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1428 },
  { name:"GMOペイメントゲートウェイ", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1429 },
  { name:"GMOクラウド", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1430 },
  { name:"ABCash Technologies", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1431 },
  { name:"MoneyForward X", group:"IT・テック", industry:"スタートアップ", emoji:"💻", sortRank:1432 },
  { name:"JX金属", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1433 },
  { name:"JOGMEC", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1434 },
  { name:"INPEX", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1435 },
  { name:"石油資源開発", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1436 },
  { name:"ENEOSホールディングス", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1437 },
  { name:"出光興産", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1438 },
  { name:"コスモエネルギーホールディングス", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1439 },
  { name:"東京ガス", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1440 },
  { name:"電源開発(J-POWER)", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1441 },
  { name:"東京エネシス", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1442 },
  { name:"九電工", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1443 },
  { name:"関電工", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1444 },
  { name:"きんでん", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1445 },
  { name:"三機工業", group:"メーカー", industry:"エネルギー", emoji:"🏭", sortRank:1446 },
];

// ─── アプリ本体 ────────────────────────────────────────────────────────────────
export default function App() {
  // Auth state
  const [authUser,  setAuthUser]  = useState(undefined); // undefined = loading
  const [profile,   setProfile]   = useState(null);

  // Data
  const [companies,   setCompanies]   = useState([]);
  const [posts,       setPosts]       = useState([]);
  const [reviews,     setReviews]     = useState([]);
  const [salaries,    setSalaries]    = useState([]);
  const [jobListings, setJobListings] = useState([]);
  const [diary,       setDiary]       = useState([]);
  const [seenComments, setSeenComments] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("seenComments") || "[]")); } catch { return new Set(); } });
  const [tracker, setTracker] = useState([]);
  const [favorites,   setFavorites]   = useState([]); // お気に入り投稿IDのリスト
  const [dataReady,   setDataReady]   = useState(false);

  // UI
  const [page,     setPage]     = useState("home");
  const [selCo,    setSelCo]    = useState(null);
  const [selTab,   setSelTab]   = useState("interview");
  const [selPost,  setSelPost]  = useState(null);
  const [guestName, setGuestNameState] = useState(() => {
    if (typeof window === "undefined") return "名無しさん";
    let n = localStorage.getItem("guestName");
    if (!n) { n = genGuestName(); localStorage.setItem("guestName", n); }
    return n;
  });
  const setGuestName = (name) => {
    const v = (name || "").slice(0, 24);
    setGuestNameState(v);
    if (typeof window !== "undefined") localStorage.setItem("guestName", v);
  };

  // 共有リンク（#thread/{id} など）対応：初回ロード時のURLハッシュを保持
  const bootHash = useRef(typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "");
  const [bootDone, setBootDone] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [toast,    setToast]    = useState(null);
  const [editTgt,  setEditTgt]  = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQ,  setSearchQ]  = useState("");
  const [grpFilter,setGrpFilter]= useState("");
  const [subTopGroup, setSubTopGroup] = useState(""); // サブトップに表示する業種
  const [subFilter,setSubFilter]= useState("");
  const [sortBy,   setSortBy]   = useState("posts");
  const [globalSearch, setGlobalSearch] = useState("");

  // 全画面検索：企業名 or 投稿内容にヒット
  const doGlobalSearch = (q) => {
    setGlobalSearch(q);
    if (q.trim()) {
      setSearchQ(q.trim());
      go("companies");
    }
  };

  const w        = useWidth();
  const isMobile = w < 768;

  // ── Auth リスナー（Firebase Auth）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user && !user.isAnonymous) {
        let prof = await fsGet("users", user.uid);
        if (!prof) {
          prof = {
            uid: user.uid,
            displayName: user.displayName || "匿名",
            email: user.email || "",
            plan: "free",
            isAdmin: false,
            joinDate: today(),
            viewUnlockUntil: 0,
            postCount: 0,
            notifications: {
              email: true,        // メール通知のオン/オフ
              comments: true,     // 自分の投稿へのコメント
              likes: true,        // 自分の投稿へのいいね（マイルストーンのみ）
              weeklyDigest: true, // 週次ダイジェスト
              followedCos: true,  // フォロー中企業の新着
            },
            followedCompanies: [], // フォローしている企業ID
            lastLoginDate: today(),
            streak: 0,             // 連続投稿日数
            lastPostDate: null,
            unreadNotifications: [], // サイト内通知（未読）
          };
          await fsSet("users", user.uid, prof);
        }
        setProfile(prof);
        // お気に入りを読み込む
        const favDoc = await fsGet("favorites", user.uid);
        setFavorites(favDoc?.postIds || []);
        // 就活日記を読み込む
        const d = await fsWhere("diary", "uid", "==", user.uid);
        setDiary(d.sort((a, b) => (b.date || "").localeCompare(a.date || "")));
        try {
          const tr = await fsWhere("tracker", "uid", "==", user.uid);
          setTracker(tr.sort((a, b) => (b.updated || b.date || "").localeCompare(a.updated || a.date || "")));
        } catch (e) { setTracker([]); }
      } else {
        setProfile(null);
        setDiary([]);
        setTracker([]);
      }
    });
    return unsub;
  }, []);

  // ── 公開データ読み込み（Firestore）
  useEffect(() => {
    (async () => {
      try {
        let [c, p, r, s, j] = await Promise.all([
          fsAll("companies"),
          fsAll("posts",       "createdAt"),
          fsAll("reviews",     "createdAt"),
          fsAll("salaries",    "createdAt"),
          fsAll("joblistings", "postedDate"),
        ]);
        // 初回起動時にシード企業を投入
        if (c.length === 0 && SEED_COMPANIES.length > 0) {
          console.log("初回シードデータを投入中...");
          const newCos = [];
          for (const seed of SEED_COMPANIES) {
            try {
              const id = await fsAdd("companies", { ...seed, author: "システム", authorUid: null });
              newCos.push({ id, ...seed });
            } catch (e) { console.error("seed error:", e); }
          }
          c = newCos;
        }
        setCompanies(c);
        setPosts(p);
        setReviews(r);
        setSalaries(s);
        setJobListings(j);
      } catch (e) {
        console.error("Firestore load error:", e);
      } finally {
        setDataReady(true);
      }
    })();
  }, []);

  const toast2 = (m) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  // ── 認証（Firebase Auth）
  const register = async (email, displayName, password) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      await sendEmailVerification(cred.user);
      const prof = {
        uid: cred.user.uid,
        displayName,
        email,
        plan: "free",
        isAdmin: false,
        joinDate: today(),
        emailVerified: false,
      };
      await fsSet("users", cred.user.uid, prof);
      setAuthMode(null);
      toast2("登録しました。確認メールをご確認ください。");
      return null;
    } catch (e) {
      const m = {
        "auth/email-already-in-use": "このメールアドレスはすでに使用されています",
        "auth/invalid-email":        "メールアドレスの形式が正しくありません",
        "auth/weak-password":        "パスワードは6文字以上にしてください",
      };
      return m[e.code] || ("エラー: " + e.message);
    }
  };

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setAuthMode(null);
      toast2("ログインしました");
      return null;
    } catch (e) {
      return "メールアドレスまたはパスワードが正しくありません";
    }
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      // 既存ユーザーかチェック - なければ作成
      let prof = await fsGet("users", cred.user.uid);
      if (!prof) {
        prof = {
          uid: cred.user.uid,
          displayName: cred.user.displayName || "ユーザー",
          email: cred.user.email || "",
          plan: "free",
          isAdmin: false,
          joinDate: today(),
          viewUnlockUntil: 0,
          postCount: 0,
          provider: "google",
          notifications: { email: true, comments: true, likes: true, weeklyDigest: true, followedCos: true },
          followedCompanies: [],
          lastLoginDate: today(),
          streak: 0,
          lastPostDate: null,
          unreadNotifications: [],
        };
        await fsSet("users", cred.user.uid, prof);
      }
      setProfile(prof);
      setAuthMode(null);
      toast2("Googleアカウントでログインしました");
      return null;
    } catch (e) {
      const m = {
        "auth/popup-closed-by-user": null,
        "auth/cancelled-popup-request": null,
      };
      if (e.code in m && m[e.code] === null) return null;
      return "エラー: " + (e.message || e.code);
    }
  };

  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast2("パスワードリセットメールを送信しました");
      return null;
    } catch (e) {
      const m = {
        "auth/user-not-found":  "このメールアドレスは登録されていません",
        "auth/invalid-email":   "メールアドレスの形式が正しくありません",
        "auth/missing-email":   "メールアドレスを入力してください",
      };
      return m[e.code] || ("エラー: " + e.message);
    }
  };

  const logout = async () => {
    await signOut(auth);
    toast2("ログアウトしました");
  };

  const upgradePlan = async (planId) => {
    if (!authUser) return;
    await fsUpdate("users", authUser.uid, { plan: planId });
    setProfile(p => ({ ...p, plan: planId }));
    toast2(PLANS[planId].name + "プランに変更しました");
  };

  // ── Stripe課金（将来実装）─────────────────────────────────────────────────
  // 現在はプランをFirestore上で手動管理しています。
  // Stripe導入手順:
  //   1. stripe.com でアカウント作成
  //   2. Firebase Extensions の "Run Payments with Stripe" を有効化
  //      (Firebaseコンソール > Extensions > Stripe Payments)
  //   3. 拡張機能が自動的に /customers/{uid}/checkout_sessions を監視
  //   4. 以下の checkoutSession 関数のコメントを外すだけで課金が動き出します
  //
  // const checkoutSession = async (priceId) => {
  //   if (!authUser) { setAuthMode("login"); return; }
  //   const sessionRef = await fsAdd(
  //     "customers/" + authUser.uid + "/checkout_sessions",
  //     { price: priceId, success_url: window.location.href, cancel_url: window.location.href }
  //   );
  //   // Stripe Firebase Extension がリダイレクトURLを自動生成してくれる
  //   const unsubscribe = onSnapshot(dref("customers/" + authUser.uid + "/checkout_sessions", sessionRef), (snap) => {
  //     const { url } = snap.data();
  //     if (url) { window.location.assign(url); unsubscribe(); }
  //   });
  // };
  // ───────────────────────────────────────────────────────────────────────────

  // ── 画面遷移
  const go = (p, co = null, tab = null, fromPopstate = false) => {
    if (p === "company" && (co === undefined || co === null)) { p = "board"; co = null; }
    setPage(p);
    if (co  !== null) setSelCo(co);
    if (tab !== null) setSelTab(tab);
    else if (p === "company") setSelTab("interview");
    window.scrollTo(0, 0);
    setMenuOpen(false);
    // ブラウザ履歴に追加
    if (!fromPopstate && typeof window !== "undefined") {
      const state = { p, coId: co?.id || null, tab };
      window.history.pushState(state, "", "#" + p + (co?.id ? "/" + co.id : ""));
    }
  };

  // サブトップ（業種別ページ）に遷移
  const goSubTop = (grp) => {
    setSubTopGroup(grp);
    setPage("subTop");
    window.scrollTo(0, 0);
    setMenuOpen(false);
    if (typeof window !== "undefined") {
      window.history.pushState({ p:"subTop", grp }, "", "#subtop/" + encodeURIComponent(grp));
    }
  };

  // スレッド個別ページに遷移
  const goThread = (post) => {
    if (!post) return;
    setSelPost(post);
    setPage("thread");
    window.scrollTo(0, 0);
    setMenuOpen(false);
    if (typeof window !== "undefined") {
      window.history.pushState({ p:"thread", postId: post.id }, "", "#thread/" + post.id);
    }
  };

  // popstate（戻る/進むボタン）で内部状態を復元
  useEffect(() => {
    const handler = (e) => {
      const s = e.state || { p:"home" };
      if (s.p === "subTop" && s.grp) {
        setSubTopGroup(s.grp);
        setPage("subTop");
        window.scrollTo(0, 0);
        return;
      }
      if (s.p === "thread" && s.postId) {
        const post = posts.find(pp => pp.id === s.postId);
        if (post) { setSelPost(post); setPage("thread"); window.scrollTo(0, 0); }
        return;
      }
      const co = s.coId ? companies.find(c => c.id === s.coId) : null;
      go(s.p, co, s.tab, true);
    };
    window.addEventListener("popstate", handler);
    // 初期ステートを設定
    if (window.history.state === null) {
      window.history.replaceState({ p:"home" }, "", "");
    }
    return () => window.removeEventListener("popstate", handler);
  }, [companies, posts]);

  // 共有リンクで開いた時にURLハッシュから画面を復元（データ読み込み後に一度だけ）
  useEffect(() => {
    if (bootDone) return;
    const h = bootHash.current;
    if (!h || h === "home") { setBootDone(true); return; }
    const slash = h.indexOf("/");
    const route = slash === -1 ? h : h.slice(0, slash);
    const arg   = slash === -1 ? "" : h.slice(slash + 1);
    if ((route === "thread" || route === "company") && !companies.length && !posts.length) return;
    if (route === "thread" && arg) {
      const post = posts.find(pp => pp.id === arg);
      if (post) { setSelPost(post); setPage("thread"); window.history.replaceState({ p:"thread", postId: arg }, "", "#thread/" + arg); }
      setBootDone(true);
    } else if (route === "company" && arg) {
      const co = companies.find(c => c.id === arg);
      if (co) { setSelCo(co); setSelTab("interview"); setPage("company"); window.history.replaceState({ p:"company", coId: arg, tab:"interview" }, "", "#company/" + arg); }
      setBootDone(true);
    } else if (route === "subtop" && arg) {
      setSubTopGroup(decodeURIComponent(arg)); setPage("subTop"); setBootDone(true);
    } else if (["board", "companies", "ranking", "pricing", "mypage"].includes(route)) {
      setPage(route); setBootDone(true);
    } else {
      setBootDone(true);
    }
  }, [companies, posts, bootDone]);

  // 投稿のゼロ摩擦化：未ログインなら匿名認証でサインイン（要：Firebaseコンソールで匿名認証を有効化。無効なら何もしない）
  useEffect(() => {
    const t = setTimeout(() => {
      if (!auth.currentUser) { signInAnonymously(auth).catch(() => {}); }
    }, 900);
    return () => clearTimeout(t);
  }, []);

  // ── 派生値
  const plan    = profile?.plan    || "free";
  const isAdmin = !!profile?.isAdmin;
  const sess    = authUser && profile ? { ...profile, uid: authUser.uid } : null;
  // 登録不要投稿のため、ログインしていなくても名前を使える
  const uName   = profile?.displayName || guestName || "名無しさん";

  // 匿名ユーザーのいいね識別
  const anonKey = () => {
    let k = localStorage.getItem("anonId");
    if (!k) { k = Math.random().toString(36).slice(2,10); localStorage.setItem("anonId", k); }
    return "anon_" + k;
  };

  // ── CRUD（Firestore）
  // 投稿者にunlock権を付与（30日全閲覧可能）+ 連続投稿日数を更新
  const grantUnlock = async () => {
    if (!authUser || !profile) return;
    const newUnlock = Date.now() + 30 * 86400000;
    const newCount = (profile.postCount || 0) + 1;
    // 連続投稿日数（streak）の計算
    const td = today();
    const last = profile.lastPostDate;
    let streak = profile.streak || 0;
    if (!last) streak = 1;
    else {
      const yest = new Date(); yest.setDate(yest.getDate() - 1);
      const ystr = yest.toISOString().slice(0,10);
      if (last === td) {} // 同日 → 維持
      else if (last === ystr) streak = streak + 1; // 昨日 → +1
      else streak = 1; // それ以外 → リセット
    }
    await fsUpdate("users", authUser.uid, { viewUnlockUntil: newUnlock, postCount: newCount, lastPostDate: td, streak });
    setProfile(p => ({ ...p, viewUnlockUntil: newUnlock, postCount: newCount, lastPostDate: td, streak }));
    // 連続投稿のマイルストーン通知
    if (streak === 3)       toast2("🔥 3日連続投稿達成！");
    else if (streak === 7)  toast2("🌟 7日連続投稿達成！週間バッジを獲得！");
    else if (streak === 30) toast2("👑 30日連続投稿達成！殿堂入りバッジを獲得！");
  };

  // 通知設定を更新
  const updateNotifications = async (notifications) => {
    if (!authUser || !profile) return;
    await fsUpdate("users", authUser.uid, { notifications });
    setProfile(p => ({ ...p, notifications }));
  };

  const saveVerifications = async (verifications) => {
    if (!authUser || !profile) { setAuthMode("login"); toast2("ログイン後に登録できます"); return; }
    try { await fsUpdate("users", authUser.uid, { verifications }); } catch (e) {}
    setProfile(p => ({ ...p, verifications }));
  };

  // 企業フォローのトグル
  const toggleFollowCompany = async (coId) => {
    if (!authUser || !profile) { setAuthMode("login"); toast2("ログイン後にフォローできます"); return; }
    const current = profile.followedCompanies || [];
    const newList = current.includes(coId) ? current.filter(c => c !== coId) : [...current, coId];
    await fsUpdate("users", authUser.uid, { followedCompanies: newList });
    setProfile(p => ({ ...p, followedCompanies: newList }));
    toast2(current.includes(coId) ? "フォローを解除しました" : "企業をフォローしました");
  };

  const addCompany = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に企業追加できます"); return; }
    const data = { ...d, group: d.group || getGroup(d.industry), author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("companies", data);
    setCompanies(prev => [{ id, ...data, createdAt: null }, ...prev]);
    await grantUnlock();
    toast2("「" + d.name + "」を追加しました");
    go("company", { id, ...data }, "interview");
  };

  const addPost = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に投稿できます"); return; }
    const _coName = (companies.find(c => c.id === d.companyId) || {}).name;
    const _av = (profile?.verifications || []).find(x => x.company && _coName && x.company === _coName) || null;
    const data = { ...d, author: d.author || uName, authorUid: authUser?.uid || null, posterId: makePosterId(authUser?.uid ? authUser.uid : (d.guestEmail && d.guestEmail.includes("@")) ? ("em:" + d.guestEmail.toLowerCase().trim()) : ("anon:" + anonKey())), authorVerify: _av ? { type: _av.type, company: _av.company, status: _av.status } : null, likes: [], comments: [] };
    const id   = await fsAdd("posts", data);
    setPosts(prev => [{ id, ...data, createdAt: null }, ...prev]);
    await grantUnlock();
    toast2("投稿ありがとうございます！");
    if (d.companyId === GENERAL_ID) go("board");
    else go("company", companies.find(c => c.id === d.companyId), d.ptype);
  };

  const addReview = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に口コミ投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("reviews", data);
    setReviews(prev => [{ id, ...data, createdAt: null }, ...prev]);
    await grantUnlock();
    toast2("口コミありがとうございます！");
    go("company", companies.find(c => c.id === d.companyId), "review");
  };

  const addSalary = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に年収情報投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("salaries", data);
    setSalaries(prev => [{ id, ...data, createdAt: null }, ...prev]);
    await grantUnlock();
    toast2("年収情報ありがとうございます！");
    go("company", companies.find(c => c.id === d.companyId), "salary");
  };

  const addJobListing = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に募集要項追加できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("joblistings", data);
    setJobListings(prev => [{ id, ...data }, ...prev]);
    await grantUnlock();
    toast2("募集要項ありがとうございます！");
    go("company", companies.find(c => c.id === d.companyId), "jobs");
  };

  const toggleFavorite = async (postId) => {
    if (!authUser) { setAuthMode("login"); return; }
    const newFavs = favorites.includes(postId)
      ? favorites.filter(id => id !== postId)
      : [...favorites, postId];
    setFavorites(newFavs);
    await fsSet("favorites", authUser.uid, { postIds: newFavs, uid: authUser.uid });
    toast2(favorites.includes(postId) ? "お気に入りを解除しました" : "お気に入りに追加しました");
  };

  const addComment = async (postId, content, parentId = null, newCommentsOverride = null) => {
    const post    = posts.find(p => p.id === postId);
    let newCmts;
    if (newCommentsOverride) {
      newCmts = newCommentsOverride;
    } else {
      const cmt = { id: Math.random().toString(36).slice(2,10), author: uName, authorUid: authUser?.uid || null, content, date: today(), posterId: makePosterId(authUser?.uid ? authUser.uid : ("anon:" + anonKey())), ...(parentId ? { parentId } : {}) };
      newCmts = [...(post?.comments || []), cmt];
    }
    await fsUpdate("posts", postId, { comments: newCmts });
    setPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, comments: newCmts }));
  };

  const toggleLike = async (postId) => {
    const key  = authUser?.uid || anonKey();
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const liked    = (post.likes || []).includes(key);
    const newLikes = liked ? post.likes.filter(u => u !== key) : [...(post.likes || []), key];
    await fsUpdate("posts", postId, { likes: newLikes });
    setPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, likes: newLikes }));
  };

  // ベストアンサー（投稿主・管理者のみ）→ 設定で「解決済み」
  const setBestAnswer = async (post, commentId) => {
    if (!authUser) { setAuthMode("login"); return; }
    const isOP = post.authorUid && post.authorUid === authUser.uid;
    if (!isOP && !isAdmin) { toast2("ベストアンサーは投稿主のみ設定できます"); return; }
    const newVal = post.bestAnswerId === commentId ? null : commentId;
    await fsUpdate("posts", post.id, { bestAnswerId: newVal });
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, bestAnswerId: newVal } : p));
    setSelPost(prev => (prev && prev.id === post.id) ? { ...prev, bestAnswerId: newVal } : prev);
    toast2(newVal ? "✅ ベストアンサーに設定しました（解決済み）" : "ベストアンサーを解除しました");
  };

  const adminDelete = async (type, id) => {
    if (!window.confirm("削除しますか？")) return;
    const colMap = { post:"posts", review:"reviews", salary:"salaries", job:"joblistings", company:"companies" };
    if (colMap[type]) {
      await fsDel(colMap[type], id);
      if (type === "post")     setPosts(prev     => prev.filter(x => x.id !== id));
      if (type === "review")   setReviews(prev   => prev.filter(x => x.id !== id));
      if (type === "salary")   setSalaries(prev  => prev.filter(x => x.id !== id));
      if (type === "job")      setJobListings(prev => prev.filter(x => x.id !== id));
      if (type === "company")  setCompanies(prev => prev.filter(x => x.id !== id));
    }
    if (type === "comment") {
      const [pid, cid] = id.split(":");
      const post       = posts.find(p => p.id === pid);
      const newCmts    = (post?.comments || []).filter(c => c.id !== cid);
      await fsUpdate("posts", pid, { comments: newCmts });
      setPosts(prev => prev.map(p => p.id !== pid ? p : { ...p, comments: newCmts }));
    }
    toast2("削除しました");
  };

  const adminEdit = async (type, id, v) => {
    const colMap = { post:"posts", review:"reviews", salary:"salaries", job:"joblistings", company:"companies" };
    if (colMap[type]) await fsUpdate(colMap[type], id, v);
    if (type === "post")     setPosts(prev     => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "review")   setReviews(prev   => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "salary")   setSalaries(prev  => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "job")      setJobListings(prev => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "company")  setCompanies(prev => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    toast2("更新しました");
    setEditTgt(null);
  };

  const saveDiary = async (entries) => {
    setDiary(entries);
    if (!authUser) return;
    // Firestoreに保存（ユーザーの日記）
    const existing = await fsWhere("diary", "uid", "==", authUser.uid);
    await Promise.all(existing.map(e => fsDel("diary", e.id)));
    await Promise.all(entries.map(e => fsSet("diary", e.id, { ...e, uid: authUser.uid })));
  };

  const saveTracker = async (entries) => {
    setTracker(entries);
    if (!authUser) return;
    try {
      const existing = await fsWhere("tracker", "uid", "==", authUser.uid);
      await Promise.all(existing.map(e => fsDel("tracker", e.id)));
      await Promise.all(entries.map(e => fsSet("tracker", e.id, { ...e, uid: authUser.uid })));
    } catch (e) { /* tracker collection のルール未設定時はローカルのみ保持 */ }
  };

  // ── 派生データ
  const coPosts      = (id) => posts.filter(p => p.companyId === id);
  const coRevs       = (id) => reviews.filter(r => r.companyId === id);
  const coSals       = (id) => salaries.filter(s => s.companyId === id);
  const coJobs       = (id) => jobListings.filter(j => j.companyId === id);

  let filteredCos = [...companies];
  if (grpFilter)  filteredCos = filteredCos.filter(c => (c.group || getGroup(c.industry)) === grpFilter);
  if (subFilter)  filteredCos = filteredCos.filter(c => c.industry === subFilter);
  if (searchQ) {
    const q = searchQ.toLowerCase();
    // 投稿内容に検索ヒットした企業ID を抽出
    const hitCompanyIds = new Set([
      ...posts.filter(p => (p.title||"").toLowerCase().includes(q) || (p.content||"").toLowerCase().includes(q) || (p.esQuestion||"").toLowerCase().includes(q)).map(p => p.companyId),
      ...reviews.filter(r => (r.pros||"").toLowerCase().includes(q) || (r.cons||"").toLowerCase().includes(q) || (r.advice||"").toLowerCase().includes(q)).map(r => r.companyId),
    ]);
    filteredCos = filteredCos.filter(c => c.name.toLowerCase().includes(q) || hitCompanyIds.has(c.id));
  }
  if (sortBy === "rating")  filteredCos.sort((a,b) => (calcAvg(coRevs(b.id))?.overall || 0) - (calcAvg(coRevs(a.id))?.overall || 0));
  else if (sortBy === "salary") filteredCos.sort((a,b) => (calcAvgSal(coSals(b.id)) || 0) - (calcAvgSal(coSals(a.id)) || 0));
  else {
    // 投稿数 > 0 の企業を先に投稿数順、続いて sortRank（企業規模）順
    filteredCos.sort((a,b) => {
      const aAct = coPosts(a.id).length + coRevs(a.id).length;
      const bAct = coPosts(b.id).length + coRevs(b.id).length;
      if (aAct !== bAct) return bAct - aAct;
      const aRank = a.sortRank || 99999;
      const bRank = b.sortRank || 99999;
      return aRank - bRank;
    });
  }

  // ローディング
  if (!dataReady) {
    return (
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", flexDirection:"column", gap:16 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width:28, height:28, border:"2px solid #DDD", borderTopColor:"#9B0000", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
        <p style={{ fontSize:13, color:"#888" }}>読み込み中...</p>
      </div>
    );
  }

  const unlocked = true; // 掲示板は全開放（閲覧ゲートなし）

  // 投稿者ごとの投稿数集計（authorUid -> count）
  const authorPostCounts = (() => {
    const m = {};
    [...posts, ...reviews, ...salaries].forEach(item => {
      if (item.authorUid) m[item.authorUid] = (m[item.authorUid] || 0) + 1;
    });
    return m;
  })();
  const getAuthorBadge = (authorUid) => {
    if (!authorUid) return null;
    return getBadge(authorPostCounts[authorUid] || 0);
  };

  const replyNotifs = (() => {
    if (!authUser) return [];
    const me = authUser.uid; const out = [];
    for (const pp of posts) {
      if (pp.authorUid !== me) continue;
      for (const c of (pp.comments || [])) {
        if (!c || !c.id || (c.authorUid && c.authorUid === me)) continue;
        if (seenComments.has(c.id)) continue;
        out.push({ post: pp, comment: c });
      }
    }
    out.sort((a, b) => (b.comment.date || "").localeCompare(a.comment.date || ""));
    return out.slice(0, 40);
  })();
  const markNotifsSeen = () => {
    setSeenComments(prev => {
      const next = new Set(prev);
      for (const pp of posts) { if (pp.authorUid !== authUser?.uid) continue; for (const c of (pp.comments || [])) { if (c && c.id) next.add(c.id); } }
      try { localStorage.setItem("seenComments", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const sp = { sess, go, goSubTop, companies, posts, reviews, salaries, jobListings, plan, isAdmin, adminDelete, adminEdit, setEditTgt, setAuthMode, isMobile, uName, upgradePlan, authUser, favorites, toggleFavorite, unlocked, profile, getAuthorBadge, authorPostCounts, goThread, setBestAnswer, guestName, setGuestName, replyNotifs, markNotifsSeen, saveVerifications };

  return (
    <ErrorBoundary>
    <div style={S.root}>
      <style>{CSS}</style>
      <AppNav {...sp} menuOpen={menuOpen} setMenuOpen={setMenuOpen} logout={logout} doGlobalSearch={doGlobalSearch} globalSearch={globalSearch} />
      {isMobile && <BottomNav go={go} page={page} sess={sess} setAuthMode={setAuthMode} replyNotifs={replyNotifs} />}
      {toast && <div style={S.toast} className="fadeUp">{toast}</div>}
      {authMode && <AuthModal mode={authMode} setMode={setAuthMode} onLogin={login} onRegister={register} onReset={resetPassword} onGoogle={loginWithGoogle} />}
      {editTgt  && <EditModal target={editTgt} setTarget={setEditTgt} onSave={adminEdit} />}

      {authUser && !authUser.emailVerified && (
        <div style={{ background:"#FFFBEB", borderBottom:"1px solid #FDE68A", padding:"10px 20px", textAlign:"center", fontSize:12 }}>
          メールアドレスの確認が完了していません。
          <button style={{ marginLeft:8, color:C.accent, background:"none", border:"none", textDecoration:"underline", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}
            onClick={() => sendEmailVerification(authUser).then(() => toast2("確認メールを再送しました"))}>
            確認メールを再送する
          </button>
        </div>
      )}

      <main style={{ ...S.main, padding: isMobile ? "0 12px 88px" : "0 24px 72px" }}>
        {page === "home"       && <HomePage       {...sp} coPosts={coPosts} coRevs={coRevs} coSals={coSals} setAuthMode={setAuthMode} doGlobalSearch={doGlobalSearch} />}
        {page === "board"      && <GeneralBoardPage {...sp} onAddPost={addPost} onToggleLike={toggleLike} onAddComment={addComment} />}
        {page === "thread"     && selPost && <ThreadPage {...sp} post={selPost} onToggleLike={toggleLike} onAddComment={addComment} />}
        {page === "companies"  && <CompaniesPage  {...sp} filtered={filteredCos} searchQ={searchQ} setSearchQ={setSearchQ} grpFilter={grpFilter} setGrpFilter={setGrpFilter} subFilter={subFilter} setSubFilter={setSubFilter} sortBy={sortBy} setSortBy={setSortBy} coPosts={coPosts} coRevs={coRevs} coSals={coSals} />}
        {page === "subTop"     && <SubTopPage     {...sp} grp={subTopGroup} setGrpFilter={setGrpFilter} setSubFilter={setSubFilter} coPosts={coPosts} coRevs={coRevs} coSals={coSals} />}
        {page === "company"    && selCo && (
          <CompanyPage {...sp}
            co={selCo}
            cposts={coPosts(selCo.id)} crevs={coRevs(selCo.id)}
            csals={coSals(selCo.id)}   cjobs={coJobs(selCo.id)}
            initTab={selTab}
            onToggleLike={toggleLike} onAddComment={addComment}
            onAddPost={addPost}       onAddReview={addReview}
            onAddSalary={addSalary}   onAddJob={addJobListing}
            sess={sess}
            unlocked={unlocked}
            profile={profile}
            toggleFollowCompany={toggleFollowCompany}
          />
        )}
        {page === "ranking"    && <RankingPage    {...sp} coPosts={coPosts} coRevs={coRevs} coSals={coSals} />}
        {page === "pricing"    && <PricingPage    {...sp} />}
        {page === "addCompany" && <AddCompanyPage {...sp} onSubmit={addCompany} authUser={authUser} setAuthMode={setAuthMode} />}
        {page === "mypage"     && (
          <MyPage {...sp}
            diary={diary} saveDiary={saveDiary} tracker={tracker} saveTracker={saveTracker}
            myPosts={posts.filter(p => p.authorUid === authUser?.uid)}
            myRevs={reviews.filter(r => r.authorUid === authUser?.uid)}
            favPosts={posts.filter(p => favorites.includes(p.id))}
          />
        )}
        {page === "admin"     && (isAdmin ? <AdminPage   {...sp} /> : <AccessDenied go={go} />)}
        {page === "analytics" && (isAdmin ? <AnalyticsPage companies={companies} posts={posts} reviews={reviews} salaries={salaries} isMobile={isMobile} /> : <AccessDenied go={go} />)}
      </main>

      <footer style={S.footer}>
        <div style={{ maxWidth:1160, margin:"0 auto", display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
          <button style={S.logoBtn} onClick={() => go("home")}>
            <span style={{ ...S.logoText, fontSize:15 }}>CareerClub</span>
          </button>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            {[["ranking","ランキング"],["companies","企業一覧"]].map(([p,l]) => (
              <button key={p} style={{ background:"none", border:"none", color:C.sub, fontSize:12, fontFamily:"inherit", cursor:"pointer", textDecoration:"underline" }} onClick={() => go(p)}>{l}</button>
            ))}
          </div>
        </div>
        <p style={{ fontSize:10, color:"#888", textAlign:"center", marginTop:8 }}>(c) 2026 CareerClub（キャリクラ）</p>
      </footer>
    </div>
    </ErrorBoundary>
  );
}

// ─── AuthModal（本物のFirebase Auth）────────────────────────────────────────
function AuthModal({ mode, setMode, onLogin, onRegister, onReset, onGoogle }) {
  const [email, setEmail] = useState("");
  const [dn,    setDn]    = useState("");
  const [pw,    setPw]    = useState("");
  const [err,   setErr]   = useState("");
  const [msg,   setMsg]   = useState("");
  const [ld,    setLd]    = useState(false);

  const doLogin = async () => {
    setErr(""); setLd(true);
    const e = await onLogin(email.trim(), pw);
    if (e) setErr(e);
    setLd(false);
  };
  const doReg = async () => {
    setErr(""); setLd(true);
    if (!dn.trim()) { setErr("表示名を入力してください"); setLd(false); return; }
    if (pw.length < 6) { setErr("パスワードは6文字以上にしてください"); setLd(false); return; }
    const e = await onRegister(email.trim(), dn.trim(), pw);
    if (e) setErr(e);
    setLd(false);
  };
  const doReset = async () => {
    setErr(""); setMsg(""); setLd(true);
    const e = await onReset(email.trim());
    if (e) setErr(e);
    else setMsg("メールを送信しました。受信トレイをご確認ください。");
    setLd(false);
  };

  const titles = { login:"ログイン", register:"新規会員登録", forgot:"パスワード再発行" };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setMode(null); }}>
      <div style={S.modal} className="fadeUp">
        <h2 style={S.modalTitle}>{titles[mode]}</h2>
        <div style={S.modalHr} />
        {mode === "register" && (
          <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"10px 14px", marginBottom:12, fontSize:12, lineHeight:1.7 }}>
            メールアドレスだけで無料登録できます。<br />
            登録後、すべての投稿・閲覧・企業追加機能をご利用いただけます。
          </div>
        )}
        {mode === "forgot" && (
          <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"10px 14px", marginBottom:12, fontSize:12, lineHeight:1.7 }}>
            登録時のメールアドレスを入力してください。<br />
            パスワード再設定用のメールをお送りします。
          </div>
        )}
        {err && <div style={S.errBox}>{err}</div>}
        {msg && <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", color:"#166534", padding:"8px 12px", fontSize:12, marginBottom:12, borderRadius:4 }}>{msg}</div>}
        <Fld label="メールアドレス">
          <input style={S.input} type="email" placeholder="example@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && mode === "forgot") doReset(); }} />
        </Fld>
        {mode === "register" && (
          <Fld label="表示名（掲示板に表示される名前）">
            <input style={S.input} placeholder="例：転職中エンジニア" value={dn} onChange={e => setDn(e.target.value)} />
          </Fld>
        )}
        {mode !== "forgot" && (
          <Fld label="パスワード（6文字以上）">
            <input style={S.input} type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => { if (e.key === "Enter") (mode === "login" ? doLogin() : doReg()); }} />
          </Fld>
        )}
        <button style={{ ...S.primaryBtn, width:"100%", padding:"11px", opacity: ld ? 0.6 : 1 }}
          onClick={mode === "login" ? doLogin : mode === "register" ? doReg : doReset} disabled={ld}>
          {ld ? "処理中..." : mode === "login" ? "ログイン" : mode === "register" ? "登録する" : "メールを送信する"}
        </button>
        {mode !== "forgot" && onGoogle && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:8, margin:"14px 0", color:C.sub, fontSize:11 }}>
              <div style={{ flex:1, height:1, background:C.border }} />
              <span>または</span>
              <div style={{ flex:1, height:1, background:C.border }} />
            </div>
            <button style={{ width:"100%", padding:"11px", background:"#fff", border:"1px solid " + C.border, borderRadius:6, fontSize:13, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
              onClick={async () => { setLd(true); const e = await onGoogle(); if (e) setErr(e); setLd(false); }} disabled={ld}>
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.71H.96v2.33C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.95 10.71c-.18-.54-.28-1.12-.28-1.71s.1-1.17.28-1.71V4.96H.96C.35 6.18 0 7.55 0 9s.35 2.82.96 4.04l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96L3.95 7.29C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
              Googleでログイン
            </button>
          </>
        )}
        {mode === "login" && (
          <p style={{ textAlign:"center", marginTop:10, fontSize:12 }}>
            <button style={S.textLink} onClick={() => { setMode("forgot"); setErr(""); setMsg(""); }}>
              パスワードをお忘れの方はこちら
            </button>
          </p>
        )}
        <p style={{ textAlign:"center", marginTop:14, fontSize:12, color:C.sub }}>
          {mode === "login"   && <>アカウントをお持ちでない方は<button style={S.textLink} onClick={() => { setMode("register"); setErr(""); setMsg(""); }}> 新規登録</button></>}
          {mode === "register"&& <>すでにアカウントをお持ちの方は<button style={S.textLink} onClick={() => { setMode("login");    setErr(""); setMsg(""); }}> ログイン</button></>}
          {mode === "forgot"  && <button style={S.textLink} onClick={() => { setMode("login"); setErr(""); setMsg(""); }}>← ログイン画面に戻る</button>}
        </p>
      </div>
    </div>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ target, setTarget, onSave }) {
  const { type, data } = target;
  const [v, setV] = useState({ ...data });
  const fields =
    type === "company" ? [{ k:"name", l:"企業名" }, { k:"industry", l:"業界" }] :
    type === "post"    ? [{ k:"title", l:"タイトル" }, { k:"content", l:"本文", multi:true }] :
    type === "job"     ? [{ k:"title", l:"タイトル" }, { k:"content", l:"内容",  multi:true }] :
                        [{ k:"pros",  l:"良いところ", multi:true }, { k:"cons", l:"改善点", multi:true }];
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setTarget(null); }}>
      <div style={{ ...S.modal, maxWidth:520 }} className="fadeUp">
        <h2 style={S.modalTitle}>内容を編集</h2>
        <div style={S.modalHr} />
        {fields.map(f => (
          <Fld key={f.k} label={f.l}>
            {f.multi
              ? <textarea style={{ ...S.input, resize:"vertical" }} rows={4} value={v[f.k] || ""} onChange={e => setV({ ...v, [f.k]: e.target.value })} />
              : <input   style={S.input} value={v[f.k] || ""} onChange={e => setV({ ...v, [f.k]: e.target.value })} />
            }
          </Fld>
        ))}
        <div style={{ display:"flex", gap:8 }}>
          <button style={{ ...S.primaryBtn, flex:1 }} onClick={() => onSave(type, data.id, v)}>保存する</button>
          <button style={{ ...S.secondaryBtn, flex:1 }} onClick={() => setTarget(null)}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ─── AppNav ───────────────────────────────────────────────────────────────────
function BottomNav({ go, page, sess, setAuthMode, replyNotifs }) {
  const items = [
    ["home", "掲示板", "📋"],
    ["companies", "企業", "🏢"],
    ["board", "投稿", "✏️"],
    [sess ? "mypage" : "__login__", sess ? "マイ" : "ログイン", "👤"],
  ];
  return (
    <div style={{ position:"fixed", left:0, right:0, bottom:0, zIndex:60, display:"flex", background:C.surface, borderTop:"1px solid " + C.border, boxShadow:"0 -2px 10px rgba(0,0,0,.05)", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
      {items.map(([key, label, icon]) => {
        const active = page === key;
        const isPost = key === "board";
        const nb = key === "mypage" ? (replyNotifs || []).length : 0;
        return (
          <button key={label} onClick={() => key === "__login__" ? setAuthMode("login") : go(key)}
            style={{ flex:1, background:"none", border:"none", padding:"7px 0 9px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, cursor:"pointer", fontFamily:"inherit", color: isPost ? C.warmAccent : (active ? C.accent : C.sub) }}>
            <span style={{ fontSize: isPost ? 20 : 18, position:"relative" }}>{icon}{nb > 0 && <span style={{ position:"absolute", top:-4, right:-8, background:C.warmAccent, color:"#fff", fontSize:8, fontWeight:"bold", borderRadius:6, minWidth:13, height:13, display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"0 2px" }}>{nb > 9 ? "9+" : nb}</span>}</span>
            <span style={{ fontSize:10, fontWeight: (active || isPost) ? "bold" : "normal" }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AppNav({ sess, go, plan, isAdmin, setAuthMode, isMobile, menuOpen, setMenuOpen, logout, doGlobalSearch, globalSearch, authUser, goThread, replyNotifs, markNotifsSeen }) {
  const [drop, setDrop] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const pl = PLANS[plan];
  return (
    <nav style={S.nav}>
      <div style={{ height:3, background:"linear-gradient(90deg, " + C.accentDark + " 0%, " + C.accent + " 50%, " + C.warmAccent + " 100%)" }} />
      <div style={{ maxWidth:1160, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", padding: isMobile ? "8px 12px" : "10px 24px" }}>
        <button style={S.logoBtn} onClick={() => go("home")}>
          <span style={{ ...S.logoText, fontSize: isMobile ? 17 : 22 }}>CareerClub</span>
          {!isMobile && <span style={{ display:"block", fontSize:9, color:C.sub, letterSpacing:"0.1em", marginTop:1 }}>転職・就活のリアルを話す掲示板</span>}
        </button>
        {!isMobile && (
          <div style={{ flex:1, maxWidth:480, margin:"0 24px", position:"relative" }}>
            <input
              type="text"
              placeholder="🔍 スレッド・企業名で検索"
              defaultValue={globalSearch}
              onKeyDown={(e) => { if (e.key === "Enter") doGlobalSearch(e.target.value); }}
              style={{
                width:"100%", padding:"9px 14px", paddingLeft:14,
                background:"#F5F8FC", border:"1px solid " + C.border, borderRadius:20,
                fontSize:13, fontFamily:"inherit", outline:"none",
                color:C.ink
              }}
              onFocus={(e) => { e.target.style.background = "#fff"; e.target.style.borderColor = C.accent; }}
              onBlur={(e) => { e.target.style.background = "#F5F8FC"; e.target.style.borderColor = C.border; }}
            />
          </div>
        )}
        {isMobile ? (
          <button style={{ background:"none", border:"none", display:"flex", flexDirection:"column", gap:4, padding:6, cursor:"pointer" }} onClick={() => setMenuOpen(o => !o)}>
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", transform: menuOpen ? "rotate(45deg) translateY(6px)" : "none" }} />
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", transform: menuOpen ? "rotate(-45deg) translateY(-6px)" : "none" }} />
          </button>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:0 }}>
            {[["home","掲示板"],["companies","企業を探す"],["ranking","ランキング"]].map(([p,l]) => (
              <span key={p}>
                <button style={{ background:"none", border:"none", color:C.ink, fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go(p)}>{l}</button>
                <span style={{ color:C.border, fontSize:11 }}>|</span>
              </span>
            ))}
            <button style={{ background:C.warmAccent, border:"none", color:"#fff", fontSize:12, fontWeight:"bold", padding:"6px 14px", borderRadius:8, fontFamily:"inherit", cursor:"pointer" }} onClick={() => go("board")}>✏️ 投稿する</button>
            {authUser && (
              <div style={{ position:"relative" }}>
                <button onClick={() => setNotifOpen(o => !o)} title="返信通知" style={{ background:"none", border:"none", cursor:"pointer", position:"relative", padding:"4px 6px", fontSize:18, lineHeight:1 }}>🔔
                  {(replyNotifs || []).length > 0 && <span style={{ position:"absolute", top:-2, right:-2, background:C.warmAccent, color:"#fff", fontSize:9, fontWeight:"bold", borderRadius:8, minWidth:15, height:15, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>{(replyNotifs || []).length > 99 ? "99+" : (replyNotifs || []).length}</span>}
                </button>
                {notifOpen && (
                  <div style={{ position:"absolute", right:0, top:"120%", width:300, maxHeight:380, overflowY:"auto", background:C.surface, border:"1px solid " + C.border, borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,.12)", zIndex:80 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", borderBottom:"1px solid " + C.border }}>
                      <span style={{ fontSize:12, fontWeight:"bold", color:C.ink }}>返信通知</span>
                      {(replyNotifs || []).length > 0 && <button onClick={() => markNotifsSeen()} style={{ background:"none", border:"none", color:C.accent, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>すべて既読</button>}
                    </div>
                    {(replyNotifs || []).length === 0
                      ? <div style={{ padding:"22px 12px", textAlign:"center", color:C.sub, fontSize:12 }}>新しい返信はありません</div>
                      : (replyNotifs || []).map((n, i) => (
                          <button key={n.comment.id + "_" + i} onClick={() => { goThread(n.post); markNotifsSeen(); setNotifOpen(false); }} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", borderBottom:"1px solid " + C.border, padding:"10px 12px", cursor:"pointer", fontFamily:"inherit" }}>
                            <div style={{ fontSize:12, color:C.ink, marginBottom:3 }}><b>{n.comment.author || "匿名"}</b>さんが返信</div>
                            <div style={{ fontSize:11, color:C.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>「{n.post.title}」</div>
                          </button>
                        ))}
                  </div>
                )}
              </div>
            )}
            <span style={{ color:C.border, fontSize:11 }}>|</span>
            {sess ? (
              <div style={{ position:"relative" }}>
                <button style={{ background:"none", border:"1px solid " + C.border, padding:"4px 10px", display:"flex", alignItems:"center", gap:6, fontSize:12, fontFamily:"inherit", cursor:"pointer" }} onClick={() => setDrop(o => !o)}>
                  <span style={{ background:pl.color, color:"#fff", width:22, height:22, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:"bold" }}>{ini(sess.displayName)}</span>
                  <span style={{ maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:C.ink }}>{sess.displayName}</span>
                  <span style={{ background:pl.color, color:"#fff", fontSize:9, padding:"1px 7px", fontWeight:"bold" }}>{pl.name}</span>
                  {isAdmin && <span style={{ background:"#4B0082", color:"#fff", fontSize:9, padding:"1px 6px", fontWeight:"bold" }}>管理者</span>}
                  <span style={{ color:"#aaa", fontSize:9 }}>v</span>
                </button>
                {drop && (
                  <div style={{ position:"absolute", right:0, top:"calc(100% + 4px)", background:"#fff", border:"1px solid " + C.border, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", minWidth:180, zIndex:300 }} className="fadeUp">
                    {[["mypage","マイページ"],["addCompany","企業を追加"]].map(([p,l]) => (
                      <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"9px 14px", fontSize:12, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => { go(p); setDrop(false); }}>{l}</button>
                    ))}
                    {isAdmin && (
                      <div>
                        <div style={{ height:1, background:C.border }} />
                        {[["admin","管理パネル"],["analytics","アクセス解析"]].map(([p,l]) => (
                          <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"9px 14px", fontSize:12, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => { go(p); setDrop(false); }}>{l}</button>
                        ))}
                      </div>
                    )}
                    <div style={{ height:1, background:C.border }} />
                    <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"9px 14px", fontSize:12, color:C.ink, fontFamily:"inherit", cursor:"pointer" }} onClick={() => { logout(); setDrop(false); }}>ログアウト</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ background:"none", border:"1px solid " + C.border, color:C.accent, fontSize:12, fontFamily:"inherit", cursor:"pointer", fontWeight:"bold", padding:"4px 10px" }} onClick={() => setAuthMode("login")}>ログイン</button>
                <button style={{ background:C.accent, border:"none", color:"#fff", padding:"6px 14px", fontSize:12, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer" }} onClick={() => setAuthMode("register")}>新規登録</button>
              </div>
            )}
          </div>
        )}
      </div>
      {isMobile && menuOpen && (
        <div style={{ background:"#fff", borderBottom:"1px solid " + C.border, boxShadow:"0 4px 12px rgba(0,0,0,0.1)" }} className="fadeUp">
          {[["home","掲示板"],["companies","企業を探す"],["ranking","ランキング"],["addCompany","＋企業追加"]].map(([p,l]) => (
            <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => go(p)}>{l}</button>
          ))}
          {sess ? (
            <div>
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => go("mypage")}>マイページ</button>
              {isAdmin && [["admin","管理パネル"],["analytics","アクセス解析"]].map(([p,l]) => (
                <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => go(p)}>{l}</button>
              ))}
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.accent, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={logout}>ログアウト</button>
            </div>
          ) : (
            <div>
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => setAuthMode("login")}>ログイン</button>
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => setAuthMode("register")}>新規登録</button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

// ─── ホームページ ──────────────────────────────────────────────────────────────

// 業種ごとのテーマ画像（SVGで生成、印象的なグラデーション + アイコン）
const GROUP_THEMES = {
  "航空": {
    img: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=70",
    emoji: "✈️",
    catch: "雲の上のキャリアを目指す方へ",
    desc: "パイロット・CA・整備士・グランドスタッフなど、空の仕事の選考情報・年収・口コミ",
  },
  "交通・運輸": {
    img: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=1200&q=70",
    emoji: "🚄",
    catch: "人と物の流れを支える仕事",
    desc: "鉄道・バス・海運・物流の選考情報・年収・口コミ",
  },
  "金融・銀行": {
    img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=70",
    emoji: "🏦",
    catch: "経済の中枢で活躍する",
    desc: "メガバンク・証券・保険・外資金融の選考情報・年収・口コミ",
  },
  "商社": {
    img: "https://images.unsplash.com/photo-1577416412292-747c6607f055?w=1200&q=70",
    emoji: "🌐",
    catch: "世界を舞台に働く",
    desc: "総合商社・専門商社の選考情報・年収・口コミ",
  },
  "メーカー": {
    img: "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=1200&q=70",
    emoji: "🏭",
    catch: "ものづくり日本を担う",
    desc: "自動車・電機・化学・食品・医薬品メーカーの選考情報・年収・口コミ",
  },
  "IT・テック": {
    img: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=70",
    emoji: "💻",
    catch: "テクノロジーで未来を創る",
    desc: "SIer・Web・スタートアップ・外資ITの選考情報・年収・口コミ",
  },
  "コンサル": {
    img: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=70",
    emoji: "💡",
    catch: "知力で企業を変革する",
    desc: "戦略コンサル・ITコンサル・監査法人・税理士の選考情報・年収・口コミ",
  },
  "不動産・建設": {
    img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1200&q=70",
    emoji: "🏢",
    catch: "街と建物を創る仕事",
    desc: "デベロッパー・ゼネコン・ハウスメーカーの選考情報・年収・口コミ",
  },
  "小売・流通": {
    img: "https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=1200&q=70",
    emoji: "🛒",
    catch: "暮らしを支える販売・流通",
    desc: "百貨店・SPA・EC・ドラッグストア・物流の選考情報・年収・口コミ",
  },
  "サービス": {
    img: "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1200&q=70",
    emoji: "📢",
    catch: "人と人をつなぐ仕事",
    desc: "広告・人材・メディア・外食の選考情報・年収・口コミ",
  },
  "医療・ヘルス": {
    img: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=70",
    emoji: "🏥",
    catch: "人々の健康を守る",
    desc: "医療機器・製薬・ヘルスケアの選考情報・年収・口コミ",
  },
  "教育・公共": {
    img: "https://images.unsplash.com/photo-1497486751825-1233686d5d80?w=1200&q=70",
    emoji: "📚",
    catch: "学びと社会を支える",
    desc: "教育・予備校・人材育成の選考情報・年収・口コミ",
  },
  "エンタメ": {
    img: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=1200&q=70",
    emoji: "🎮",
    catch: "感動と楽しみを生み出す",
    desc: "ゲーム・映像・音楽・出版の選考情報・年収・口コミ",
  },
};


// 企業ロゴ風アイコン（文字ベース・業種別カラー）
const GROUP_LOGO_COLORS = {
  "金融・銀行":   { bg:"linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)", color:"#fff" },
  "商社":         { bg:"linear-gradient(135deg, #064E3B 0%, #10B981 100%)", color:"#fff" },
  "メーカー":     { bg:"linear-gradient(135deg, #0E7490 0%, #06B6D4 100%)", color:"#fff" },
  "IT・テック":   { bg:"linear-gradient(135deg, #4338CA 0%, #818CF8 100%)", color:"#fff" },
  "コンサル":     { bg:"linear-gradient(135deg, #1F2937 0%, #4B5563 100%)", color:"#fff" },
  "不動産・建設": { bg:"linear-gradient(135deg, #581C87 0%, #A855F7 100%)", color:"#fff" },
  "小売・流通":   { bg:"linear-gradient(135deg, #9A3412 0%, #FB923C 100%)", color:"#fff" },
  "サービス":     { bg:"linear-gradient(135deg, #BE123C 0%, #FB7185 100%)", color:"#fff" },
  "医療・ヘルス": { bg:"linear-gradient(135deg, #14532D 0%, #4ADE80 100%)", color:"#fff" },
  "教育・公共":   { bg:"linear-gradient(135deg, #92400E 0%, #FACC15 100%)", color:"#fff" },
  "エンタメ":     { bg:"linear-gradient(135deg, #6B21A8 0%, #E879F9 100%)", color:"#fff" },
  "航空":         { bg:"linear-gradient(135deg, #1E40AF 0%, #60A5FA 100%)", color:"#fff" },
  "交通・運輸":   { bg:"linear-gradient(135deg, #115E59 0%, #2DD4BF 100%)", color:"#fff" },
};

function CompanyLogo({ company, size = 36 }) {
  const [imgStage, setImgStage] = React.useState(0); // 0=Clearbit, 1=favicon, 2=頭文字
  if (!company) return null;
  const grp = company.group || "メーカー";
  const theme = GROUP_LOGO_COLORS[grp] || { bg:"linear-gradient(135deg, #475569 0%, #94A3B8 100%)", color:"#fff" };

  // ドメイン抽出（websiteフィールド or 企業名から推測）
  const KNOWN_DOMAINS = {
    "トヨタ自動車":"toyota.co.jp","ホンダ":"honda.co.jp","日産自動車":"nissan.co.jp",
    "ソニーグループ":"sony.co.jp","パナソニックホールディングス":"panasonic.com",
    "日立製作所":"hitachi.co.jp","三菱電機":"mitsubishielectric.co.jp",
    "三菱UFJ銀行":"bk.mufg.jp","三井住友銀行":"smbc.co.jp","みずほ銀行":"mizuhobank.co.jp",
    "野村證券":"nomura.co.jp","大和証券":"daiwa.co.jp",
    "東京海上日動火災保険":"tokiomarine-nichido.co.jp","日本生命保険":"nissay.co.jp",
    "三菱商事":"mitsubishicorp.com","三井物産":"mitsui.com","伊藤忠商事":"itochu.co.jp",
    "住友商事":"sumitomocorp.com","丸紅":"marubeni.com",
    "NTTデータ":"nttdata.com","野村総合研究所":"nri.co.jp","富士通":"fujitsu.com",
    "NEC":"nec.com","楽天グループ":"rakuten.co.jp","ソフトバンク":"softbank.jp",
    "KDDI":"kddi.com","NTTドコモ":"docomo.ne.jp",
    "ANAホールディングス":"ana.co.jp","日本航空":"jal.com",
    "JR東日本":"jreast.co.jp","JR東海":"jr-central.co.jp","JR西日本":"westjr.co.jp",
    "三井不動産":"mitsuifudosan.co.jp","三菱地所":"mec.co.jp",
    "電通グループ":"dentsu.co.jp","博報堂DYホールディングス":"hakuhodody-holdings.co.jp",
    "リクルートホールディングス":"recruit.co.jp","任天堂":"nintendo.co.jp",
    "ファーストリテイリング":"fastretailing.com","セブン&アイ・ホールディングス":"7andi.com",
    "味の素":"ajinomoto.co.jp","キリンホールディングス":"kirinholdings.com",
    "アサヒグループホールディングス":"asahigroup-holdings.com",
    "サントリーホールディングス":"suntory.co.jp",
    "武田薬品工業":"takeda.com","アステラス製薬":"astellas.com",
    "アクセンチュア":"accenture.com",
    "デロイトトーマツコンサルティング":"deloitte.com",
    "PwCコンサルティング":"pwc.com",
    "EYストラテジー・アンド・コンサルティング":"ey.com",
    "KPMGコンサルティング":"kpmg.com",
    "ゴールドマン・サックス証券":"goldmansachs.com",
    "JPモルガン証券":"jpmorgan.com","モルガン・スタンレーMUFG証券":"morganstanley.com",
    "バンク・オブ・アメリカ":"bankofamerica.com",
    "Google合同会社":"google.com","日本マイクロソフト":"microsoft.com",
    "Amazon Japan合同会社":"amazon.co.jp","アマゾン ウェブ サービス ジャパン":"aws.amazon.com",
    "Salesforce Japan":"salesforce.com","メルカリ":"mercari.com",
    "サイバーエージェント":"cyberagent.co.jp","DeNA":"dena.com",
    "LINEヤフー":"lycorp.co.jp","ZOZO":"zozo.com",
    "大成建設":"taisei.co.jp","鹿島建設":"kajima.co.jp","清水建設":"shimz.co.jp",
    "イオン":"aeon.info","ニトリホールディングス":"nitori.co.jp",
    "バンダイナムコホールディングス":"bandainamco.co.jp","カプコン":"capcom.co.jp",
    "有限責任あずさ監査法人":"kpmg.com",
    "EY新日本有限責任監査法人":"ey.com",
    "有限責任監査法人トーマツ":"deloitte.com",
    "PwC Japan有限責任監査法人":"pwc.com",
    "西村あさひ法律事務所":"nishimura.com",
    "ブラックロック・ジャパン":"blackrock.com",
    "テルモ":"terumo.co.jp","シスメックス":"sysmex.co.jp",
    "ベネッセホールディングス":"benesse.co.jp",
    "東宝":"toho.co.jp","講談社":"kodansha.co.jp","集英社":"shueisha.co.jp",
    "りそな銀行":"resona-gr.co.jp","ゆうちょ銀行":"jp-bank.japanpost.jp","三井住友信託銀行":"smtb.jp","セブン銀行":"sevenbank.co.jp","イオン銀行":"aeonbank.co.jp","楽天銀行":"rakuten-bank.co.jp","ソニー銀行":"sonybank.net","PayPay銀行":"paypay-bank.co.jp","住信SBIネット銀行":"netbk.co.jp","auじぶん銀行":"jibunbank.co.jp","横浜銀行":"boy.co.jp","千葉銀行":"chibabank.co.jp","静岡銀行":"shizuokabank.co.jp","京都銀行":"kyotobank.co.jp","広島銀行":"hirogin.co.jp","SBI新生銀行":"sbishinseibank.co.jp","あおぞら銀行":"aozorabank.co.jp","日本政策投資銀行":"dbj.jp",
    "SMBC日興証券":"smbcnikko.co.jp","みずほ証券":"mizuho-sc.com","SBI証券":"sbisec.co.jp","楽天証券":"rakuten-sec.co.jp","松井証券":"matsui.co.jp","マネックスグループ":"monex.co.jp","岡三証券":"okasan.co.jp","東海東京証券":"tokaitokyo.co.jp","三菱UFJモルガン・スタンレー証券":"sc.mufg.jp","日本取引所グループ":"jpx.co.jp","東京証券取引所":"jpx.co.jp",
    "第一生命保険":"dai-ichi-life.co.jp","明治安田生命保険":"meijiyasuda.co.jp","住友生命保険":"sumitomolife.co.jp","かんぽ生命保険":"jp-life.japanpost.jp","ソニー生命保険":"sonylife.co.jp","アフラック生命保険":"aflac.co.jp","プルデンシャル生命保険":"prudential.co.jp","T&Dホールディングス":"td-holdings.co.jp","太陽生命保険":"taiyo-seimei.co.jp","富国生命保険":"fukoku-life.co.jp","朝日生命保険":"asahi-life.co.jp","ライフネット生命保険":"lifenet-seimei.co.jp","アクサ生命保険":"axa.co.jp","オリックス生命保険":"orixlife.co.jp",
    "三井住友海上火災保険":"ms-ins.com","損害保険ジャパン":"sompo-japan.co.jp","あいおいニッセイ同和損害保険":"aioinissaydowa.co.jp","東京海上ホールディングス":"tokiomarinehd.com","SOMPOホールディングス":"sompo-hd.com","MS&ADインシュアランスグループホールディングス":"ms-ad-hd.com","AIG損害保険":"aig.co.jp","チューリッヒ保険":"zurich.co.jp",
    "オリックス":"orix.co.jp","三菱HCキャピタル":"mitsubishi-hc-capital.com","東京センチュリー":"tokyocentury.co.jp","クレディセゾン":"saisoncard.co.jp","ジャックス":"jaccs.co.jp","アコム":"acom.co.jp","アイフル":"aiful.co.jp","SBIホールディングス":"sbigroup.co.jp","オリエントコーポレーション":"orico.co.jp","イオンフィナンシャルサービス":"aeonfinancial.co.jp",
    "豊田通商":"toyota-tsusho.com","双日":"sojitz.com","兼松":"kanematsu.co.jp","岡谷鋼機":"okaya.co.jp","阪和興業":"hanwa.co.jp","岩谷産業":"iwatani.co.jp","ミスミグループ本社":"misumi.co.jp","メディパルホールディングス":"medipal.co.jp","アルフレッサ ホールディングス":"alfresa.co.jp","スズケン":"suzuken.co.jp",
    "スズキ":"suzuki.co.jp","マツダ":"mazda.co.jp","SUBARU":"subaru.co.jp","いすゞ自動車":"isuzu.co.jp","三菱自動車工業":"mitsubishi-motors.com","ヤマハ発動機":"yamaha-motor.co.jp","川崎重工業":"khi.co.jp","日野自動車":"hino.co.jp","デンソー":"denso.com","アイシン":"aisin.com","豊田自動織機":"toyota-shokki.co.jp","ジェイテクト":"jtekt.co.jp","小糸製作所":"koito.co.jp","豊田合成":"toyoda-gosei.co.jp","ブリヂストン":"bridgestone.co.jp","住友ゴム工業":"srigroup.co.jp","横浜ゴム":"y-yokohama.com","日本電産":"nidec.com","日本特殊陶業":"ngkntk.co.jp","スタンレー電気":"stanley.co.jp",
    "東芝":"global.toshiba","シャープ":"global.sharp","キヤノン":"canon.jp","リコー":"ricoh.co.jp","コニカミノルタ":"konicaminolta.com","セイコーエプソン":"epson.jp","ブラザー工業":"brother.co.jp","オムロン":"omron.com","横河電機":"yokogawa.co.jp","アンリツ":"anritsu.com","島津製作所":"shimadzu.co.jp","HOYA":"hoya.com","オリンパス":"olympus.co.jp","ニコン":"nikon.co.jp","富士フイルムホールディングス":"fujifilm.com","アドバンテスト":"advantest.com","ディスコ":"disco.co.jp","東京エレクトロン":"tel.com","信越化学工業":"shinetsu.co.jp","レーザーテック":"lasertec.co.jp","TDK":"tdk.com","村田製作所":"murata.com","京セラ":"kyocera.co.jp","ミネベアミツミ":"minebeamitsumi.com","ヤマハ":"yamaha.com","ローム":"rohm.co.jp","ルネサスエレクトロニクス":"renesas.com","SUMCO":"sumcosi.com","アルプスアルパイン":"alpsalpine.com","マキタ":"makita.co.jp","ホシザキ":"hoshizaki.co.jp","パナソニック":"panasonic.com","ダイキン工業":"daikin.co.jp","富士電機":"fujielectric.co.jp","明電舎":"meidensha.co.jp",
    "三菱マテリアル":"mmc.co.jp","昭和電工":"resonac.com","レゾナック":"resonac.com","三菱重工業":"mhi.com","IHI":"ihi.co.jp","クボタ":"kubota.co.jp","ファナック":"fanuc.co.jp","コマツ":"komatsu.jp","日立建機":"hitachicm.com","DMG森精機":"dmgmori.co.jp","アマダ":"amada.co.jp","ナブテスコ":"nabtesco.com","ヤンマーホールディングス":"yanmar.com","タダノ":"tadano.com","住友重機械工業":"shi.co.jp","日本精工":"jp.nsk.com","SMC":"smcworld.com","東京瓦斯":"tokyo-gas.co.jp","東京ガス":"tokyo-gas.co.jp","大阪ガス":"osakagas.co.jp","JERA":"jera.co.jp","関西電力":"kepco.co.jp","東北電力":"tohoku-epco.co.jp","中部電力":"chuden.co.jp","中国電力":"energia.co.jp","九州電力":"kyuden.co.jp","東京電力ホールディングス":"tepco.co.jp",
    "三菱ケミカルグループ":"mcgc.com","住友化学":"sumitomo-chem.co.jp","三井化学":"mitsuichemicals.com","旭化成":"asahi-kasei.com","東レ":"toray.com","帝人":"teijin.co.jp","クラレ":"kuraray.co.jp","DIC":"dic-global.com","日本触媒":"shokubai.co.jp","花王":"kao.com","ライオン":"lion.co.jp","資生堂":"shiseido.com","コーセー":"kose.co.jp","ポーラ・オルビスホールディングス":"po-holdings.co.jp","マンダム":"mandom.co.jp","小林製薬":"kobayashi.co.jp","ピジョン":"pigeon.co.jp","ユニ・チャーム":"unicharm.co.jp",
    "日本製鉄":"nipponsteel.com","JFEホールディングス":"jfe-holdings.co.jp","神戸製鋼所":"kobelco.com","大同特殊鋼":"daido.co.jp","住友金属鉱山":"smm.co.jp","AGC":"agc.com","日本電気硝子":"neg.co.jp","日本板硝子":"nsg.com","太平洋セメント":"taiheiyo-cement.co.jp","UBE":"ube.com","TOTO":"toto.co.jp","LIXILグループ":"lixil.com","タカラスタンダード":"takara-standard.co.jp","クリナップ":"cleanup.jp",
    "サッポロホールディングス":"sapporoholdings.jp","伊藤園":"itoen.co.jp","明治ホールディングス":"meiji.com","森永製菓":"morinaga.co.jp","江崎グリコ":"glico.com","カルビー":"calbee.co.jp","ロッテ":"lotte.co.jp","森永乳業":"morinagamilk.co.jp","雪印メグミルク":"meg-snow.com","ヤクルト本社":"yakult.co.jp","山崎製パン":"yamazakipan.co.jp","日清食品ホールディングス":"nissin.com","東洋水産":"maruchan.co.jp","ハウス食品グループ本社":"housefoods-group.com","エスビー食品":"sbfoods.co.jp","ミツカン":"mizkan.co.jp","キッコーマン":"kikkoman.com","カゴメ":"kagome.co.jp","プリマハム":"primaham.co.jp","伊藤ハム":"itoham.co.jp","日本ハム":"nipponham.co.jp","ニチレイ":"nichirei.co.jp","マルハニチロ":"maruha-nichiro.co.jp","キッコーマン食品":"kikkoman.com","日清製粉グループ本社":"nisshin.com","キユーピー":"kewpie.com",
    "王子ホールディングス":"ojiholdings.co.jp","日本製紙":"nipponpapergroup.com","レンゴー":"rengo.co.jp","大王製紙":"daio-paper.co.jp","凸版印刷":"toppan.co.jp","大日本印刷":"dnp.co.jp",
    "第一三共":"daiichisankyo.co.jp","エーザイ":"eisai.com","中外製薬":"chugai-pharm.co.jp","大塚ホールディングス":"otsuka.com","塩野義製薬":"shionogi.co.jp","協和キリン":"kyowakirin.co.jp","参天製薬":"santen.com","小野薬品工業":"ono-pharma.com","住友ファーマ":"sumitomo-pharma.co.jp","ロート製薬":"rohto.co.jp","久光製薬":"hisamitsu.co.jp","ツムラ":"tsumura.co.jp","沢井製薬":"sawai.co.jp","ニプロ":"nipro.co.jp","日本光電工業":"nihonkohden.co.jp","フクダ電子":"fukuda.co.jp","アズビル":"azbil.com","エム・スリー":"m3.com","ペプチドリーム":"peptidream.com",
    "三菱鉛筆":"mpuni.co.jp","パイロットコーポレーション":"pilot.co.jp","コクヨ":"kokuyo.co.jp","マブチモーター":"mabuchi-motor.co.jp","アシックス":"asics.com","ミズノ":"mizuno.jp","デサント":"descente.co.jp","ゴールドウイン":"goldwin.co.jp","ヨネックス":"yonex.co.jp","シマノ":"shimano.com","YKK":"ykk.co.jp","YKK AP":"ykkap.co.jp","良品計画":"ryohin-keikaku.jp","タカラトミー":"takaratomy.co.jp","セガサミーホールディングス":"segasammy.co.jp","象印マホービン":"zojirushi.co.jp","タイガー魔法瓶":"tiger.jp",
    "SCSK":"scsk.jp","TIS":"tis.co.jp","BIPROGY":"biprogy.com","伊藤忠テクノソリューションズ":"ctc-g.co.jp","CTC":"ctc-g.co.jp","オービック":"obic.co.jp","日立ソリューションズ":"hitachi-solutions.co.jp","DTS":"dts.co.jp","ネットワンシステムズ":"netone.co.jp","電通国際情報サービス":"isid.co.jp","サイボウズ":"cybozu.co.jp","マネーフォワード":"moneyforward.com","freee":"freee.co.jp","Sansan":"sansan.com","ラクス":"rakus.co.jp","ラクスル":"raksul.com","BASE":"binc.jp","STORES":"stores.jp","Chatwork":"kubell.com","セールスフォース":"salesforce.com","SAP":"sap.com","オラクル":"oracle.com","アドビ":"adobe.com","ユーザベース":"uzabase.com",
    "Zホールディングス":"z-holdings.co.jp","エムスリー":"m3.com","クックパッド":"cookpad.com","ミクシィ":"mixi.co.jp","MIXI":"mixi.co.jp","グリー":"gree.net","コロプラ":"colopl.co.jp","アカツキ":"aktsk.jp","ガンホー・オンライン・エンターテイメント":"gungho.co.jp","SHIFT":"shiftinc.jp","エス・エム・エス":"bm-sms.co.jp","ビジョナル":"visional.inc","ビズリーチ":"bizreach.co.jp","ぐるなび":"gnavi.co.jp","食べログ":"tabelog.com","カカクコム":"kakaku.com","ZOZOTOWN":"zozo.jp","ピクシブ":"pixiv.co.jp","ドワンゴ":"dwango.co.jp","KADOKAWA":"kadokawa.co.jp",
    "NTT":"group.ntt","楽天モバイル":"mobile.rakuten.co.jp","インターネットイニシアティブ":"iij.ad.jp","ニフティ":"nifty.co.jp","BIGLOBE":"biglobe.co.jp","エキサイト":"excite.co.jp","スカパーJSATホールディングス":"skyperfectjsat.space",
    "ベイカレント・コンサルティング":"baycurrent.co.jp","アビームコンサルティング":"abeam.com","ボストン コンサルティング グループ":"bcg.com","マッキンゼー・アンド・カンパニー":"mckinsey.com","ベイン・アンド・カンパニー":"bain.com","アーサー・ディ・リトル":"adlittle.com","ローランド・ベルガー":"rolandberger.com","A.T. カーニー":"kearney.com","シグマクシス":"sigmaxyz.com","リブ・コンサルティング":"libcon.co.jp","ドリームインキュベータ":"dreamincubator.co.jp","経営共創基盤":"igpi.co.jp","船井総合研究所":"funaisoken.co.jp","山田コンサルティンググループ":"yamada-cg.co.jp","フューチャー":"future.co.jp",
    "住友不動産":"sumitomo-rd.co.jp","東急不動産":"tokyu-land.co.jp","野村不動産ホールディングス":"nomura-re-hd.co.jp","森ビル":"mori.co.jp","ヒューリック":"hulic.co.jp","東京建物":"tatemono.com","オープンハウスグループ":"openhouse-group.com","オープンハウス":"openhouse-group.com","レオパレス21":"leopalace21.com","大東建託":"kentaku.co.jp","スターツコーポレーション":"starts.co.jp","アパグループ":"apahotel.com","サンフロンティア不動産":"sunfrt.co.jp","タカラレーベン":"takara-leben.co.jp","平和不動産":"heiwa-net.co.jp","近鉄不動産":"kintetsu-re.co.jp","阪急阪神不動産":"hankyu-hanshin-r.co.jp",
    "大林組":"obayashi.co.jp","竹中工務店":"takenaka.co.jp","戸田建設":"toda.co.jp","熊谷組":"kumagaigumi.co.jp","前田建設工業":"maeda.jp","西松建設":"nishimatsu.co.jp","奥村組":"okumuragumi.co.jp","長谷工コーポレーション":"haseko.co.jp","三井住友建設":"smcon.co.jp","東急建設":"tokyu-cnst.co.jp","住友林業":"sumitomoforestry.co.jp","積水ハウス":"sekisuihouse.co.jp","大和ハウス工業":"daiwahouse.co.jp","ミサワホーム":"misawa.co.jp","旭化成ホームズ":"asahi-kasei.co.jp","三井ホーム":"mitsuihome.co.jp","トヨタホーム":"toyotahome.co.jp","タマホーム":"tamahome.jp","積水化学工業":"sekisui.co.jp",
    "三越伊勢丹ホールディングス":"imhds.co.jp","高島屋":"takashimaya.co.jp","Jフロント リテイリング":"j-front-retailing.com","H2Oリテイリング":"h2o-retailing.co.jp","近鉄百貨店":"d-kintetsu.co.jp","松屋":"matsuya.com","東急百貨店":"tokyu-dept.co.jp","ココカラファイン":"cocokarafine.co.jp","スギ薬局":"drug-sugi.co.jp","マツモトキヨシ":"matsukiyococokara.com","ツルハホールディングス":"tsuruha-hd.com","ウエルシアホールディングス":"welcia.co.jp","コスモス薬品":"cosmospc.co.jp","クスリのアオキ":"kusuri-aoki.co.jp","ヤマダホールディングス":"yamada-holdings.jp","ビックカメラ":"biccamera.co.jp","ヨドバシカメラ":"yodobashi.com","ノジマ":"nojima.co.jp","ケーズホールディングス":"ksdenki.com","エディオン":"edion.co.jp","上新電機":"joshin.co.jp","コジマ":"kojima.net",
    "しまむら":"shimamura.gr.jp","西松屋チェーン":"24028.jp","アダストリア":"adastria.co.jp","ユナイテッドアローズ":"united-arrows.co.jp","ビームス":"beams.co.jp","シップス":"sh-ps.com","オンワードホールディングス":"onward-hd.co.jp","ワールド":"world.co.jp","ストライプインターナショナル":"stripe-intl.com","ハニーズホールディングス":"honeys-hd.com","ABCマート":"abc-mart.net","チヨダ":"chiyodagrp.co.jp","青山商事":"aoyama-syouji.co.jp","AOKIホールディングス":"aoki-hd.co.jp","はるやまホールディングス":"haruyama.co.jp","アスクル":"askul.co.jp","モノタロウ":"monotaro.com","ミスミ":"misumi.co.jp",
    "ライフコーポレーション":"lifecorp.jp","オーケー":"ok-corporation.jp","サミット":"summitstore.co.jp","成城石井":"seijoishii.co.jp","ヤオコー":"yaoko-net.com","ベルク":"belc.jp","マルエツ":"maruetsu.co.jp","ダイエー":"daiei.co.jp","西友":"seiyu.co.jp","平和堂":"heiwado.jp","イズミ":"izumi.co.jp","オイシックス・ラ・大地":"oisixradaichi.co.jp","千趣会":"senshukai.co.jp",
    "日本郵船":"nyk.com","商船三井":"mol.co.jp","川崎汽船":"kline.co.jp","名村造船所":"namura.co.jp","ヤマトホールディングス":"yamato-hd.co.jp","SGホールディングス":"sg-hldgs.co.jp","佐川急便":"sagawa-exp.co.jp","日本通運":"nipponexpress.com","近鉄エクスプレス":"kwe.com","三井倉庫ホールディングス":"mitsui-soko.com","住友倉庫":"sumitomo-soko.co.jp","三菱倉庫":"mitsubishi-logistics.co.jp","セイノーホールディングス":"seino.co.jp","福山通運":"fukutsu.co.jp","ハマキョウレックス":"hamakyorex.co.jp","センコーグループホールディングス":"senko.co.jp","鴻池運輸":"konoike.net","成田国際空港":"naa.jp","JR貨物":"jrfreight.co.jp",
    "リクルート":"recruit.co.jp","パーソルホールディングス":"persol-group.co.jp","パソナグループ":"pasonagroup.co.jp","エン・ジャパン":"en-japan.com","マイナビ":"mynavi.jp","ディップ":"dip-net.co.jp","レバレジーズ":"leverages.jp","JAC Recruitment":"jac-recruitment.jp","アウトソーシング":"outsourcing.co.jp","UTグループ":"ut-g.co.jp","ウィルグループ":"willgroup.co.jp",
    "ADKホールディングス":"adk.jp","東急エージェンシー":"tokyu-agc.co.jp","ジェイアール東日本企画":"jeki.co.jp","読売広告社":"yomiko.co.jp","ベクトル":"vectorinc.co.jp","共同ピーアール":"kyodo-pr.co.jp",
    "朝日新聞社":"asahi.com","読売新聞社":"yomiuri.co.jp","毎日新聞社":"mainichi.co.jp","産業経済新聞社":"sankei.co.jp","日本経済新聞社":"nikkei.co.jp","共同通信社":"kyodonews.jp","時事通信社":"jiji.com","NHK":"nhk.or.jp","日本テレビホールディングス":"ntvhd.co.jp","TBSホールディングス":"tbsholdings.co.jp","フジ・メディア・ホールディングス":"fujimediahd.co.jp","テレビ朝日ホールディングス":"tv-asahihd.co.jp","テレビ東京ホールディングス":"txhd.co.jp","WOWOW":"wowow.co.jp","スカパーJSAT":"skyperfectjsat.space","TOKYO MX":"mxtv.co.jp","毎日放送":"mbs.jp","朝日放送グループホールディングス":"asahi.co.jp",
    "日本マクドナルドホールディングス":"mcdonalds.co.jp","ゼンショーホールディングス":"zensho.co.jp","コロワイド":"colowide.co.jp","くら寿司":"kurasushi.co.jp","FOOD&LIFE COMPANIES":"food-and-life.co.jp","王将フードサービス":"ohsho.co.jp","松屋フーズホールディングス":"matsuyafoods.co.jp","吉野家ホールディングス":"yoshinoya-holdings.com","ロイヤルホールディングス":"royal-holdings.co.jp","モスフードサービス":"mos.co.jp","ドトール・日レスホールディングス":"doutor.co.jp","スターバックスコーヒージャパン":"starbucks.co.jp","タリーズコーヒージャパン":"tullys.co.jp","コメダ":"komeda.co.jp","クリエイト・レストランツ・ホールディングス":"createrestaurants.com","ワタミ":"watami.co.jp","リンガーハット":"ringerhut.co.jp","幸楽苑ホールディングス":"kourakuen.co.jp","物語コーポレーション":"monogatari.co.jp","木曽路":"kisoji.co.jp","サイゼリヤ":"saizeriya.co.jp","ジョイフル":"joyfull.co.jp",
    "ファンケル":"fancl.co.jp","DHC":"dhc.co.jp","ノエビアホールディングス":"noevirholdings.co.jp","ポーラ":"pola.co.jp","オルビス":"orbis.co.jp","アルビオン":"albion.co.jp",
    "学研ホールディングス":"gakken.co.jp","ナガセ":"nagase.co.jp","河合塾":"kawai-juku.ac.jp","駿台予備学校":"sundai.ac.jp","Z会":"zkai.co.jp","早稲田アカデミー":"waseda-ac.co.jp","TAC":"tac-school.co.jp","資格の大原":"o-hara.jp","ECC":"ecc.jp","明光ネットワークジャパン":"meikonet.co.jp","リソー教育":"riso-kyoikugroup.com","ヒューマンアカデミー":"athuman.com","ベネッセコーポレーション":"benesse.co.jp","公文教育研究会":"kumon.ne.jp",
    "コナミグループ":"konami.com","スクウェア・エニックス・ホールディングス":"hd.square-enix.com","コーエーテクモホールディングス":"koeitecmo.co.jp","東映":"toei.co.jp","松竹":"shochiku.co.jp","角川映画":"kadokawa-pictures.jp","ソニー・ミュージックエンタテインメント":"sme.co.jp","エイベックス":"avex.com","アミューズ":"amuse.co.jp","ホリプロ":"horipro.co.jp","研音":"ken-on.co.jp","スターダストプロモーション":"stardust.co.jp","吉本興業":"yoshimoto.co.jp","小学館":"shogakukan.co.jp","新潮社":"shinchosha.co.jp","文藝春秋":"bunshun.co.jp","幻冬舎":"gentosha.co.jp","早川書房":"hayakawa-online.co.jp","東洋経済新報社":"toyokeizai.net","ダイヤモンド社":"diamond.co.jp","日経BP":"nikkeibp.co.jp",
    "スカイマーク":"skymark.co.jp","Peach Aviation":"flypeach.com","ジェットスター・ジャパン":"jetstar.com","ソラシドエア":"solaseedair.jp","スターフライヤー":"starflyer.jp","JR北海道":"jrhokkaido.co.jp","JR九州":"jrkyushu.co.jp","JR四国":"jr-shikoku.co.jp","東京地下鉄(東京メトロ)":"tokyometro.jp","小田急電鉄":"odakyu.jp","東急電鉄":"tokyu.co.jp","京王電鉄":"keio.co.jp","京急電鉄":"keikyu.co.jp","京成電鉄":"keisei.co.jp","西武鉄道":"seiburailway.jp","東武鉄道":"tobu.co.jp","名古屋鉄道":"meitetsu.co.jp","近鉄":"kintetsu.co.jp","南海電気鉄道":"nankai.co.jp","阪急電鉄":"hankyu.co.jp","阪神電気鉄道":"hanshin.co.jp","京阪電気鉄道":"keihan.co.jp","西日本鉄道":"nishitetsu.jp","大阪市高速電気軌道(Osaka Metro)":"osakametro.co.jp",
    "UBS証券":"ubs.com","シティグループ証券":"citigroup.com","ドイツ証券":"db.com","クレディ・スイス証券":"credit-suisse.com","バークレイズ証券":"barclays.com","BNPパリバ証券":"bnpparibas","HSBC証券":"hsbc.com","KKRジャパン":"kkr.com","カーライル・ジャパン":"carlyle.com","ベインキャピタル・ジャパン":"baincapital.com","ブラックストーン・グループ・ジャパン":"blackstone.com","アポロ・グローバル・マネジメント":"apollo.com","JAFCO":"jafco.co.jp","グロービス・キャピタル・パートナーズ":"globiscapital.co.jp",
    "三菱総合研究所":"mri.co.jp","日本総合研究所":"jri.co.jp","大和総研":"dir.co.jp","三菱UFJリサーチ&コンサルティング":"murc.jp","みずほリサーチ&テクノロジーズ":"mizuho-rt.co.jp","識学":"shikigaku.jp",
    "アップル ジャパン":"apple.com","Oracle Japan":"oracle.com","SAP Japan":"sap.com","シスコシステムズ合同会社":"cisco.com","VMware Japan":"vmware.com","デル・テクノロジーズ":"dell.com","IBM Japan":"ibm.com","Palo Alto Networks Japan":"paloaltonetworks.com","CrowdStrike Japan":"crowdstrike.com","Splunk Japan":"splunk.com","Datadog Japan":"datadoghq.com","MongoDB Japan":"mongodb.com","Snowflake合同会社":"snowflake.com","Databricks Japan":"databricks.com","GitHub Japan":"github.com","GitLab Japan":"gitlab.com","Atlassian Japan":"atlassian.com","Slack Japan":"slack.com","Zoom Japan":"zoom.us","Box Japan":"box.com","Dropbox Japan":"dropbox.com","Stripe Japan":"stripe.com","Coinbase Japan":"coinbase.com","Tesla Japan":"tesla.com","OpenAI Japan":"openai.com","Anthropic Japan":"anthropic.com","NVIDIA Japan":"nvidia.com","AMD Japan":"amd.com","Intel Japan":"intel.com","Qualcomm Japan":"qualcomm.com","Arm Japan":"arm.com","Bloomberg L.P.":"bloomberg.com","S&P Global Japan":"spglobal.com","Moody's Japan":"moodys.com","MSCI Japan":"msci.com","メタ・プラットフォームズ ジャパン":"meta.com","ServiceNow Japan":"servicenow.com",
    "弁護士ドットコム":"bengo4.com","メドピア":"medpeer.co.jp","PR TIMES":"prtimes.co.jp","じげん":"zigexn.co.jp","ウェルスナビ":"wealthnavi.com","FOLIO":"folio-sec.com","PKSHA Technology":"pkshatech.com","ABEJA":"abejainc.com","プレイド":"plaid.co.jp","ヤプリ":"yappli.co.jp","SmartHR":"smarthr.co.jp","アンドパッド":"andpad.co.jp","Visional":"visional.inc","GMOペパボ":"pepabo.com","GMOペイメントゲートウェイ":"gmo-pg.com","LayerX":"layerx.co.jp","マネーフォワード X":"moneyforward.com",
    "INPEX":"inpex.co.jp","石油資源開発":"japex.co.jp","ENEOSホールディングス":"hd.eneos.co.jp","出光興産":"idemitsu.com","コスモエネルギーホールディングス":"cosmo-energy.co.jp","電源開発(J-POWER)":"jpower.co.jp","九電工":"kyudenko.co.jp","関電工":"kandenko.co.jp","きんでん":"kinden.co.jp",
  };

  let domain = null;
  if (company.website) {
    try { domain = new URL(company.website.startsWith("http") ? company.website : "https://" + company.website).hostname.replace("www.", ""); } catch {}
  }
  if (!domain) domain = KNOWN_DOMAINS[company.name] || null;

  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}?size=${size >= 48 ? 128 : 64}` : null;
  const faviconUrl  = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${size >= 48 ? 128 : 64}` : null;
  const srcUrl      = imgStage === 0 ? clearbitUrl : imgStage === 1 ? faviconUrl : null;
  const showFavicon = !!(domain && srcUrl && imgStage < 2);

  // フォールバック：文字ロゴ
  const name = company.name || "";
  let initial = "";
  if (/^[A-Za-z0-9]/.test(name)) {
    initial = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  } else {
    initial = name.slice(0, 1);
  }
  const fontSize = size <= 28 ? 11 : size <= 36 ? 14 : size <= 48 ? 18 : 22;

  if (showFavicon) {
    return (
      <div style={{
        width: size, height: size,
        borderRadius: size <= 28 ? 6 : 8,
        background: "#fff",
        border: "1px solid #E5E7EB",
        display:"flex", alignItems:"center", justifyContent:"center",
        flexShrink: 0,
        overflow:"hidden",
      }}>
        <img
          src={srcUrl}
          alt=""
          width={Math.round(size * (imgStage === 0 ? 0.82 : 0.7))}
          height={Math.round(size * (imgStage === 0 ? 0.82 : 0.7))}
          style={{ objectFit:"contain" }}
          onError={() => setImgStage(st => st + 1)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div style={{
      width: size, height: size,
      borderRadius: size <= 28 ? 6 : 8,
      background: theme.bg,
      color: theme.color,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontWeight: "bold",
      fontSize: fontSize,
      fontFamily: "\"Zen Kaku Gothic New\", sans-serif",
      letterSpacing: initial.length > 1 ? "-0.04em" : "0",
      flexShrink: 0,
      boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
    }}>
      {initial}
    </div>
  );
}

function NaiteiTimeline({ posts, companies, go, isMobile }) {
  // 最終結果が内定/内定辞退の interview だけ抽出（最新10件）
  const naiteiPosts = posts
    .filter(p => p.ptype === "interview" && (p.finalResult === "内定" || p.finalResult === "内定辞退"))
    .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 10);

  if (naiteiPosts.length === 0) return null;

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return Math.floor(diff) + "秒前";
    if (diff < 3600) return Math.floor(diff/60) + "分前";
    if (diff < 86400) return Math.floor(diff/3600) + "時間前";
    if (diff < 604800) return Math.floor(diff/86400) + "日前";
    return d.toLocaleDateString("ja-JP", { month:"numeric", day:"numeric" });
  };

  return (
    <section style={{
      background:"linear-gradient(135deg, #FFF8E7 0%, #FEF3C7 100%)",
      border:"2px solid #F59E0B",
      borderRadius:12,
      padding: isMobile ? "16px 18px" : "20px 24px",
      marginBottom:20,
      position:"relative",
      overflow:"hidden",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <span style={{ fontSize:24 }}>🎉</span>
        <h2 style={{ fontSize:isMobile ? 14 : 16, fontWeight:"bold", color:"#92400E", flex:1 }}>
          内定速報タイムライン
        </h2>
        <span style={{ background:"#DC2626", color:"#fff", fontSize:10, padding:"3px 10px", fontWeight:"bold", borderRadius:14, display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ width:6, height:6, background:"#fff", borderRadius:"50%", animation:"pulse 1.5s ease-in-out infinite" }} />
          LIVE
        </span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:isMobile ? 280 : 320, overflowY:"auto" }}>
        {naiteiPosts.map(p => {
          const co = companies.find(c => c.id === p.companyId);
          if (!co) return null;
          return (
            <div key={p.id} style={{
              background:"rgba(255,255,255,0.85)",
              border:"1px solid rgba(245,158,11,0.3)",
              borderRadius:8,
              padding:"10px 14px",
              cursor:"pointer",
              display:"flex",
              alignItems:"center",
              gap:10,
              flexWrap:"wrap",
            }} onClick={() => go("company", co, "interview")}>
              <span style={{ fontSize:11, color:"#92400E", fontWeight:"bold", minWidth:64 }}>{fmtTime(p.createdAt)}</span>
              <span style={{
                background: p.finalResult === "内定" ? "#16A34A" : "#0891B2",
                color:"#fff",
                fontSize:10,
                padding:"2px 8px",
                fontWeight:"bold",
                borderRadius:4,
              }}>
                {p.finalResult === "内定" ? "🎉 内定" : "💼 内定辞退"}
              </span>
              <span style={{ fontSize:13, fontWeight:"bold", color:C.ink }}>{co.name}</span>
              {p.jobCategory && p.jobCategory !== "全職種" && (
                <span style={{ fontSize:10, background:"#EFF6FF", color:"#1E40AF", padding:"1px 7px", borderRadius:3 }}>{p.jobCategory}</span>
              )}
              {p.offerAmount && (
                <span style={{ fontSize:11, color:"#16A34A", fontWeight:"bold" }}>
                  年収{p.offerAmount}万円
                </span>
              )}
              {p.prevSalary && p.offerAmount && (
                <span style={{ fontSize:10, color:C.sub }}>
                  ({p.prevSalary}万円→{p.offerAmount}万円)
                </span>
              )}
              <span style={{ fontSize:18, marginLeft:"auto" }}>🎊</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize:10, color:"#92400E", marginTop:10, textAlign:"center" }}>
        ↑ 最新の内定情報をリアルタイム表示中
      </p>
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
    </section>
  );
}

function SubTopPage({ go, goSubTop, grp, companies, posts, reviews, salaries, coPosts, coRevs, coSals, isAdmin, adminDelete, setEditTgt, setGrpFilter, setSubFilter, isMobile, sess, setAuthMode }) {
  const theme = GROUP_THEMES[grp] || { bg:"linear-gradient(135deg, #2B7BD1 0%, #4A95E5 100%)", emoji:"🏢", catch:grp, desc:grp + "の選考情報" };
  const grpCos = companies.filter(c => (c.group || getGroup(c.industry)) === grp);
  const grpPosts = posts.filter(p => grpCos.some(c => c.id === p.companyId));
  const grpReviews = reviews.filter(r => grpCos.some(c => c.id === r.companyId));

  // 業種内人気企業（投稿数 + sortRank）
  const topInGroup = [...grpCos].sort((a,b) => {
    const aAct = (coPosts(a.id).length + coRevs(a.id).length) * 100 - (a.sortRank || 99999);
    const bAct = (coPosts(b.id).length + coRevs(b.id).length) * 100 - (b.sortRank || 99999);
    return bAct - aAct;
  }).slice(0, 12);

  // サブカテゴリ
  const subs = INDUSTRY_GROUPS[grp] || [];

  return (
    <div>
      {/* ヒーロー（業種写真＋ブランドグラデーション） */}
      <section style={{ position:"relative", overflow:"hidden", borderRadius:18, marginTop:14, marginBottom:24,
        background: theme.img ? ("linear-gradient(105deg, " + C.accentDark + "F2 0%, " + C.accentDark + "C2 44%, " + C.accent + "82 100%), url(" + theme.img + ")") : ("linear-gradient(135deg, " + C.accentDark + " 0%, " + C.accent + " 100%)"), backgroundSize:"cover", backgroundPosition:"center", color:"#fff",
        padding: isMobile ? "30px 22px" : "46px 42px" }}>
        {!theme.img && <span aria-hidden="true" style={{ position:"absolute", right: isMobile ? -14 : 24, top:"50%", transform:"translateY(-50%)", fontSize: isMobile ? 130 : 190, opacity:0.10, lineHeight:1, userSelect:"none", pointerEvents:"none" }}>{theme.emoji}</span>}
        <div aria-hidden="true" style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)", backgroundSize:"18px 18px", opacity:0.55, pointerEvents:"none" }} />
        <div style={{ position:"relative", zIndex:1, maxWidth:780 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:7, background:"rgba(255,255,255,0.16)", borderRadius:20, padding:"4px 13px", fontSize:11.5, fontWeight:"bold", letterSpacing:"0.04em", marginBottom:14 }}>{theme.emoji} {grp}</span>
          <h1 style={{ fontFamily:"'Zen Kaku Gothic New', sans-serif", fontWeight:900, fontSize: isMobile ? 26 : 38, lineHeight:1.3, marginBottom:12, letterSpacing:"0.01em" }}>{theme.catch}</h1>
          <p style={{ fontSize: isMobile ? 13 : 15, lineHeight:1.8, opacity:0.92, maxWidth:600, marginBottom:22 }}>{theme.desc}</p>
          <div style={{ display:"flex", gap: isMobile ? 26 : 40 }}>
            {[[grpCos.length, "掲載企業"], [grpPosts.length, "体験談"], [grpReviews.length, "口コミ"]].map(([n, l]) => (
              <div key={l}>
                <div className="tabnum" style={{ fontFamily:"'Zen Kaku Gothic New', sans-serif", fontWeight:900, fontSize: isMobile ? 24 : 31, lineHeight:1 }}>{n}</div>
                <div style={{ fontSize:10.5, opacity:0.85, marginTop:5, letterSpacing:"0.05em" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* サブカテゴリで絞り込み */}
      {subs.length > 0 && (
        <section style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:14, fontWeight:"bold", marginBottom:10, color:C.ink }}>業種で絞り込む</h2>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            <button style={{ ...S.chip, ...S.chipOn }} onClick={() => { setGrpFilter(grp); setSubFilter(""); go("companies"); }}>すべて</button>
            {subs.map(s => (
              <button key={s} style={{ ...S.chip }} onClick={() => { setGrpFilter(grp); setSubFilter(s); go("companies"); }}>{s}</button>
            ))}
          </div>
        </section>
      )}

      {/* 注目企業（業種内Top） */}
      <section style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:16, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"3px solid " + C.accent, color:C.ink }}>
          注目の企業
        </h2>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:12 }}>
          {topInGroup.map(co => {
            const a = calcAvg(coRevs(co.id));
            const sal = calcAvgSal(coSals(co.id));
            const postCount = coPosts(co.id).length;
            return (
              <div key={co.id} style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"14px 16px", cursor:"pointer", transition:"all .15s" }} onClick={() => go("company", co)}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <CompanyLogo company={co} size={36} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:"bold", color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{co.name}</div>
                    <div style={{ fontSize:10, color:C.sub }}>{co.industry}</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, fontSize:11, color:C.sub }}>
                  {a && <span>★ <strong style={{ color:C.accent }}>{a.overall.toFixed(1)}</strong></span>}
                  {sal && <span>{sal}万円</span>}
                  {postCount > 0 && <span>体験談{postCount}件</span>}
                </div>
              </div>
            );
          })}
        </div>
        <button style={{ ...S.secondaryBtn, marginTop:12 }} onClick={() => { setGrpFilter(grp); setSubFilter(""); go("companies"); }}>
          {grp}の企業をすべて見る →
        </button>
      </section>

      {/* 最新の体験談・口コミ */}
      <section style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:16, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"3px solid " + C.accent, color:C.ink }}>
          {grp}の最新投稿
        </h2>
        {grpPosts.slice(0, 5).length === 0
          ? <Empty text="まだ投稿がありません" />
          : grpPosts.slice(0, 5).map(p => (
              <PostCard key={p.id} post={p} co={companies.find(c => c.id === p.companyId)} go={go} isAdmin={isAdmin} onDelete={adminDelete} onEdit={d => setEditTgt({ type:"post", data:d })} />
            ))
        }
      </section>

      {/* 他の業種へ */}
      <section style={{ marginBottom:24, background:"#FAFCFE", padding:"20px 24px", borderRadius:12, border:"1px solid " + C.border }}>
        <h2 style={{ fontSize:14, fontWeight:"bold", marginBottom:12, color:C.ink }}>他の業界も見る</h2>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {ALL_GROUPS.filter(g => g !== grp).map(g => (
            <button key={g} style={{ background:"#fff", border:"1px solid " + C.border, padding:"6px 14px", fontSize:12, cursor:"pointer", fontFamily:"inherit", borderRadius:18, color:C.ink }} onClick={() => goSubTop(g)}>
              {GROUP_THEMES[g]?.emoji || "🏢"} {g}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ThreadPage({ post, posts, companies, go, goThread, uName, authUser, isAdmin, onAddComment, onToggleLike, adminDelete, getAuthorBadge, favorites, toggleFavorite, setBestAnswer, isMobile, setAuthMode, setGuestName }) {
  const live = posts.find(x => x.id === post.id) || post;
  const p = live;
  const co = companies.find(c => c.id === p.companyId);
  const isGen = p.companyId === GENERAL_ID;
  const isQuestion = p.ptype === "board";
  const authUserKey = authUser?.uid || ("guest:" + uName);
  const canMarkBest = isQuestion && ((authUser && p.authorUid === authUser.uid) || isAdmin);
  const ptypeLabel = isGen ? "相談" : p.ptype === "es" ? "ES例文" : p.ptype === "board" ? "選考掲示板" : "面接体験談";
  return (
    <div style={{ maxWidth:760, margin:"0 auto" }}>
      <button onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? window.history.back() : go("home"))}
        style={{ background:"none", border:"none", color:C.accent, fontSize:13, fontWeight:"bold", cursor:"pointer", fontFamily:"inherit", margin:"16px 0 12px", padding:0 }}>← もどる</button>

      <article style={{ background:C.surface, border:"1px solid " + C.border, borderRadius:14, padding: isMobile ? "18px 18px" : "22px 24px", boxShadow:"0 1px 2px rgba(28,43,58,.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, fontWeight:"bold", padding:"2px 8px", borderRadius:5, background: isGen ? "#FBEAE4" : "#EAF1F8", color: isGen ? C.warmAccent : C.accent }}>{ptypeLabel}</span>
          {co
            ? <span onClick={() => go("company", co, p.ptype || "interview")} style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12.5, color:C.sub, fontWeight:500, cursor:"pointer" }}><CompanyLogo company={co} size={18} />{co.name}</span>
            : <span style={{ fontSize:11, fontWeight:"bold", color:C.accentDark, background:C.light, border:"1px dashed #BCD2E6", borderRadius:5, padding:"1px 7px" }}>📣 みんなの相談</span>}
          {p.bestAnswerId && <span style={{ fontSize:11, fontWeight:"bold", color:C.success, background:"#E8F1EB", border:"1px solid #BFDCC8", borderRadius:5, padding:"1px 8px" }}>\u2705 解決済み</span>}
          <span style={{ marginLeft:"auto", fontSize:11.5, color:C.sub }}>{ago(p.createdAt)}</span>
        </div>

        <h1 style={{ fontFamily:"'Zen Kaku Gothic New', sans-serif", fontWeight:900, fontSize: isMobile ? 20 : 23, lineHeight:1.45, color:C.ink, marginBottom:12 }}>{p.title}</h1>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <AC>{ini(p.author)}</AC>
          <span style={{ fontSize:12.5, fontWeight:"bold", color:C.ink }}>{p.author}</span>
          <VerifyBadge v={p.authorVerify} />
          <PosterId id={p.posterId} seed={p.authorUid || ("anon:" + (p.author || "?") + ":" + (p.id || ""))} />
          {getAuthorBadge && getAuthorBadge(p.authorUid) && <BadgeChip badge={getAuthorBadge(p.authorUid)} small />}
        </div>

        {p.ptype === "es" && p.esQuestion && (
          <div style={{ background:"#FFF8E7", borderLeft:"3px solid " + C.warmAccent, padding:"8px 12px", marginBottom:10, fontSize:12.5, lineHeight:1.7 }}>
            <strong style={{ color:"#92400E", display:"block", marginBottom:2 }}>📝 設問：</strong>{p.esQuestion}
          </div>
        )}

        {p.ptype === "interview" && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
            {(p.finalResult === "内定" || p.finalResult === "内定辞退") && (
              <span style={{ background: p.finalResult === "内定" ? C.success : "#0891B2", color:"#fff", padding:"3px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>{p.finalResult}</span>
            )}
            {p.progressStage && <span style={{ background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"3px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>{p.progressStage}</span>}
            {p.applyMethod && <span style={{ background:"#FFF7ED", color:"#C2410C", border:"1px solid #FED7AA", padding:"3px 10px", fontSize:11, borderRadius:3 }}>応募: {p.applyMethod}</span>}
          </div>
        )}
        {p.ptype === "interview" && (p.prevSalary || p.offerAmount) && (
          <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"10px 14px", borderRadius:6, marginBottom:12, fontSize:13, fontWeight:"bold", color:"#0C4A6E" }}>
            {p.prevSalary && <span>現年収: {p.prevSalary}万円</span>}
            {p.prevSalary && p.offerAmount && <span style={{ margin:"0 8px", color:C.accent }}>→</span>}
            {p.offerAmount && <span>オファー年収: {p.offerAmount}万円</span>}
          </div>
        )}
        {p.ptype === "interview" && ((p.stages && p.stages.length > 0) || (p.extraStages && p.extraStages.length > 0)) && (
          <div style={{ marginBottom:12 }}>
            {(p.stages || []).map((stg, i) => (
              <div key={i} style={{ borderLeft:"3px solid " + C.accent, paddingLeft:10, marginBottom:8 }}>
                <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:"bold", color:C.accent }}>{stg.name}</span>
                  {stg.days && <span style={{ fontSize:10, color:C.sub }}>結果通知: {stg.days}</span>}
                </div>
                {stg.content && <p style={{ fontSize:12.5, lineHeight:1.8, color:C.ink }}>{stg.content}</p>}
              </div>
            ))}
            {(p.extraStages || []).filter(st => st.name && st.content).map((stg, i) => (
              <div key={"ex"+i} style={{ borderLeft:"3px dashed " + C.accent, paddingLeft:10, marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:"bold", color:C.accent }}>{stg.name}</span>
                {stg.content && <p style={{ fontSize:12.5, lineHeight:1.8, color:C.ink }}>{stg.content}</p>}
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize:14.5, lineHeight:1.95, color:"#33414F", whiteSpace:"pre-line", marginBottom:16 }}>{p.content}</p>

        <div style={{ display:"flex", alignItems:"center", gap:10, paddingTop:14, borderTop:"1px solid " + C.border, flexWrap:"wrap" }}>
          <LikeButton liked={(p.likes || []).includes(authUserKey)} count={(p.likes || []).length} onClick={() => onToggleLike(p.id)} />
          <button style={{ background:"#fff", border:"1px solid " + C.border, fontSize:12, cursor:"pointer", fontFamily:"inherit", color: favorites && favorites.includes(p.id) ? "#E8A000" : C.sub, padding:"6px 12px", borderRadius:18 }} onClick={() => toggleFavorite && toggleFavorite(p.id)}>
            {favorites && favorites.includes(p.id) ? "\u2605 保存済み" : "\u2606 保存"}
          </button>
        </div>
      </article>

      {isQuestion && (
        <div style={{ marginTop:18, marginBottom:4, fontSize:13, color: p.bestAnswerId ? C.success : C.sub, fontWeight:"bold" }}>
          {p.bestAnswerId ? "\u2705 この相談は解決済みです" : (canMarkBest ? "💡 参考になった回答を「ベストアンサー」に設定すると解決済みになります" : "")}
        </div>
      )}

      <div style={{ marginTop: isQuestion ? 4 : 18 }}>
        <CommentThread
          post={p}
          uName={uName}
          authUserKey={authUserKey}
          authUser={authUser}
          isAdmin={isAdmin}
          onAddComment={onAddComment}
          adminDelete={adminDelete}
          getAuthorBadge={getAuthorBadge}
          bestAnswerId={p.bestAnswerId}
          onSetBestAnswer={(commentId) => setBestAnswer(p, commentId)}
          canMarkBest={canMarkBest}
          onSetGuestName={setGuestName}
          group={co && co.group}
        />
      </div>
    </div>
  );
}

function GeneralBoardPage({ posts, go, uName, onAddPost, onToggleLike, onAddComment, isAdmin, adminDelete, setEditTgt, favorites, toggleFavorite, sess, setAuthMode, unlocked, getAuthorBadge, authUser, isMobile, goThread, setGuestName }) {
  const genPosts = posts.filter(p => p.companyId === GENERAL_ID);
  return (
    <div>
      <section style={{ marginTop:16, marginBottom:18, display:"flex", alignItems:"center", gap:13 }}>
        <span style={{ fontSize: isMobile ? 30 : 36 }}>📣</span>
        <div>
          <h1 style={{ fontFamily:"'Zen Kaku Gothic New', sans-serif", fontWeight:900, fontSize: isMobile ? 22 : 27, color:C.ink, lineHeight:1.3 }}>みんなの相談</h1>
          <p style={{ fontSize:12.5, color:C.sub, marginTop:3, lineHeight:1.7 }}>会社をまたぐ相談・雑談はここで。「外資とメガバンクどっち？」「退職理由どう話す？」「エージェントどこが当たり？」など、特定の企業に紐づかない話題を気軽に。</p>
        </div>
      </section>
      <PostsTab posts={genPosts} ptype="board" label="相談" co={GENERAL_CO}
        uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment}
        isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt}
        favorites={favorites} toggleFavorite={toggleFavorite} jobCat="全職種"
        sess={sess} setAuthMode={setAuthMode} unlocked={unlocked} getAuthorBadge={getAuthorBadge}
        authUser={authUser} hideBoardNotice={true} goThread={goThread} setGuestName={setGuestName} />
    </div>
  );
}

function HomePage({ sess, go, goSubTop, companies, posts, reviews, salaries, isAdmin, adminDelete, setEditTgt, coPosts, coRevs, coSals, isMobile, setAuthMode, doGlobalSearch, goThread }) {
  const [feed, setFeed]       = useState("new");
  const [visible, setVisible] = useState(12);
  const FEEDS = [["new","新着"],["hot","盛り上がり"],["general","みんなの相談"],["board","選考掲示板"],["interview","面接体験談"],["naitei","内定・オファー"]];

  let list = [...posts];
  if      (feed === "general")   list = list.filter(p => p.companyId === GENERAL_ID);
  else if (feed === "board")     list = list.filter(p => p.ptype === "board" && p.companyId !== GENERAL_ID);
  else if (feed === "interview") list = list.filter(p => p.ptype === "interview");
  else if (feed === "es")        list = list.filter(p => p.ptype === "es");
  else if (feed === "naitei")    list = list.filter(p => p.ptype === "interview" && (p.finalResult === "内定" || p.finalResult === "内定辞退"));
  if (feed === "hot") list.sort((a,b) => ((b.likes?.length||0)+(b.comments?.length||0)) - ((a.likes?.length||0)+(a.comments?.length||0)));
  else                list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  const shown = list.slice(0, visible);

  const topCos = [...companies].sort((a,b) => {
    const aAct = coRevs(a.id).length + coPosts(a.id).length;
    const bAct = coRevs(b.id).length + coPosts(b.id).length;
    if (aAct !== bAct) return bAct - aAct;
    return (a.sortRank || 99999) - (b.sortRank || 99999);
  }).slice(0, 8);

  const ptypeMeta = p =>
    p.ptype === "board" ? { label:"選考掲示板", bg:"#EAF1F8", fg:C.accent }
    : p.ptype === "es"  ? { label:"ES例文",   bg:"#EDE8F4", fg:"#6B4FA6" }
    : { label:"面接体験談", bg:"#F1ECDB", fg:"#9A7B12" };

  const Thread = ({ p }) => {
    const co = companies.find(c => c.id === p.companyId);
    const isGen = p.companyId === GENERAL_ID;
    const m  = isGen ? { label:"相談", bg:"#FBEAE4", fg:C.warmAccent } : ptypeMeta(p);
    const replies = (p.comments || []).length;
    const likes   = (p.likes || []).length;
    const hot     = likes >= 5 || replies >= 5;
    return (
      <article onClick={() => goThread(p)}
        style={{ position:"relative", display:"flex", gap:13, background:C.surface,
          border:"1px solid " + C.border, borderLeft:"4px solid " + (hot ? C.warmAccent : C.border),
          borderRadius:12, padding:"15px 16px", marginBottom:11, cursor:"pointer" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, fontWeight:"bold", padding:"2px 8px", borderRadius:5, background:m.bg, color:m.fg }}>{m.label}</span>
            {co
              ? <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, color:C.sub, fontWeight:500 }}><CompanyLogo company={co} size={16} />{co.name}</span>
              : <span style={{ fontSize:11, fontWeight:"bold", color:C.accentDark, background:C.light, border:"1px dashed #BCD2E6", borderRadius:5, padding:"1px 7px" }}>📣 みんなの相談</span>}
            <span style={{ marginLeft:"auto", fontSize:11, color:C.sub }}>{ago(p.createdAt)}</span>
          </div>
          <h3 style={{ fontSize:16, fontWeight:"bold", lineHeight:1.5, marginBottom:4, fontFamily:"'Zen Kaku Gothic New', sans-serif", color:C.ink }}>{p.title}{p.bestAnswerId && <span style={{ marginLeft:7, fontSize:10, fontWeight:"bold", color:C.success, background:"#E8F1EB", border:"1px solid #BFDCC8", borderRadius:5, padding:"1px 7px", verticalAlign:"middle" }}>✅ 解決済み</span>}</h3>
          <p style={{ fontSize:12.5, color:C.sub, lineHeight:1.65, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{p.content && p.content.slice(0,100)}</p>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:10, fontSize:12, color:"#94A0AC" }}>
            <span style={{ display:"flex", alignItems:"center", gap:6 }}><AC>{ini(p.author)}</AC>{p.author}<VerifyBadge v={p.authorVerify} /><PosterId id={p.posterId} seed={p.authorUid || ("anon:" + (p.author || "?") + ":" + (p.id || ""))} /></span>
            <span className="tabnum">♡ {likes}</span>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0, paddingLeft:8 }}>
          <span className="tabnum" style={{ fontFamily:"'Zen Kaku Gothic New', sans-serif", fontWeight:800, fontSize:18, lineHeight:1, color: hot ? C.warmAccent : C.ink }}>{replies}</span>
          <span style={{ fontSize:9.5, color:C.sub, marginTop:2 }}>返信</span>
        </div>
      </article>
    );
  };

  return (
    <div>
      {/* ステートメント・ヒーロー（写真なし／掲示板が主役） */}
      <section style={{ marginTop:16, marginBottom:18 }}>
        <h1 style={{ fontFamily:"'Zen Kaku Gothic New', sans-serif", fontWeight:900, fontSize: isMobile ? 21 : 26, lineHeight:1.4, letterSpacing:"0.01em", color:C.ink }}>
          会社の中の人と、<span style={{ color:C.accent }}>受けた人</span>が、ここで話す。
        </h1>
        <p style={{ color:C.sub, fontSize:13.5, marginTop:8, maxWidth:680, lineHeight:1.8 }}>
          面接の逆質問、退職理由の伝え方、年収交渉、エージェント選び — 企業をまたいだ相談も、企業ごとの選考情報も、ひとつの掲示板に。
        </p>
        <div style={{ position:"relative", maxWidth:560, marginTop:14 }}>
          <input type="text" placeholder="スレッド・企業名・キーワードで検索"
            onKeyDown={(e) => { if (e.key === "Enter" && doGlobalSearch) doGlobalSearch(e.target.value); }}
            style={{ width:"100%", padding:"12px 16px 12px 44px", background:C.surface, border:"1.5px solid " + C.border, borderRadius:24, fontSize:14, fontFamily:"inherit", outline:"none", color:C.ink }} />
          <span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", fontSize:16, color:C.sub }}>🔍</span>
        </div>
        <button onClick={() => go("board")} style={{ marginTop:14, background:C.warmAccent, color:"#fff", border:"none", padding:"11px 20px", fontSize:13.5, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer", borderRadius:10, boxShadow:"0 2px 8px rgba(224,81,47,0.28)" }}>📣 みんなに相談する（会社をまたいでOK）→</button>
      </section>

      {!sess && (
        <section style={{ background:C.warm, border:"1px solid #EBD9B8", borderRadius:10, padding: isMobile ? "14px 16px" : "16px 22px", marginBottom:18, display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontWeight:"bold", fontSize:14, color:"#7A5A12", marginBottom:2 }}>無料登録でできること</div>
            <div style={{ fontSize:12.5, color:"#8A6A1A", lineHeight:1.7 }}>✓ 口コミ・年収を全文閲覧 ✓ 体験談・相談を投稿 ✓ 気になる企業をフォロー</div>
          </div>
          <button style={{ background:C.warmAccent, color:"#fff", border:"none", padding:"10px 22px", fontSize:13, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer", borderRadius:9, whiteSpace:"nowrap" }} onClick={() => setAuthMode("register")}>無料会員登録 →</button>
        </section>
      )}

      {/* 内定速報（賑わいの可視化として上部に維持） */}
      <NaiteiTimeline posts={posts} companies={companies} go={go} isMobile={isMobile} />

      {/* 2カラム：左＝掲示板フィード（主役） / 右＝評価から探す（裏取り） */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap:24, alignItems:"start" }}>
        <section>
          <div style={{ display:"flex", gap:2, background:C.surface, border:"1px solid " + C.border, borderRadius:11, padding:3, marginBottom:14, overflowX:"auto" }}>
            {FEEDS.map(([k,l]) => (
              <button key={k} onClick={() => { setFeed(k); setVisible(12); }}
                style={{ padding:"7px 13px", fontSize:13, fontWeight:"bold", borderRadius:8, whiteSpace:"nowrap", border:"none", cursor:"pointer", fontFamily:"inherit",
                  background: feed===k ? C.accent : "transparent", color: feed===k ? "#fff" : C.sub }}>{l}</button>
            ))}
          </div>
          {shown.length === 0
            ? <Empty text="この条件の投稿はまだありません。最初の一件を投稿してみましょう。" />
            : shown.map(p => <Thread key={p.id} p={p} />)}
          {visible < list.length && (
            <button onClick={() => setVisible(v => v + 12)}
              style={{ width:"100%", border:"1px solid " + C.border, background:C.surface, borderRadius:10, padding:11, fontWeight:"bold", color:C.accentDark, fontSize:13.5, fontFamily:"inherit", cursor:"pointer", marginTop:4 }}>
              さらに表示（残り {list.length - visible} 件）
            </button>)}
        </section>

        {!isMobile && (
          <aside>
            <div style={{ background:C.surface, border:"1px solid " + C.border, borderRadius:12, padding:"16px 17px", marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:"bold", color:C.accent, letterSpacing:"0.08em", marginBottom:3 }}>EVIDENCE</div>
              <h3 style={{ fontSize:13.5, fontWeight:"bold", color:C.ink, marginBottom:4, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>企業の評価から探す</h3>
              <p style={{ fontSize:11, color:C.sub, marginBottom:12, lineHeight:1.6 }}>口コミ・年収・面接体験談を企業ごとに。気になる会社の裏取りに。</p>
              {ALL_GROUPS.map(grp => {
                const count = companies.filter(c => (c.group || getGroup(c.industry)) === grp).length;
                return (
                  <div key={grp} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid " + C.border, cursor:"pointer", fontSize:13 }} onClick={() => goSubTop(grp)}>
                    <span style={{ color:C.ink }}>{grp}</span>
                    <span className="tabnum" style={{ color:C.sub, fontSize:11 }}>{count}社</span>
                  </div>
                );
              })}
              <button style={{ width:"100%", border:"1px solid " + C.accent, color:C.accent, background:C.surface, fontWeight:"bold", fontSize:12.5, borderRadius:8, padding:8, marginTop:12, cursor:"pointer", fontFamily:"inherit" }} onClick={() => go("companies")}>企業一覧を見る →</button>
            </div>

            <div style={{ background:C.surface, border:"1px solid " + C.border, borderRadius:12, padding:"16px 17px", marginBottom:16 }}>
              <h3 style={{ fontSize:13.5, fontWeight:"bold", color:C.ink, marginBottom:10, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>🔥 注目の企業</h3>
              {topCos.map((co,i) => {
                const a   = calcAvg(coRevs(co.id));
                const sal = calcAvgSal(coSals(co.id));
                return (
                  <div key={co.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom: i<7 ? "1px solid " + C.border : "none", cursor:"pointer" }} onClick={() => go("company", co)}>
                    <span className="tabnum" style={{ fontSize:12, color: i<2 ? C.warmAccent : C.sub, fontWeight:"bold", width:16, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{i+1}</span>
                    <CompanyLogo company={co} size={28} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:"bold", color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{co.name}</div>
                      <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>
                        {a && <span style={{ color:C.warmAccent, fontWeight:"bold" }}>★{a.overall.toFixed(1)}</span>}
                        {a && sal && " · "}
                        {sal && <span className="tabnum">{sal}万円</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <TopContributors posts={posts} reviews={reviews} salaries={salaries} />
            <div style={{ marginTop:16 }} />
            <PopularPosters posts={posts} reviews={reviews} />
          </aside>
        )}
      </div>

      <section style={{ marginTop:32, padding:"20px 22px", background:C.surface, border:"1px solid " + C.border, borderRadius:12 }}>
        <h2 style={{ fontSize:14, fontWeight:"bold", marginBottom:12, color:C.ink, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>よく検索されるテーマ</h2>
        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
          {["面接の逆質問","退職理由の伝え方","年収交渉","エージェント比較","職務経歴書","円満退職","カウンターオファー","リファレンスチェック","残業の実態","第二新卒","入社後のギャップ","企業研究"].map(kw => (
            <span key={kw} style={{ background:C.light, color:C.accent, border:"1px solid " + C.border, padding:"4px 11px", fontSize:11.5, borderRadius:14, cursor:"pointer" }} onClick={() => go("companies")}>#{kw}</span>
          ))}
        </div>
      </section>
    </div>
  );
}


// ─── 企業一覧 ─────────────────────────────────────────────────────────────────
function CompaniesPage({ go, filtered, searchQ, setSearchQ, grpFilter, setGrpFilter, subFilter, setSubFilter, sortBy, setSortBy, coPosts, coRevs, coSals, isAdmin, adminDelete, setEditTgt, isMobile }) {
  const subs = grpFilter ? (INDUSTRY_GROUPS[grpFilter] || []) : [];
  return (
    <div>
      <PageHeader title="企業一覧" desc="業種・評価・年収で絞り込んで企業を探せます" />
      <div style={{ overflowX:"auto", marginBottom:8 }}>
        <div style={{ display:"flex", gap:4, paddingBottom:4, minWidth:"max-content" }}>
          <button style={{ ...S.chip, ...(grpFilter === "" ? S.chipOn : {}) }} onClick={() => { setGrpFilter(""); setSubFilter(""); }}>すべて</button>
          {ALL_GROUPS.map(grp => (
            <button key={grp} style={{ ...S.chip, ...(grpFilter === grp ? S.chipOn : {}) }} onClick={() => setGrpFilter(g => g === grp ? "" : grp)}>{(GROUP_THEMES[grp]?.emoji || "🏢") + " " + grp}</button>
          ))}
        </div>
      </div>
      {grpFilter && subs.length > 0 && (
        <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
          {subs.map(s => (
            <button key={s} style={{ border:"1px solid " + C.border, background: subFilter === s ? C.accent : "#F7F7F7", color: subFilter === s ? "#fff" : C.sub, padding:"3px 9px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setSubFilter(x => x === s ? "" : s)}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
        <input style={{ ...S.input, flex:"1 1 150px" }} placeholder="企業名で検索" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        <select style={{ ...S.input, width:"auto", flex:"0 0 auto" }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="posts">投稿数順</option>
          <option value="rating">評価順</option>
          <option value="salary">年収順</option>
        </select>
        <button style={S.primaryBtn} onClick={() => go("addCompany")}>＋ 企業追加</button>
      </div>
      <p style={{ fontSize:12, color:C.sub, marginBottom:10 }}>{filtered.length}社</p>
      {filtered.length === 0 ? <Empty text="該当する企業が見つかりません" /> : (
        isMobile ? (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(co => {
              const a   = calcAvg(coRevs(co.id));
              const sal = calcAvgSal(coSals(co.id));
              return (
                <div key={co.id} style={{ background:C.surface, padding:"12px", borderBottom:"1px solid " + C.border, cursor:"pointer" }} onClick={() => go("company", co)}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <CompanyLogo company={co} size={32} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</div>
                      <div style={{ fontSize:11, color:C.sub }}>{co.group || getGroup(co.industry)} &gt; {co.industry}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      {a && <div style={{ color:C.accent, fontWeight:"bold", fontSize:12 }}>★{a.overall.toFixed(1)}</div>}
                      {sal && <div style={{ color:"#1a5276", fontWeight:"bold", fontSize:12 }}>{sal}万</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>企業名</th>
                <th style={S.th}>業界</th>
                <th style={{ ...S.th, textAlign:"center" }}>評価</th>
                <th style={{ ...S.th, textAlign:"right" }}>平均年収</th>
                <th style={{ ...S.th, textAlign:"center" }}>体験談</th>
                <th style={{ ...S.th, textAlign:"center" }}>口コミ</th>
                {isAdmin && <th style={S.th} />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(co => {
                const a   = calcAvg(coRevs(co.id));
                const sal = calcAvgSal(coSals(co.id));
                return (
                  <tr key={co.id} style={{ ...S.tableRow, cursor:"pointer" }} onClick={() => go("company", co)}>
                    <td style={S.td}><div style={{ display:"flex", alignItems:"center", gap:8 }}><CompanyLogo company={co} size={28} /><span style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</span></div></td>
                    <td style={{ ...S.td, fontSize:12, color:C.sub }}>{co.industry}</td>
                    <td style={{ ...S.td, textAlign:"center", color:C.accent, fontWeight:"bold", fontSize:12 }}>{a ? ("★" + a.overall.toFixed(1)) : "-"}</td>
                    <td style={{ ...S.td, textAlign:"right", fontSize:12, fontWeight:"bold", color:"#1a5276" }}>{sal ? (sal + "万円") : "-"}</td>
                    <td style={{ ...S.td, textAlign:"center", fontSize:12 }}>{coPosts(co.id).length}件</td>
                    <td style={{ ...S.td, textAlign:"center", fontSize:12 }}>{coRevs(co.id).length}件</td>
                    {isAdmin && (
                      <td style={{ ...S.td, textAlign:"right" }} onClick={e => e.stopPropagation()}>
                        <SmBtn onClick={() => setEditTgt({ type:"company", data:co })}>編集</SmBtn>
                        <SmBtn red onClick={() => adminDelete("company", co.id)}>削除</SmBtn>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ─── 企業ページ ───────────────────────────────────────────────────────────────
function CompanyPage({ go, co, cposts, crevs, csals, cjobs, initTab, onToggleLike, onAddComment, onAddPost, onAddReview, onAddSalary, onAddJob, isAdmin, adminDelete, setEditTgt, plan, setAuthMode, isMobile, uName, favorites, toggleFavorite, sess, unlocked, getAuthorBadge, authUser, profile, toggleFollowCompany, goThread, setGuestName }) {
  const [tab,     setTab]     = useState(initTab || "interview");
  const [jobCat,  setJobCat]  = useState("全職種");
  useEffect(() => { if (initTab) setTab(initTab); }, [initTab]);

  // 職種フィルター
  const filterByJob = (posts) => jobCat === "全職種" ? posts : posts.filter(p => p.jobCategory === jobCat);

  const iv  = filterByJob(cposts.filter(p => p.ptype === "interview"));
  const bd  = filterByJob(cposts.filter(p => p.ptype === "board"));
  const a   = calcAvg(crevs);
  const sal = calcAvgSal(csals);

  const es = filterByJob(cposts.filter(p => p.ptype === "es"));
  // 選考者(求職者)向け / 在籍者向け の2グループに分離
  const tabsCandidate = [
    ["interview", "面接体験談", iv.length],
    ["board",     "選考掲示板", bd.length],
    ["es",        "ES例文",     es.length],
  ];
  const tabsEmployee = [
    ["review",    "在籍者による企業評価", crevs.length],
    ["salary",    "年収情報",             csals.length],
  ];
  const tabsOther = [
    ["jobs",      "募集要項", cjobs.length],
  ];
  const tabs = [...tabsCandidate, ...tabsEmployee, ...tabsOther];

  return (
    <div>
      <button style={{ background:"none", border:"none", color:C.accent, cursor:"pointer", fontSize:12, fontFamily:"inherit", marginTop:16, marginBottom:4, padding:0, textDecoration:"underline" }} onClick={() => go("companies")}>
        &larr; 企業一覧に戻る
      </button>
      <div style={{ borderTop:"3px solid " + C.ink, borderBottom:"1px solid " + C.border, padding:"16px 0", marginBottom:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <CompanyLogo company={co} size={isMobile ? 48 : 64} />
          <div style={{ flex:1 }}>
            <h1 style={{ fontWeight:"bold", fontFamily:"'Zen Kaku Gothic New', sans-serif", fontSize: isMobile ? 18 : 24 }}>{co.name}</h1>
            <p style={{ fontSize:12, color:C.sub, marginTop:3 }}>{co.group || getGroup(co.industry)} &gt; {co.industry}</p>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {a && (
              <div style={{ textAlign:"center", border:"1px solid " + C.border, padding:"10px 14px", minWidth:90 }}>
                <div style={{ fontSize:10, color:C.sub, marginBottom:3 }}>総合評価</div>
                <div style={{ fontSize:26, fontWeight:"bold", color:C.accent, fontFamily:"'Zen Kaku Gothic New', sans-serif", lineHeight:1 }}>{a.overall.toFixed(1)}</div>
                <Stars r={a.overall} size={11} />
              </div>
            )}
            {sal && (
              <div style={{ textAlign:"center", border:"1px solid " + C.border, padding:"10px 14px", minWidth:90 }}>
                <div style={{ fontSize:10, color:C.sub, marginBottom:3 }}>平均年収</div>
                <div style={{ fontSize:22, fontWeight:"bold", color:"#1a5276", fontFamily:"'Zen Kaku Gothic New', sans-serif", lineHeight:1 }}>{sal}<span style={{ fontSize:12, fontWeight:"normal" }}>万円</span></div>
                <div style={{ fontSize:10, color:C.sub, marginTop:3 }}>{csals.length}件</div>
              </div>
            )}
          </div>
          {isAdmin && (
            <div style={{ display:"flex", gap:4 }}>
              <SmBtn onClick={() => setEditTgt({ type:"company", data:co })}>編集</SmBtn>
              <SmBtn red onClick={() => adminDelete("company", co.id)}>削除</SmBtn>
            </div>
          )}
        </div>
      </div>
      {/* 職種別フィルター（既存カテゴリ＋投稿で使われた新職種） */}
      <div style={{ overflowX:"auto", margin:"12px 0 0 0", paddingBottom:4 }}>
        <div style={{ display:"flex", gap:4, minWidth:"max-content" }}>
          {(() => {
            const base = getJobCategories(co.group || co.industry);
            const usedInPosts = [...new Set(cposts.map(p => p.jobCategory).filter(Boolean))];
            const merged = [...base];
            usedInPosts.forEach(j => { if (!merged.includes(j) && j !== "全職種" && j !== "__custom__") merged.push(j); });
            return merged.map(jc => (
              <button key={jc} style={{ border:"1px solid " + C.border, background: jobCat===jc ? C.accent : "#F7F7F7", color: jobCat===jc ? "#fff" : C.sub, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }} onClick={() => setJobCat(jc)}>{jc}</button>
            ));
          })()}
        </div>
      </div>
      {/* セグメント（6タブ→3つに集約：みんなの投稿 / 企業の評価 / 募集要項） */}
      <div style={{ marginTop:14 }}>
        <div style={{ display:"flex", gap:6 }}>
          {[
            ["posts","みんなの投稿","掲示板・面接・ES","board"],
            ["eval","企業の評価","口コミ・年収","review"],
            ["jobs","募集要項","求人","jobs"],
          ].map(([seg,t,d,first]) => {
            const active = seg === "eval" ? (tab==="review"||tab==="salary") : seg === "jobs" ? tab==="jobs" : (tab==="interview"||tab==="board"||tab==="es");
            return (
              <button key={seg} onClick={() => setTab(first)}
                style={{ flex:1, background:"#fff", border:"1px solid " + (active ? C.accent : C.border), borderBottom:"none", borderRadius:"11px 11px 0 0", padding: isMobile ? "10px 6px" : "12px 10px", textAlign:"center", cursor:"pointer", fontFamily:"inherit", boxShadow: active ? ("inset 0 -3px 0 " + C.accent) : "none", position:"relative", top:1 }}>
                <span style={{ display:"block", fontSize: isMobile ? 13 : 14, fontWeight:"bold", color: active ? C.accentDark : C.ink, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{t}</span>
                {!isMobile && <span style={{ display:"block", fontSize:10.5, color:C.sub, marginTop:2 }}>{d}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ borderTop:"2px solid " + C.accent, paddingTop:14 }}>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:11.5, color:C.sub, marginRight:2 }}>表示</span>
            {(() => {
              const seg = (tab==="review"||tab==="salary") ? "eval" : tab==="jobs" ? "jobs" : "posts";
              const subs = seg === "eval" ? [["review","口コミ",crevs.length],["salary","年収",csals.length]]
                : seg === "jobs" ? [["jobs","募集要項",cjobs.length]]
                : [["board","選考掲示板",bd.length],["interview","面接体験談",iv.length],["es","ES例文",es.length]];
              return subs.map(([k,l,n]) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{ fontSize:12, fontWeight:500, border:"1px solid " + (tab===k ? C.ink : C.border), background: tab===k ? C.ink : "#fff", color: tab===k ? "#fff" : C.ink, borderRadius:16, padding:"5px 12px", cursor:"pointer", fontFamily:"inherit" }}>
                  {l}<span className="tabnum" style={{ fontSize:10, marginLeft:4, opacity:0.7 }}>{n}</span>
                </button>
              ));
            })()}
          </div>
        </div>
      </div>
      <div style={{ marginTop:14 }} />
      <div style={{ paddingTop:20 }}>
        {tab === "interview" && <PostsTab posts={iv} ptype="interview" label="面接体験談" co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} sess={sess} setAuthMode={setAuthMode} unlocked={unlocked} getAuthorBadge={getAuthorBadge} authUser={authUser} goThread={goThread} setGuestName={setGuestName} />}
        {tab === "board"     && <PostsTab posts={bd} ptype="board"     label="選考掲示板" co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} sess={sess} setAuthMode={setAuthMode} unlocked={unlocked} getAuthorBadge={getAuthorBadge} authUser={authUser} goThread={goThread} setGuestName={setGuestName} />}
        {tab === "es"        && <PostsTab posts={es} ptype="es"        label="ES例文"     co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} sess={sess} setAuthMode={setAuthMode} unlocked={unlocked} getAuthorBadge={getAuthorBadge} authUser={authUser} goThread={goThread} setGuestName={setGuestName} />}
        {tab === "review"    && <ReviewsTab revs={crevs} avgData={a}   co={co} uName={uName} plan={plan} onAddReview={onAddReview} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} go={go} sess={sess} setAuthMode={setAuthMode} unlocked={unlocked} getAuthorBadge={getAuthorBadge} />}
        {tab === "salary"    && <SalaryTab  sals={csals} avgSalary={sal} co={co} uName={uName} plan={plan} onAddSalary={onAddSalary} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} go={go} sess={sess} setAuthMode={setAuthMode} unlocked={unlocked} getAuthorBadge={getAuthorBadge} />}
        {tab === "jobs"      && <JobsTab    jobs={cjobs} co={co} uName={uName} onAddJob={onAddJob} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} />}
      </div>
    </div>
  );
}

// ─── 掲示板・体験談タブ ───────────────────────────────────────────────────────
function PostsTab({ posts, ptype, label, co, uName, onAddPost, onToggleLike, onAddComment, isAdmin, adminDelete, setEditTgt, favorites, toggleFavorite, jobCat, sess, setAuthMode, unlocked, getAuthorBadge, authUser, hideBoardNotice, goThread, setGuestName }) {
  const authUserKey = authUser?.uid || ("guest:" + uName);
  const [exp,  setExp]  = useState(null);
  const [cmt,  setCmt]  = useState("");
  const [form, setForm] = useState(null);
  const [customStage, setCustomStage] = useState("");
  const [showCustomStage, setShowCustomStage] = useState(false);
  const [stages, setStages] = useState([{ stage:"", content:"" }]);
  const [showDetails, setShowDetails] = useState(false);
  const isES = ptype === "es";
  const isInterview = ptype === "interview";
  const isBoard = ptype === "board";
  const isGeneral = !!(co && co.isGeneral); // みんなの相談（横断板）
  const initF = isES
    ? { companyId:co.id, ptype, stage:"内定", title:"", content:"", jobCategory:"全職種", esQuestion:"", year:new Date().getFullYear() }
    : isInterview
    ? {
        companyId:co.id, ptype, stage:"", title:"", content:"", jobCategory:"全職種",
        applyMethod:"", prevJobType:"", prevSalary:"", prevAge:"",
        progressStage:"",
        stages:[],
        extraStages:[],
        finalResult:"", offerAmount:"", offerBase:"", offerBonus:""
      }
    : isBoard
    ? {
        companyId:co.id, ptype, stage:"掲示板", title:"", content:"", jobCategory:"全職種",
        guestEmail:"", guestName:""  // 未ログイン投稿用
      }
    : { companyId:co.id, ptype, stage:"", title:"", content:"", jobCategory:"全職種", offerAmount:"", offerBase:"", offerBonus:"" };
  const sorted = [...posts].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  return (
    <div>
      {ptype === "interview" && <AISummary posts={posts} type="interview" />}
      {ptype === "board" && !hideBoardNotice && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", padding:"10px 14px", borderRadius:6, marginBottom:14, fontSize:12, color:"#92400E", lineHeight:1.7 }}>
          <strong>📋 職種ごとに掲示板が分かれています</strong><br />
          上部の「職種カテゴリ」で絞り込めます。投稿時も職種を選んでください。
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:12, color:C.sub }}>{posts.length}件の{label}{ptype === "board" && jobCat !== "全職種" ? ` (${jobCat})` : ""}</span>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ " + label + "を投稿する"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          {isGeneral && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 0 12px", marginBottom:14, borderBottom:"1px solid " + C.border, flexWrap:"wrap" }}>
              <AC>{ini(uName)}</AC>
              <span style={{ fontSize:12, color:C.sub }}>名前</span>
              <input value={uName} onChange={e => setGuestName(e.target.value.slice(0, 24))} placeholder="表示名" style={{ ...S.input, fontSize:13, padding:"6px 10px", maxWidth:220, flex:"0 1 auto" }} />
              <button type="button" onClick={() => setGuestName(genGuestName(co.group || co.industry))} title="別の名前を生成" style={{ background:C.light, border:"1px solid " + C.border, color:C.accentDark, fontSize:12, fontWeight:"bold", borderRadius:8, padding:"6px 11px", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>🎲</button>
            </div>
          )}
          {!isGeneral && (
          <Fld label="職種カテゴリ">
            <div style={{ display:"flex", gap:8 }}>
              <select style={{...S.input, flex:1}} value={form.jobCategory === "__custom__" ? "__custom__" : (form.jobCategory || "全職種")} onChange={e => {
                if (e.target.value === "__custom__") setForm({...form, jobCategory:"__custom__"});
                else setForm({...form, jobCategory:e.target.value});
              }}>
                {getJobCategories(co.group || co.industry).map(j => <option key={j} value={j}>{j}</option>)}
                <option value="__custom__">＋ 新しい職種を追加する</option>
              </select>
              {form.jobCategory === "__custom__" && (
                <input style={{...S.input, flex:1}} placeholder="例：CRMマーケター、広報、サステナ推進" autoFocus onChange={e => setForm({...form, jobCategory:e.target.value})} />
              )}
            </div>
          </Fld>
          )}
          {isES && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <Fld label="応募年（西暦）"><input style={S.input} type="number" placeholder="2025" value={form.year} onChange={e => setForm({ ...form, year:e.target.value })} /></Fld>
                <Fld label="選考結果">
                  <select style={S.input} value={form.stage} onChange={e => setForm({ ...form, stage:e.target.value })}>
                    <option value="内定">内定</option>
                    <option value="最終面接">最終面接まで</option>
                    <option value="二次面接">二次面接まで</option>
                    <option value="一次面接">一次面接まで</option>
                    <option value="書類選考">書類で不通過</option>
                  </select>
                </Fld>
              </div>
              <Fld label="ES設問内容 *">
                <textarea style={{ ...S.input, resize:"vertical" }} rows={2} placeholder="例：あなたが学生時代に最も力を入れて取り組んだことを教えてください。（400字以内）" value={form.esQuestion} onChange={e => setForm({ ...form, esQuestion:e.target.value })} />
              </Fld>
            </>
          )}
          {isBoard && !sess && (
            <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"12px 14px", borderRadius:6, marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:"bold", color:"#0C4A6E", marginBottom:8 }}>
                💬 ログイン不要で投稿できます
              </div>
              <Fld label="メールアドレス（任意）">
                <input style={S.input} type="email" placeholder="example@email.com" value={form.guestEmail} onChange={e => setForm({ ...form, guestEmail:e.target.value })} />
              </Fld>
              <p style={{ fontSize:10, color:C.sub, marginTop:4, lineHeight:1.7 }}>
                ※ 表示名は<strong>自動で入っています</strong>（🎲で引き直し・自由に変更も可）。<br />
                ※ メールは任意です。入力しても公開されず、機種変更後も同じ投稿者IDを引き継げます。会員登録すればそのままログインできます。
              </p>
            </div>
          )}
          {isBoard && !isGeneral && (
            <Fld label="投稿カテゴリ">
              <select style={S.input} value={form.stage} onChange={e => setForm({...form, stage:e.target.value})}>
                <option value="掲示板">通常の質問・情報共有</option>
                <option value="選考情報">選考情報・通過率</option>
                <option value="質問">質問</option>
                <option value="OB訪問">OB訪問・面談</option>
                <option value="その他">その他</option>
              </select>
            </Fld>
          )}
          {!isES && !isInterview && !isBoard && (
          <Fld label="選考段階 *">
            <div style={{ display:"flex", gap:8 }}>
              <select style={{...S.input, flex:1}} value={showCustomStage ? "custom" : form.stage} onChange={e => {
                if (e.target.value === "custom") { setShowCustomStage(true); setForm({...form, stage:customStage}); }
                else { setShowCustomStage(false); setForm({...form, stage:e.target.value}); }
              }}>
                <option value="">選択してください</option>
                {STAGES.map(s => <option key={s}>{s}</option>)}
                <option value="custom">自由入力（4次選考など）</option>
              </select>
              {showCustomStage && (
                <input style={{...S.input, flex:1}} placeholder="例：4次選考、役員面接" value={customStage} onChange={e => { setCustomStage(e.target.value); setForm({...form, stage:e.target.value}); }} />
              )}
            </div>
          </Fld>
          )}
          {isInterview && (
            <button type="button" onClick={() => setShowDetails(d => !d)} style={{ background: showDetails ? C.light : "none", border:"1px dashed " + C.accent, color:C.accent, fontSize:12, fontWeight:"bold", padding:"9px 12px", borderRadius:8, cursor:"pointer", fontFamily:"inherit", marginBottom:14, width:"100%" }}>
              {showDetails ? "− 詳細を閉じる（シンプルに投稿）" : "＋ 選考プロセス・年収などを詳しく書く（任意）"}
            </button>
          )}
          {isInterview && showDetails && (
            <>
              <div style={{ background:"#FFF7ED", border:"1px solid #FED7AA", padding:"12px 14px", borderRadius:6, marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:"bold", color:"#9A3412", marginBottom:10 }}>📋 応募・選考前の情報</div>
                <Fld label="応募方法 *">
                  <select style={S.input} value={form.applyMethod} onChange={e => setForm({...form, applyMethod:e.target.value})}>
                    <option value="">選択してください</option>
                    {APPLY_METHODS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Fld>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <Fld label="応募時の職種"><input style={S.input} placeholder="例：法人営業" value={form.prevJobType} onChange={e => setForm({...form, prevJobType:e.target.value})} /></Fld>
                  <Fld label="現年収（万円）"><input style={S.input} type="number" placeholder="500" value={form.prevSalary} onChange={e => setForm({...form, prevSalary:e.target.value})} /></Fld>
                  <Fld label="応募時の年齢"><input style={S.input} type="number" placeholder="28" value={form.prevAge} onChange={e => setForm({...form, prevAge:e.target.value})} /></Fld>
                </div>
              </div>
              <Fld label="どこまで進みましたか？ *">
                <select style={S.input} value={form.progressStage} onChange={e => {
                  const v = e.target.value;
                  const stageOrder = ["書類選考","一次面接","二次面接","三次面接","四次面接","五次面接","六次面接","七次面接","八次面接","最終面接"];
                  let stages = [];
                  if (v === "書類選考まで") {
                    stages = [{ name:"書類選考", content:"", days:"", result:"" }];
                  } else if (v.endsWith("まで")) {
                    const target = v.replace("まで","");
                    const idx = stageOrder.indexOf(target);
                    if (idx >= 0) {
                      stages = stageOrder.slice(0, idx + 1).map(n => ({ name:n, content:"", days:"", result:"" }));
                    }
                  } else if (v === "内定" || v === "内定辞退") {
                    // 最終面接まで全部
                    stages = ["書類選考","一次面接","二次面接","最終面接"].map(n => ({ name:n, content:"", days:"", result:"" }));
                  }
                  setForm({...form, progressStage:v, stages, finalResult: (v === "内定" || v === "内定辞退") ? v : "", stage:v});
                }}>
                  <option value="">選択してください</option>
                  <option value="書類選考まで">書類選考まで</option>
                  <option value="一次面接まで">一次面接まで</option>
                  <option value="二次面接まで">二次面接まで</option>
                  <option value="三次面接まで">三次面接まで</option>
                  <option value="四次面接まで">四次面接まで</option>
                  <option value="五次面接まで">五次面接まで</option>
                  <option value="六次面接まで">六次面接まで</option>
                  <option value="七次面接まで">七次面接まで</option>
                  <option value="八次面接まで">八次面接まで</option>
                  <option value="最終面接まで">最終面接まで</option>
                  <option value="内定">内定</option>
                  <option value="内定辞退">内定辞退</option>
                </select>
              </Fld>
              {form.stages.length > 0 && (
                <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"12px 14px", borderRadius:6, marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:"bold", color:"#0C4A6E", marginBottom:10 }}>
                    🎯 選考プロセス（段階ごとに記入）
                  </div>
                  {form.stages.map((stg, i) => (
                    <div key={i} style={{ background:"#fff", border:"1px solid " + C.border, padding:"10px 12px", marginBottom:8, borderRadius:4 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
                        <span style={{ background:C.accent, color:"#fff", padding:"2px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>{stg.name}</span>
                      </div>
                      <Fld label={`${stg.name}の内容（質問・課題・形式など）`}>
                        <textarea style={{...S.input, resize:"vertical"}} rows={3} placeholder="例：志望動機、自己PR、逆質問など。30分の面接で...などを記入" value={stg.content} onChange={e => {
                          const ns = [...form.stages]; ns[i] = {...ns[i], content:e.target.value}; setForm({...form, stages:ns});
                        }} />
                      </Fld>
                      <Fld label="結果通知までの日数（任意）">
                        <input style={S.input} placeholder="例：3日後" value={stg.days} onChange={e => {
                          const ns = [...form.stages]; ns[i] = {...ns[i], days:e.target.value}; setForm({...form, stages:ns});
                        }} />
                      </Fld>
                    </div>
                  ))}
                  {/* オプション：自由入力欄 */}
                  <div style={{ marginTop:12, paddingTop:10, borderTop:"1px dashed " + C.border }}>
                    <div style={{ fontSize:12, fontWeight:"bold", color:"#0C4A6E", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span>オプション：その他の選考（カジュアル面接・座談会など）</span>
                      <button type="button" style={{ background:"#fff", color:C.accent, border:"1px solid " + C.accent, padding:"3px 10px", fontSize:11, fontFamily:"inherit", cursor:"pointer", borderRadius:3 }} onClick={() => {
                        setForm({...form, extraStages:[...(form.extraStages||[]), { name:"", content:"", days:"" }]});
                      }}>＋ 追加</button>
                    </div>
                    {(form.extraStages||[]).map((stg, i) => (
                      <div key={i} style={{ background:"#fff", border:"1px solid " + C.border, padding:"10px 12px", marginBottom:8, borderRadius:4 }}>
                        <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
                          <input style={{...S.input, flex:1}} placeholder="選考名（例：カジュアル面接、座談会、人事面談など）" value={stg.name} onChange={e => {
                            const ns = [...form.extraStages]; ns[i] = {...ns[i], name:e.target.value}; setForm({...form, extraStages:ns});
                          }} />
                          <button type="button" style={{ background:"#FEE2E2", color:"#991B1B", border:"none", padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", borderRadius:3 }} onClick={() => {
                            const ns = form.extraStages.filter((_, idx) => idx !== i); setForm({...form, extraStages:ns});
                          }}>削除</button>
                        </div>
                        <textarea style={{...S.input, resize:"vertical"}} rows={2} placeholder="内容を記入" value={stg.content} onChange={e => {
                          const ns = [...form.extraStages]; ns[i] = {...ns[i], content:e.target.value}; setForm({...form, extraStages:ns});
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* オファー情報：内定・内定辞退の場合のみ表示 */}
              {(form.progressStage === "内定" || form.progressStage === "内定辞退") && (
                <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", padding:"12px 14px", borderRadius:6, marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:"bold", color:"#166534", marginBottom:8 }}>💰 オファー情報</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    <Fld label="提示年収（万円）"><input style={S.input} type="number" placeholder="700" value={form.offerAmount} onChange={e => setForm({...form, offerAmount:e.target.value})} /></Fld>
                    <Fld label="月給（万円）"><input style={S.input} type="number" placeholder="45" value={form.offerBase} onChange={e => setForm({...form, offerBase:e.target.value})} /></Fld>
                    <Fld label="賞与（万円）"><input style={S.input} type="number" placeholder="160" value={form.offerBonus} onChange={e => setForm({...form, offerBonus:e.target.value})} /></Fld>
                  </div>
                </div>
              )}
            </>
          )}
          <Fld label={isES ? "回答タイトル *" : "タイトル *"}>
            <input style={S.input} placeholder="例：一次面接で聞かれたこと" value={form.title} onChange={e => setForm({ ...form, title:e.target.value })} />
          </Fld>
          {isInterview ? (
            <Fld label="総評・感想（任意）">
              <textarea style={{ ...S.input, resize:"vertical" }} rows={3} placeholder="選考全体を通しての感想・準備のポイントなどがあれば（任意）" value={form.content} onChange={e => setForm({ ...form, content:e.target.value })} />
            </Fld>
          ) : isBoard ? (
            <Fld label={`本文 *　${form.content.length}文字`}>
              <textarea style={{ ...S.input, resize:"vertical", borderColor: C.border }} rows={5} placeholder="質問や情報を自由に投稿してください。" value={form.content} onChange={e => setForm({ ...form, content:e.target.value })} />
            </Fld>
          ) : (
            <Fld label={`本文 *　${form.content.length}文字`}>
              <textarea style={{ ...S.input, resize:"vertical", borderColor: C.border }} rows={5} placeholder="面接の様子、聞かれた内容、準備のポイントなどをご記入ください。" value={form.content} onChange={e => setForm({ ...form, content:e.target.value })} />
            </Fld>
          )}
          {!isInterview && (form.stage === "内定" || form.stage === "内定辞退") && (
            <div style={{ background:"#F0FBF4", border:"1px solid #BBF7D0", padding:"12px 14px", borderRadius:6, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:"bold", color:"#166534", marginBottom:8 }}>内定オファー情報（任意）</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                <Fld label="提示年収（万円）"><input style={S.input} type="number" placeholder="600" value={form.offerAmount} onChange={e => setForm({...form, offerAmount:e.target.value})} /></Fld>
                <Fld label="月給（万円）"><input style={S.input} type="number" placeholder="40" value={form.offerBase} onChange={e => setForm({...form, offerBase:e.target.value})} /></Fld>
                <Fld label="賞与（万円）"><input style={S.input} type="number" placeholder="120" value={form.offerBonus} onChange={e => setForm({...form, offerBonus:e.target.value})} /></Fld>
              </div>
            </div>
          )}
          {!isGeneral && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 0", borderTop:"1px solid " + C.border, flexWrap:"wrap" }}>
            <AC>{ini(uName)}</AC>
            <span style={{ fontSize:12, color:C.sub }}>表示名</span>
            <input value={uName} onChange={e => setGuestName(e.target.value.slice(0, 24))} placeholder="表示名" style={{ ...S.input, fontSize:13, padding:"6px 10px", maxWidth:200, flex:"0 1 auto" }} />
            <button type="button" onClick={() => setGuestName(genGuestName(co.group || co.industry))} title="別の名前を生成" style={{ background:C.light, border:"1px solid " + C.border, color:C.accentDark, fontSize:12, fontWeight:"bold", borderRadius:8, padding:"6px 11px", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>🎲 別の名前</button>
            <span style={{ fontSize:11, color:C.sub }}>として投稿（自由に変更できます）</span>
          </div>
          )}
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.title.trim()) { alert("タイトルを入力してください"); return; }
            if (isBoard) {
              if (!form.title.trim()) { alert("タイトルを入力してください"); return; }
              if (!form.content.trim()) { alert("本文を入力してください"); return; }
              if (!sess && form.guestEmail && !form.guestEmail.includes("@")) { alert("メールアドレスの形式が正しくありません"); return; }
              await onAddPost({ ...form, author: uName });
              setForm(null);
              return;
            }
            if (isInterview) {
              if (showDetails && !form.applyMethod) { alert("応募方法を選択してください"); return; }
              if (showDetails && !form.progressStage) { alert("選考の最終段階を選択してください"); return; }
              const summary = [...form.stages, ...(form.extraStages||[])].filter(s => s.name && s.content).map(s => `【${s.name}】${s.content}`).join("\n\n");
              await onAddPost({ ...form, author: uName, content: form.content || summary, stage: form.progressStage, finalResult: (form.progressStage === "内定" || form.progressStage === "内定辞退") ? form.progressStage : "" });
              setForm(null);
              return;
            }
            if (!isES && !form.stage) return;
            if (isES && !form.esQuestion.trim()) { alert("ES設問内容を入力してください"); return; }
            if ((!isInterview || !showDetails) && !form.content.trim()) { alert("本文を入力してください"); return; }
            await onAddPost({ ...form, author: uName });
            setForm(null);
          }}>
            投稿する
          </button>
        </div>
      )}
      {sorted.length === 0 && <Empty text={"まだ" + label + "がありません。最初の投稿をしてみましょう！"} />}
      {/* 選考掲示板・ES例文は1件目からロック、面接体験談は2件目以降ロック */}
      {/* 選考掲示板はライトモード（未ログインでも閲覧可・メールのみで投稿可） */}
      {ptype === "board" && (
        <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:8, padding:"12px 14px", marginBottom:14, fontSize:12, color:"#166534", lineHeight:1.7 }}>
          💬 <strong>ログイン不要で投稿できます</strong>（表示名は自動で入ります・自由に変更可）<br />
          閲覧は登録不要です。気軽に情報交換しましょう。
        </div>
      )}
      {sorted.length > 0 && !unlocked && ptype === "es" && (
        <BoardLockedNotice setAuthMode={setAuthMode} count={sorted.length} type={label} sess={sess} />
      )}
      {sorted.map((p, idx) => {
        const isLocked = !unlocked && (
          ptype === "board" ? false :  // 掲示板はロックしない
          ptype === "es" ? idx >= 0 :
          ptype === "interview" ? idx >= 1 :
          idx >= 1
        );
        return (
            <article key={p.id} style={{ background:C.surface, padding:"12px 0", borderBottom:"1px solid " + C.border, position:"relative", filter: isLocked ? "blur(5px)" : "none", pointerEvents: isLocked ? "none" : "auto", userSelect: isLocked ? "none" : "auto" }}>
              {isAdmin && (
                <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:6 }}>
                  <SmBtn onClick={() => setEditTgt({ type:"post", data:p })}>編集</SmBtn>
                  <SmBtn red onClick={() => adminDelete("post", p.id)}>削除</SmBtn>
                </div>
              )}
              <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
                <StageBadge s={p.stage} />
                {p.jobCategory && p.jobCategory !== "全職種" && (
                  <span style={{ fontSize:10, background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"1px 7px", fontWeight:"bold" }}>{p.jobCategory}</span>
                )}
                <span style={{ fontSize:11, color:C.sub, marginLeft:"auto" }}>{ago(p.createdAt)}</span>
              </div>
              {p.ptype === "es" && p.esQuestion && (
                <div style={{ background:"#FFF8E7", borderLeft:"3px solid #F59E0B", padding:"8px 12px", marginBottom:8, fontSize:12, lineHeight:1.7 }}>
                  <strong style={{ color:"#92400E", display:"block", marginBottom:2 }}>📝 設問：</strong>
                  {p.esQuestion}
                </div>
              )}
              <h3 style={{ fontSize:15, fontWeight:"bold", marginBottom:8, lineHeight:1.55, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>
                {goThread ? <span onClick={() => goThread(p)} style={{ cursor:"pointer" }}>{p.title}</span> : p.title}
                {p.bestAnswerId && <span style={{ marginLeft:8, fontSize:10, fontWeight:"bold", color:C.success, background:"#E8F1EB", border:"1px solid #BFDCC8", borderRadius:5, padding:"1px 7px", verticalAlign:"middle" }}>✅ 解決済み</span>}
              </h3>
              {p.year && p.ptype === "es" && (
                <div style={{ fontSize:11, color:C.sub, marginBottom:6 }}>応募: {p.year}年 / 結果: {p.stage}</div>
              )}
              {/* 面接体験談の概要バッジ（誰でも見える基本情報） */}
              {p.ptype === "interview" && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                  {(p.finalResult === "内定" || p.finalResult === "内定辞退") && (
                    <span style={{ background: p.finalResult === "内定" ? "#16A34A" : "#0891B2", color:"#fff", padding:"3px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>
                      {p.finalResult}
                    </span>
                  )}
                  {p.progressStage && (
                    <span style={{ background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"3px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>
                      {p.progressStage}
                    </span>
                  )}
                  {p.applyMethod && (
                    <span style={{ background:"#FFF7ED", color:"#C2410C", border:"1px solid #FED7AA", padding:"3px 10px", fontSize:11, borderRadius:3 }}>
                      応募: {p.applyMethod}
                    </span>
                  )}
                </div>
              )}
              {/* 現年収 → オファー年収（誰でも見える） */}
              {p.ptype === "interview" && (p.prevSalary || p.offerAmount) && (
                <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"10px 14px", borderRadius:6, marginBottom:10, fontSize:13, fontWeight:"bold", color:"#0C4A6E" }}>
                  {p.prevSalary && <span>現年収: {p.prevSalary}万円</span>}
                  {p.prevSalary && p.offerAmount && <span style={{ margin:"0 8px", color:C.accent }}>→</span>}
                  {p.offerAmount && <span>オファー年収: {p.offerAmount}万円</span>}
                </div>
              )}
              {/* 多段階詳細（ロックの場合は親要素のblurで自動的に隠される） */}
              {p.ptype === "interview" && ((p.stages && p.stages.length > 0) || (p.extraStages && p.extraStages.length > 0)) && (
                <div style={{ marginBottom:10 }}>
                  {(p.stages || []).map((stg, i) => (
                    <div key={i} style={{ borderLeft:"3px solid " + C.accent, paddingLeft:10, marginBottom:8 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, fontWeight:"bold", color:C.accent }}>{stg.name}</span>
                        {stg.days && <span style={{ fontSize:10, color:C.sub }}>結果通知: {stg.days}</span>}
                      </div>
                      {stg.content && <p style={{ fontSize:12, lineHeight:1.7, color:C.ink, marginBottom:4 }}>{stg.content}</p>}
                    </div>
                  ))}
                  {(p.extraStages || []).filter(s => s.name && s.content).map((stg, i) => (
                    <div key={"ex"+i} style={{ borderLeft:"3px dashed " + C.accent, paddingLeft:10, marginBottom:8 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4 }}>
                        <span style={{ fontSize:11, fontWeight:"bold", color:C.accent }}>{stg.name}</span>
                        <span style={{ fontSize:9, background:"#FFF7ED", color:"#C2410C", padding:"1px 6px", borderRadius:2 }}>その他</span>
                      </div>
                      {stg.content && <p style={{ fontSize:12, lineHeight:1.7, color:C.ink }}>{stg.content}</p>}
                    </div>
                  ))}
                </div>
              )}
              {/* 旧来のオファー情報（互換性のため残す） */}
              {p.ptype !== "interview" && p.offerAmount && (
                <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", padding:"8px 12px", borderRadius:6, marginBottom:8, fontSize:13 }}>
                  内定オファー: <strong style={{ color:"#166534" }}>年収{p.offerAmount}万円</strong>
                  {p.offerBase ? ` （月給${p.offerBase}万円` : ""}{p.offerBonus ? ` + 賞与${p.offerBonus}万円）` : (p.offerBase ? "）" : "")}
                </div>
              )}
              <p style={{ fontSize:13, lineHeight:1.9, marginBottom:12 }}>{p.content}</p>
              <div style={{ display:"flex", alignItems:"center", gap:10, borderTop:"1px solid " + C.border, paddingTop:10, flexWrap:"wrap" }}>
                <AC>{ini(p.author)}</AC>
                <span style={{ fontSize:12, color:C.sub }}>{p.author}</span>
                <VerifyBadge v={p.authorVerify} />
                <PosterId id={p.posterId} seed={p.authorUid || ("anon:" + (p.author || "?") + ":" + (p.id || ""))} />
                {getAuthorBadge && getAuthorBadge(p.authorUid) && <BadgeChip badge={getAuthorBadge(p.authorUid)} small />}
                {(p.likes || []).length >= 10 && (
                  <span style={{ background:"#FEE2E2", color:"#DC2626", padding:"2px 8px", fontSize:10, fontWeight:"bold", borderRadius:10 }}>
                    🔥 人気
                  </span>
                )}
                <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                  <LikeButton liked={(p.likes || []).includes(authUserKey)} count={(p.likes || []).length} onClick={() => onToggleLike(p.id)} />
                  <button style={{ background:"#fff", border:"1px solid " + C.border, fontSize:12, cursor:"pointer", fontFamily:"inherit", color: favorites && favorites.includes(p.id) ? "#E8A000" : C.sub, padding:"6px 12px", borderRadius:18, display:"flex", alignItems:"center", gap:4 }} onClick={() => toggleFavorite && toggleFavorite(p.id)}>
                    {favorites && favorites.includes(p.id) ? "★" : "☆"}
                  </button>
                  <button style={{ background:"#fff", border:"1px solid " + C.border, color:C.sub, fontSize:12, cursor:"pointer", fontFamily:"inherit", padding:"6px 12px", borderRadius:18, display:"flex", alignItems:"center", gap:4 }} onClick={() => setExp(exp === p.id ? null : p.id)}>
                    💬 {(p.comments || []).length}
                  </button>
                </div>
              </div>
              {exp === p.id && (
                <CommentThread
                  post={p}
                  uName={uName}
                  authUserKey={authUserKey}
                  authUser={authUser}
                  isAdmin={isAdmin}
                  onAddComment={onAddComment}
                  adminDelete={adminDelete}
                  getAuthorBadge={getAuthorBadge}
                  bestAnswerId={p.bestAnswerId}
                />
              )}
            </article>
        );
      })}
      {!unlocked && ptype === "interview" && sorted.length > 1 && <LockedContent setAuthMode={setAuthMode} count={sorted.length - 1} type={label} sess={sess} />}
      {!unlocked && ptype === "es" && sorted.length > 1 && <LockedContent setAuthMode={setAuthMode} count={sorted.length - 1} type={label} sess={sess} />}
    </div>
  );
}

// ─── 口コミタブ ───────────────────────────────────────────────────────────────
function ReviewsTab({ revs, avgData: a, co, uName, plan, onAddReview, isAdmin, adminDelete, setEditTgt, go, sess, setAuthMode, unlocked, getAuthorBadge }) {
  const [form, setForm] = useState(null);
  const [deptFilter, setDeptFilter] = useState("全部門");
  const [showStats, setShowStats] = useState(false);
  const canRead = ["standard","premium"].includes(plan);

  // 部門別フィルタリング
  const filteredRevs = deptFilter === "全部門" ? revs : revs.filter(r => r.dept === deptFilter);
  const filteredAvg = calcAvg(filteredRevs);

  // 残業時間の統計（数値中央値で集計）
  const overtimeStats = OVERTIME_BUCKETS.map(b => ({
    label: b.label,
    value: b.value,
    count: revs.filter(r => r.overtimeBucket === b.label).length
  }));
  const paidLeaveStats = PAID_LEAVE_BUCKETS.map(b => ({
    label: b.label,
    value: b.value,
    count: revs.filter(r => r.paidLeaveBucket === b.label).length
  }));
  const quitReasonStats = QUIT_REASONS.filter(q => q !== "退職検討なし").map(q => ({
    label: q,
    count: revs.filter(r => r.quitReason === q).length
  })).filter(s => s.count > 0).sort((a,b) => b.count - a.count);

  // 部門別評価サマリー
  const deptSummary = DEPARTMENTS.filter(d => d !== "全部門").map(d => {
    const drs = revs.filter(r => r.dept === d);
    return { dept: d, count: drs.length, avg: calcAvg(drs) };
  }).filter(s => s.count > 0).sort((a,b) => b.count - a.count);
  const initF = {
    companyId:co.id, overall:3,
    rats:{motivation:3,morale:3,relations:3,white:3,growth:3,wlb:3,salary:3,mgmt:3},
    ratComments:{motivation:"",morale:"",relations:"",white:"",growth:"",wlb:"",salary:"",mgmt:""},
    empType:"正社員", tenure:"1~3年", dept:"全部門", position:"一般社員",
    overtimeBucket:"", paidLeaveBucket:"", quitReason:"退職検討なし", prevJob:"",
    retirementPlanComment:"", familyAllowanceComment:"",
    pros:"", cons:"", advice:""
  };

  return (
    <div>
      <AISummary reviews={revs} type="review" />
      {/* 部門フィルター */}
      {revs.length > 0 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14, alignItems:"center" }}>
          <span style={{ fontSize:11, color:C.sub, marginRight:4 }}>部門で絞り込み:</span>
          {["全部門", ...deptSummary.map(d => d.dept)].map(d => (
            <button key={d} style={{ border:"1px solid " + C.border, background: deptFilter === d ? C.accent : "#F7F7F7", color: deptFilter === d ? "#fff" : C.sub, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", borderRadius:4 }} onClick={() => setDeptFilter(d)}>
              {d}{d !== "全部門" && ` (${deptSummary.find(x => x.dept === d)?.count})`}
            </button>
          ))}
        </div>
      )}

      {filteredAvg && (
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", padding:"14px 0", borderBottom:"1px solid " + C.border, marginBottom:16 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:80, paddingRight:18, borderRight:"1px solid " + C.border }}>
            <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>総合評価</div>
            <div style={{ fontSize:46, fontWeight:"bold", color:C.accent, lineHeight:1, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{filteredAvg.overall.toFixed(1)}</div>
            <Stars r={filteredAvg.overall} size={14} />
            <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>{filteredRevs.length}件</div>
            {deptFilter !== "全部門" && <div style={{ fontSize:10, color:C.accent, marginTop:2 }}>{deptFilter}のみ</div>}
          </div>
          <div style={{ flex:1, minWidth:240 }}>
            {RCATS.map(cat => (
              <div key={cat.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                <span style={{ fontSize:11, color:C.sub, width:140, flexShrink:0 }}>{cat.label}</span>
                <div style={{ flex:1, height:5, background:"#E5E7EB", position:"relative" }}>
                  <div style={{ position:"absolute", left:0, top:0, height:"100%", width: ((filteredAvg[cat.key] / 5) * 100) + "%", background:C.accent }} />
                </div>
                <span style={{ fontSize:12, fontWeight:"bold", width:24, textAlign:"right" }}>{parseFloat(filteredAvg[cat.key]).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 統計セクション（折りたたみ式） */}
      {revs.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <button style={{ background:"#F7FAFC", border:"1px solid " + C.border, padding:"8px 14px", fontSize:12, cursor:"pointer", fontFamily:"inherit", borderRadius:4, width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center" }} onClick={() => setShowStats(!showStats)}>
            <span style={{ fontWeight:"bold", color:C.ink }}>📊 残業時間・有給消化率・退職理由の統計を見る</span>
            <span>{showStats ? "▴" : "▾"}</span>
          </button>
          {showStats && (
            <div style={{ background:"#fff", border:"1px solid " + C.border, borderTop:"none", padding:"16px 18px", display:"grid", gridTemplateColumns: "1fr", gap:20 }}>
              {/* 残業時間グラフ */}
              {overtimeStats.some(s => s.count > 0) && (
                <div>
                  <h4 style={{ fontSize:13, fontWeight:"bold", marginBottom:10, color:C.ink }}>月間残業時間の分布</h4>
                  {overtimeStats.map(s => {
                    const maxCount = Math.max(...overtimeStats.map(x => x.count), 1);
                    return (
                      <div key={s.label} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, fontSize:12 }}>
                        <span style={{ width:80, color:C.sub, flexShrink:0 }}>{s.label}</span>
                        <div style={{ flex:1, height:18, background:"#F0F0F0", position:"relative", borderRadius:2 }}>
                          <div style={{ position:"absolute", left:0, top:0, height:"100%", width: ((s.count / maxCount) * 100) + "%", background:s.value > 45 ? "#DC2626" : s.value > 25 ? "#F59E0B" : "#16A34A", borderRadius:2 }} />
                        </div>
                        <span style={{ width:36, textAlign:"right", fontWeight:"bold", color:C.ink }}>{s.count}件</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 有給消化率グラフ */}
              {paidLeaveStats.some(s => s.count > 0) && (
                <div>
                  <h4 style={{ fontSize:13, fontWeight:"bold", marginBottom:10, color:C.ink }}>有給休暇消化率の分布</h4>
                  {paidLeaveStats.map(s => {
                    const maxCount = Math.max(...paidLeaveStats.map(x => x.count), 1);
                    return (
                      <div key={s.label} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, fontSize:12 }}>
                        <span style={{ width:80, color:C.sub, flexShrink:0 }}>{s.label}</span>
                        <div style={{ flex:1, height:18, background:"#F0F0F0", position:"relative", borderRadius:2 }}>
                          <div style={{ position:"absolute", left:0, top:0, height:"100%", width: ((s.count / maxCount) * 100) + "%", background:s.value < 30 ? "#DC2626" : s.value < 60 ? "#F59E0B" : "#16A34A", borderRadius:2 }} />
                        </div>
                        <span style={{ width:36, textAlign:"right", fontWeight:"bold", color:C.ink }}>{s.count}件</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 退職検討理由ランキング */}
              {quitReasonStats.length > 0 && (
                <div>
                  <h4 style={{ fontSize:13, fontWeight:"bold", marginBottom:10, color:C.ink }}>退職検討理由ランキング</h4>
                  {quitReasonStats.slice(0, 5).map((s, i) => {
                    const maxCount = quitReasonStats[0].count;
                    return (
                      <div key={s.label} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, fontSize:12 }}>
                        <span style={{ width:24, color:C.accent, fontWeight:"bold" }}>#{i + 1}</span>
                        <span style={{ width:170, color:C.ink, flexShrink:0 }}>{s.label}</span>
                        <div style={{ flex:1, height:18, background:"#F0F0F0", position:"relative", borderRadius:2 }}>
                          <div style={{ position:"absolute", left:0, top:0, height:"100%", width: ((s.count / maxCount) * 100) + "%", background:C.accent, borderRadius:2 }} />
                        </div>
                        <span style={{ width:36, textAlign:"right", fontWeight:"bold", color:C.ink }}>{s.count}件</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:12, color:C.sub }}>{revs.length}件の口コミ</span>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ 口コミを書く"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          <Fld label="総合評価 *"><StarPicker value={form.overall} onChange={v => setForm({ ...form, overall:v })} label="総合評価" /></Fld>
          <Fld label="カテゴリ別評価とコメント">
            <div style={{ borderLeft:"3px solid " + C.border, paddingLeft:12 }}>
              {RCATS.map(cat => (
                <div key={cat.key} style={{ marginBottom:14, paddingBottom:12, borderBottom:"1px dashed " + C.border }}>
                  <StarPicker value={form.rats[cat.key]} onChange={v => setForm({ ...form, rats:{ ...form.rats, [cat.key]:v } })} label={cat.label} />
                  <textarea
                    style={{ ...S.input, resize:"vertical", marginTop:4, fontSize:12 }}
                    rows={2}
                    placeholder={`${cat.label}についてのコメント（任意）`}
                    value={form.ratComments[cat.key]}
                    onChange={e => setForm({ ...form, ratComments:{ ...form.ratComments, [cat.key]:e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </Fld>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="在籍形態"><select style={S.input} value={form.empType} onChange={e => setForm({ ...form, empType:e.target.value })}>{EMP_TYPES.map(t => <option key={t}>{t}</option>)}</select></Fld>
            <Fld label="在籍年数"><select style={S.input} value={form.tenure}  onChange={e => setForm({ ...form, tenure: e.target.value })}>{TENURES.map(t => <option key={t}>{t}</option>)}</select></Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="部門"><select style={S.input} value={form.dept} onChange={e => setForm({ ...form, dept:e.target.value })}>{DEPARTMENTS.map(t => <option key={t}>{t}</option>)}</select></Fld>
            <Fld label="役職"><select style={S.input} value={form.position} onChange={e => setForm({ ...form, position:e.target.value })}>{POSITIONS.map(t => <option key={t}>{t}</option>)}</select></Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="月間残業時間"><select style={S.input} value={form.overtimeBucket} onChange={e => setForm({ ...form, overtimeBucket:e.target.value })}>
              <option value="">選択しない</option>
              {OVERTIME_BUCKETS.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
            </select></Fld>
            <Fld label="有給消化率"><select style={S.input} value={form.paidLeaveBucket} onChange={e => setForm({ ...form, paidLeaveBucket:e.target.value })}>
              <option value="">選択しない</option>
              {PAID_LEAVE_BUCKETS.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
            </select></Fld>
          </div>
          <Fld label="退職検討理由">
            <select style={S.input} value={form.quitReason} onChange={e => setForm({ ...form, quitReason:e.target.value })}>
              {QUIT_REASONS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Fld>
          <Fld label="前職（任意）">
            <input style={S.input} placeholder="例：大手SIer / 同業他社 / 新卒入社" value={form.prevJob} onChange={e => setForm({ ...form, prevJob:e.target.value })} />
          </Fld>
          <Fld label="良いところ *"><textarea style={{ ...S.input, resize:"vertical" }} rows={3} value={form.pros} onChange={e => setForm({ ...form, pros:e.target.value })} /></Fld>
          <Fld label="改善点 *"><textarea style={{ ...S.input, resize:"vertical" }} rows={3} value={form.cons} onChange={e => setForm({ ...form, cons:e.target.value })} /></Fld>
          <Fld label="アドバイス（任意）"><textarea style={{ ...S.input, resize:"vertical" }} rows={2} value={form.advice} onChange={e => setForm({ ...form, advice:e.target.value })} /></Fld>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:"1px solid " + C.border, fontSize:12, color:C.sub }}>
            <AC>{ini(uName)}</AC>{uName} として投稿
          </div>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.pros.trim() || !form.cons.trim()) return;
            await onAddReview(form);
            setForm(null);
          }}>
            口コミを投稿する
          </button>
        </div>
      )}
      {revs.length === 0 && <Empty text="まだ口コミがありません" />}
      {filteredRevs.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map((r, idx) => {
        const isLocked = !unlocked && idx >= 1;
        return (
        <div key={r.id} style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px", marginBottom:10, position:"relative", filter: isLocked ? "blur(5px)" : "none", pointerEvents: isLocked ? "none" : "auto", userSelect: isLocked ? "none" : "auto" }}>
          {isAdmin && (
            <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:8 }}>
              <SmBtn onClick={() => setEditTgt({ type:"review", data:r })}>編集</SmBtn>
              <SmBtn red onClick={() => adminDelete("review", r.id)}>削除</SmBtn>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:10, paddingBottom:10, borderBottom:"1px solid " + C.border }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <Stars r={r.overall} size={13} />
                <span style={{ fontWeight:"bold", fontSize:15, color:C.accent }}>{r.overall.toFixed(1)}</span>
              </div>
              {[r.empType, r.tenure, r.dept, r.position].filter(Boolean).filter(t => t !== "全部門").map(t => (
                <span key={t} style={{ fontSize:11, color:C.sub, border:"1px solid " + C.border, padding:"1px 6px", marginRight:4, marginBottom:3, display:"inline-block" }}>{t}</span>
              ))}
            </div>
            <span style={{ fontSize:11, color:C.sub }}>{ago(r.createdAt)}</span>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, padding:"8px 12px", background:"#F7F7F7", borderLeft:"3px solid " + C.border, marginBottom:6 }}>
              {RCATS.map(cat => (
                <div key={cat.key} style={{ textAlign:"center", minWidth:60 }}>
                  <div style={{ fontSize:9, color:C.sub, marginBottom:1 }}>{cat.label}</div>
                  <div style={{ fontSize:13, fontWeight:"bold", color: (r.rats && r.rats[cat.key] >= 4) ? C.accent : C.ink }}>{((r.rats && r.rats[cat.key]) || 0).toFixed(1)}</div>
                </div>
              ))}
            </div>
            {/* カテゴリ別コメント */}
            {r.ratComments && RCATS.some(cat => r.ratComments[cat.key]) && (
              <div style={{ paddingLeft:8, marginTop:8 }}>
                {RCATS.filter(cat => r.ratComments && r.ratComments[cat.key]).map(cat => (
                  <div key={cat.key} style={{ marginBottom:8, paddingLeft:10, borderLeft:"2px solid " + C.light }}>
                    <div style={{ fontSize:11, fontWeight:"bold", color:C.accent, marginBottom:2 }}>
                      {cat.label} <Stars r={r.rats[cat.key]} size={10} />
                    </div>
                    <p style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>{r.ratComments[cat.key]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {(r.overtimeBucket || r.paidLeaveBucket || (r.quitReason && r.quitReason !== "退職検討なし") || r.prevJob) && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10, padding:"8px 12px", background:"#FAFBFC", borderLeft:"3px solid " + C.accent, fontSize:11 }}>
              {r.overtimeBucket && <span>残業: <strong>{r.overtimeBucket}</strong></span>}
              {r.paidLeaveBucket && <span>有給消化: <strong>{r.paidLeaveBucket}</strong></span>}
              {r.quitReason && r.quitReason !== "退職検討なし" && <span>退職検討: <strong>{r.quitReason}</strong></span>}
              {r.prevJob && <span>前職: <strong>{r.prevJob}</strong></span>}
            </div>
          )}
          {r.pros   && <div style={{ marginBottom:10 }}><div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>良いところ</div><p style={{ fontSize:13, lineHeight:1.9 }}>{r.pros}</p></div>}
          {r.cons   && <div style={{ marginBottom:10 }}><div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>改善点</div><p style={{ fontSize:13, lineHeight:1.9 }}>{r.cons}</p></div>}
          {r.advice && <div style={{ marginBottom:10 }}><div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>アドバイス</div><p style={{ fontSize:13, lineHeight:1.9 }}>{r.advice}</p></div>}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
            <AC>{ini(r.author)}</AC><span style={{ fontSize:12, color:C.sub }}>{r.author}</span>
            {getAuthorBadge && getAuthorBadge(r.authorUid) && <BadgeChip badge={getAuthorBadge(r.authorUid)} small />}
          </div>
        </div>
      );
      })}
      {/* 未ログイン時の登録誘導オーバーレイ */}
      {!unlocked && filteredRevs.length > 1 && <LockedContent setAuthMode={setAuthMode} count={filteredRevs.length - 1} type="口コミ" sess={sess} />}
    </div>
  );
}

// ─── 年収タブ ─────────────────────────────────────────────────────────────────
function SalaryTab({ sals, avgSalary, co, uName, plan, onAddSalary, isAdmin, adminDelete, setEditTgt, go, sess, setAuthMode, unlocked, getAuthorBadge }) {
  const [form, setForm] = useState(null);
  const canRead = ["standard","premium"].includes(plan);
  const byJob   = sals.reduce((acc, s) => { if (!acc[s.jobType]) acc[s.jobType] = []; acc[s.jobType].push(s); return acc; }, {});
  const initF   = { companyId:co.id, jobType:"", position:"", ageRange:"", empType:"正社員", annualSalary:"", baseSalary:"", bonus:"", housingAllowance:"なし", housingAllowanceComment:"", hasRetirementPlan:false, retirementPlanComment:"", hasFamilyAllowance:false, familyAllowanceComment:"", overtime:"", paidLeave:"", comment:"" };

  return (
    <div>
      {avgSalary && (
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", padding:"14px 0", borderBottom:"1px solid " + C.border, marginBottom:16 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:80, paddingRight:18, borderRight:"1px solid " + C.border }}>
            <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>平均年収</div>
            <div style={{ fontSize:36, fontWeight:"bold", color:"#1a5276", lineHeight:1, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{avgSalary}<span style={{ fontSize:13, fontWeight:"normal" }}>万円</span></div>
            <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>{sals.length}件</div>
          </div>
          {Object.keys(byJob).length > 0 && (
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:8 }}>職種別平均年収</div>
              {Object.entries(byJob).map(([job, ss]) => {
                const m = Math.round(ss.reduce((a,s) => a + s.annualSalary, 0) / ss.length);
                return (
                  <div key={job} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:11, color:C.sub, width:150, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job}</span>
                    <div style={{ flex:1, height:5, background:"#E5E7EB", position:"relative" }}>
                      <div style={{ position:"absolute", left:0, top:0, height:"100%", width: Math.min((m / 1500) * 100, 100) + "%", background:"#1a5276" }} />
                    </div>
                    <span style={{ fontSize:12, fontWeight:"bold", color:"#1a5276", width:44, textAlign:"right" }}>{m}万</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:12, color:C.sub }}>{sals.length}件の年収情報</span>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ 年収情報を投稿する"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="職種 *">
              <div style={{ display:"flex", gap:8 }}>
                <select style={{...S.input, flex:1}} value={form.jobType === "__custom__" ? "__custom__" : form.jobType} onChange={e => {
                  if (e.target.value === "__custom__") setForm({...form, jobType:"__custom__"});
                  else setForm({...form, jobType:e.target.value});
                }}>
                  <option value="">選択してください</option>
                  {getJobCategories(co.group || co.industry).filter(j => j !== "全職種").map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom__">＋ 新しい職種を追加する</option>
                </select>
                {form.jobType === "__custom__" && (
                  <input style={{...S.input, flex:1}} placeholder="例：CRMマーケター" autoFocus onChange={e => setForm({...form, jobType:e.target.value})} />
                )}
              </div>
            </Fld>
            <Fld label="役職">
              <select style={S.input} value={form.position} onChange={e => setForm({ ...form, position:e.target.value })}>
                <option value="">選択</option>
                {POSITIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="年齢帯 *">
              <select style={S.input} value={form.ageRange} onChange={e => setForm({ ...form, ageRange:e.target.value })}>
                <option value="">選択</option>
                {AGE_RANGES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
            <Fld label="在籍形態">
              <select style={S.input} value={form.empType} onChange={e => setForm({ ...form, empType:e.target.value })}>
                {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <Fld label="年収（万円）*"><input style={S.input} type="number" placeholder="600" value={form.annualSalary} onChange={e => setForm({ ...form, annualSalary:e.target.value })} /></Fld>
            <Fld label="月給（万円）" ><input style={S.input} type="number" placeholder="40"  value={form.baseSalary}   onChange={e => setForm({ ...form, baseSalary:  e.target.value })} /></Fld>
            <Fld label="賞与（万円）" ><input style={S.input} type="number" placeholder="120" value={form.bonus}        onChange={e => setForm({ ...form, bonus:       e.target.value })} /></Fld>
          </div>
          <div style={{ background:"#F9FAFB", border:"1px solid " + C.border, padding:"12px 14px", borderRadius:6, marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:"bold", marginBottom:10, color:C.ink }}>福利厚生</div>
            <Fld label="家賃補助">
              <select style={S.input} value={form.housingAllowance} onChange={e => setForm({...form, housingAllowance:e.target.value})}>
                {HOUSING_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Fld label="月間残業時間（任意）"><input style={S.input} placeholder="例：30時間" value={form.overtime} onChange={e => setForm({...form, overtime:e.target.value})} /></Fld>
              <Fld label="有給消化率（任意）"><input style={S.input} placeholder="例：60%" value={form.paidLeave} onChange={e => setForm({...form, paidLeave:e.target.value})} /></Fld>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:8 }}>
              <div>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer", marginBottom:6 }}>
                  <input type="checkbox" checked={form.hasRetirementPlan} onChange={e => setForm({...form, hasRetirementPlan:e.target.checked})} />
                  退職金制度あり
                </label>
                {form.hasRetirementPlan && (
                  <textarea style={{...S.input, resize:"vertical", fontSize:12}} rows={2} placeholder="退職金制度の詳細（金額・制度名など）" value={form.retirementPlanComment} onChange={e => setForm({...form, retirementPlanComment:e.target.value})} />
                )}
              </div>
              <div>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer", marginBottom:6 }}>
                  <input type="checkbox" checked={form.hasFamilyAllowance} onChange={e => setForm({...form, hasFamilyAllowance:e.target.checked})} />
                  家族手当あり
                </label>
                {form.hasFamilyAllowance && (
                  <textarea style={{...S.input, resize:"vertical", fontSize:12}} rows={2} placeholder="家族手当の詳細（配偶者○万円、子○万円など）" value={form.familyAllowanceComment} onChange={e => setForm({...form, familyAllowanceComment:e.target.value})} />
                )}
              </div>
            </div>
          </div>
          <Fld label="コメント">
            <textarea style={{ ...S.input, resize:"vertical" }} rows={2} value={form.comment} onChange={e => setForm({ ...form, comment:e.target.value })} />
          </Fld>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.jobType || !form.ageRange || !form.annualSalary) return;
            await onAddSalary({ ...form, annualSalary: Number(form.annualSalary), baseSalary: Number(form.baseSalary) || 0, bonus: Number(form.bonus) || 0 });
            setForm(null);
          }}>
            年収情報を投稿する
          </button>
        </div>
      )}
      {sals.length === 0 && <Empty text="まだ年収情報がありません" />}
      {sals.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map((s, idx) => {
        const isLocked = !unlocked && idx >= 1;
        return (
        <div key={s.id} style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px", marginBottom:10, position:"relative", filter: isLocked ? "blur(5px)" : "none", pointerEvents: isLocked ? "none" : "auto", userSelect: isLocked ? "none" : "auto" }}>
          {isAdmin && (
            <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:8 }}>
              <SmBtn onClick={() => setEditTgt({ type:"salary", data:s })}>編集</SmBtn>
              <SmBtn red onClick={() => adminDelete("salary", s.id)}>削除</SmBtn>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:"bold", color:"#1a5276", fontFamily:"'Zen Kaku Gothic New', sans-serif", marginBottom:4 }}>{s.annualSalary}<span style={{ fontSize:13, fontWeight:"normal", color:C.sub }}>万円/年</span></div>
              {[s.jobType, s.position, s.ageRange, s.empType].filter(Boolean).map(t => (
                <span key={t} style={{ fontSize:11, color:C.sub, border:"1px solid " + C.border, padding:"1px 6px", marginRight:4 }}>{t}</span>
              ))}
            </div>
            <div style={{ fontSize:12, color:C.sub, textAlign:"right" }}>
              {s.baseSalary ? <div>月給 <strong>{s.baseSalary}万円</strong></div> : null}
              {s.bonus      ? <div>賞与 <strong>{s.bonus}万円</strong></div>      : null}
              <div style={{ marginTop:4 }}>{ago(s.createdAt)}</div>
            </div>
          </div>
          {(s.housingAllowance && s.housingAllowance !== "なし") || s.hasRetirementPlan || s.hasFamilyAllowance || s.overtime || s.paidLeave ? (
            <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid " + C.border }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:6 }}>
                {s.housingAllowance && s.housingAllowance !== "なし" && <span style={{ fontSize:11, background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"2px 8px", borderRadius:4 }}>家賃補助: {s.housingAllowance}</span>}
                {s.hasRetirementPlan && <span style={{ fontSize:11, background:"#F0FDF4", color:"#166534", border:"1px solid #BBF7D0", padding:"2px 8px", borderRadius:4 }}>退職金制度あり</span>}
                {s.hasFamilyAllowance && <span style={{ fontSize:11, background:"#F0FDF4", color:"#166534", border:"1px solid #BBF7D0", padding:"2px 8px", borderRadius:4 }}>家族手当あり</span>}
                {s.overtime && <span style={{ fontSize:11, background:"#FFF7ED", color:"#C2410C", border:"1px solid #FED7AA", padding:"2px 8px", borderRadius:4 }}>残業: {s.overtime}</span>}
                {s.paidLeave && <span style={{ fontSize:11, background:"#FFF7ED", color:"#C2410C", border:"1px solid #FED7AA", padding:"2px 8px", borderRadius:4 }}>有給消化率: {s.paidLeave}</span>}
              </div>
              {(s.retirementPlanComment || s.familyAllowanceComment) && (
                <div style={{ paddingLeft:8 }}>
                  {s.retirementPlanComment && (
                    <div style={{ marginBottom:6, paddingLeft:10, borderLeft:"2px solid #BBF7D0" }}>
                      <div style={{ fontSize:10, fontWeight:"bold", color:"#166534", marginBottom:2 }}>退職金制度</div>
                      <p style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>{s.retirementPlanComment}</p>
                    </div>
                  )}
                  {s.familyAllowanceComment && (
                    <div style={{ paddingLeft:10, borderLeft:"2px solid #BBF7D0" }}>
                      <div style={{ fontSize:10, fontWeight:"bold", color:"#166534", marginBottom:2 }}>家族手当</div>
                      <p style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>{s.familyAllowanceComment}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
          {s.comment && <p style={{ fontSize:13, lineHeight:1.85, borderTop:"1px solid " + C.border, paddingTop:10, marginTop:8 }}>{s.comment}</p>}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
            <AC>{ini(s.author)}</AC><span style={{ fontSize:12, color:C.sub }}>{s.author}</span>
            {getAuthorBadge && getAuthorBadge(s.authorUid) && <BadgeChip badge={getAuthorBadge(s.authorUid)} small />}
          </div>
        </div>
        );
      })}
      {!unlocked && sals.length > 1 && <LockedContent setAuthMode={setAuthMode} count={sals.length - 1} type="年収情報" sess={sess} />}
    </div>
  );
}

// ─── 募集要項タブ（過去求人も蓄積）────────────────────────────────────────────
function JobsTab({ jobs, co, uName, onAddJob, isAdmin, adminDelete, setEditTgt }) {
  const [form,   setForm]   = useState(null);
  const [expand, setExpand] = useState(null);
  const initF = { companyId:co.id, title:"", jobType:"", empType:"正社員", postedDate:today(), closingDate:"", salary:"", location:"", requirements:"", content:"", url:"" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <div>
          <span style={{ fontSize:12, color:C.sub }}>{jobs.length}件の募集要項</span>
          <span style={{ fontSize:11, color:"#888", marginLeft:8 }}>（過去の求人情報も含む）</span>
        </div>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ 募集要項を追加する"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="職種・ポジション名 *"><input style={S.input} placeholder="例：Webエンジニア" value={form.title} onChange={e => setForm({ ...form, title:e.target.value })} /></Fld>
            <Fld label="職種カテゴリ">
              <select style={S.input} value={form.jobType} onChange={e => setForm({ ...form, jobType:e.target.value })}>
                <option value="">選択</option>
                {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <Fld label="雇用形態"><select style={S.input} value={form.empType}     onChange={e => setForm({ ...form, empType:     e.target.value })}>{EMP_TYPES.map(t => <option key={t}>{t}</option>)}</select></Fld>
            <Fld label="掲載開始日"><input style={S.input} type="date" value={form.postedDate}  onChange={e => setForm({ ...form, postedDate:  e.target.value })} /></Fld>
            <Fld label="応募締切日"><input style={S.input} type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} /></Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="給与・報酬"><input style={S.input} placeholder="例：年収500~800万円"  value={form.salary}   onChange={e => setForm({ ...form, salary:   e.target.value })} /></Fld>
            <Fld label="勤務地">    <input style={S.input} placeholder="例：東京・リモート可" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Fld>
          </div>
          <Fld label="応募要件">
            <textarea style={{ ...S.input, resize:"vertical" }} rows={3} placeholder="必須スキル・経験年数・資格など" value={form.requirements} onChange={e => setForm({ ...form, requirements:e.target.value })} />
          </Fld>
          <Fld label="仕事内容 *">
            <textarea style={{ ...S.input, resize:"vertical" }} rows={5} placeholder="業務内容・職場環境・福利厚生など" value={form.content} onChange={e => setForm({ ...form, content:e.target.value })} />
          </Fld>
          <Fld label="求人URL（任意）">
            <input style={S.input} type="url" placeholder="https://..." value={form.url} onChange={e => setForm({ ...form, url:e.target.value })} />
          </Fld>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.title.trim() || !form.content.trim()) return;
            await onAddJob(form);
            setForm(null);
          }}>
            募集要項を追加する
          </button>
        </div>
      )}
      {jobs.length === 0 && <Empty text="まだ募集要項が登録されていません。知っている求人情報があれば追加してください。" />}
      {[...jobs].sort((a,b) => (b.postedDate || "").localeCompare(a.postedDate || "")).map(j => {
        const ended = j.closingDate && new Date(j.closingDate) < new Date();
        return (
          <div key={j.id} style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px", marginBottom:10 }}>
            {isAdmin && (
              <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:8 }}>
                <SmBtn onClick={() => setEditTgt({ type:"job", data:j })}>編集</SmBtn>
                <SmBtn red onClick={() => adminDelete("job", j.id)}>削除</SmBtn>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:10 }}>
              <div>
                <h3 style={{ fontSize:15, fontWeight:"bold", marginBottom:6, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{j.title}</h3>
                <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                  {[j.jobType, j.empType, j.location].filter(Boolean).map(t => (
                    <span key={t} style={{ fontSize:11, color:C.sub, border:"1px solid " + C.border, padding:"1px 8px" }}>{t}</span>
                  ))}
                  {j.salary && <span style={{ fontSize:11, color:"#1a5276", fontWeight:"bold", border:"1px solid #1a5276", padding:"1px 8px" }}>{j.salary}</span>}
                </div>
              </div>
              <div style={{ textAlign:"right", fontSize:11, color:C.sub }}>
                <div>掲載: {j.postedDate || "-"}</div>
                {j.closingDate && (
                  <div style={{ color: ended ? "#aaa" : C.accent, fontWeight:"bold" }}>
                    締切: {j.closingDate}{ended ? " （終了）" : ""}
                  </div>
                )}
              </div>
            </div>
            {j.requirements && (
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>応募要件</div>
                <p style={{ fontSize:13, lineHeight:1.8 }}>{j.requirements}</p>
              </div>
            )}
            <div>
              <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>仕事内容</div>
              <p style={{ fontSize:13, lineHeight:1.85, whiteSpace:"pre-wrap" }}>
                {expand === j.id ? j.content : (j.content && j.content.length > 120 ? j.content.slice(0,120) + "..." : j.content)}
              </p>
              {j.content && j.content.length > 120 && (
                <button style={{ background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", fontFamily:"inherit", display:"block", marginTop:4 }} onClick={() => setExpand(expand === j.id ? null : j.id)}>
                  {expand === j.id ? "▴ 閉じる" : "▾ 続きを読む"}
                </button>
              )}
            </div>
            {j.url && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
                <a href={j.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:C.accent, textDecoration:"underline" }}>求人ページを見る →</a>
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
              <AC>{ini(j.author)}</AC><span style={{ fontSize:12, color:C.sub }}>{j.author} · {ago(j.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ランキング ───────────────────────────────────────────────────────────────
function RankingPage({ go, companies, coPosts, coRevs, coSals, isMobile }) {
  const [tab, setTab] = useState("rating");
  const ranked = companies.map(co => {
    const a   = calcAvg(coRevs(co.id));
    const sal = calcAvgSal(coSals(co.id));
    return { ...co, rating:a?.overall || 0, salary:sal || 0, activity: coPosts(co.id).length + coRevs(co.id).length, avgObj:a };
  });
  const sorted = tab === "rating"  ? [...ranked].sort((a,b) => b.rating   - a.rating)
    : tab === "salary"  ? [...ranked].filter(c => c.salary > 0).sort((a,b) => b.salary   - a.salary)
    : [...ranked].sort((a,b) => b.activity - a.activity);

  return (
    <div>
      <PageHeader title="企業ランキング" desc="評価・年収・活発さで企業を比較" />
      <div style={{ display:"flex", borderBottom:"2px solid " + C.ink, marginTop:0, marginBottom:20 }}>
        {[["rating","総合評価順"],["salary","平均年収順"],["activity","投稿数順"]].map(([k,l]) => (
          <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? C.accent : C.sub, borderBottom:"3px solid " + (tab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500" }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width:28 }}>順位</th>
            <th style={S.th}>企業名</th>
            {!isMobile && <th style={S.th}>業界</th>}
            <th style={{ ...S.th, textAlign:"center" }}>評価</th>
            <th style={{ ...S.th, textAlign:"right" }}>年収</th>
            {!isMobile && <th style={{ ...S.th, textAlign:"center" }}>投稿数</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((co, i) => (
            <tr key={co.id} style={{ ...S.tableRow, cursor:"pointer" }} onClick={() => go("company", co)}>
              <td style={S.td}><span style={{ fontSize:15, fontWeight:"bold", color: i < 3 ? C.accent : "#bbb", fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{i + 1}</span></td>
              <td style={S.td}><div style={{ display:"flex", alignItems:"center", gap:8 }}><CompanyLogo company={co} size={28} /><span style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</span></div></td>
              {!isMobile && <td style={{ ...S.td, fontSize:12, color:C.sub }}>{co.industry}</td>}
              <td style={{ ...S.td, textAlign:"center" }}>
                {co.avgObj
                  ? <span><Stars r={co.avgObj.overall} size={11} /><span style={{ fontSize:12, fontWeight:"bold", color:C.accent, marginLeft:4 }}>{co.avgObj.overall.toFixed(1)}</span></span>
                  : <span style={{ color:C.sub, fontSize:12 }}>-</span>
                }
              </td>
              <td style={{ ...S.td, textAlign:"right", fontSize:13, fontWeight:"bold", color:"#1a5276" }}>{co.salary ? (co.salary + "万円") : "-"}</td>
              {!isMobile && <td style={{ ...S.td, textAlign:"center", fontSize:12 }}>{co.activity}件</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 料金ページ ───────────────────────────────────────────────────────────────
function PricingPage({ sess, go, setAuthMode, plan, upgradePlan, isMobile }) {
  const [billing, setBilling] = useState("monthly");
  const targetDate = useRef(new Date("2026-06-30T23:59:59").getTime());
  const [rem, setRem] = useState(0);
  useEffect(() => {
    const tick = () => setRem(Math.max(0, targetDate.current - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.floor(rem / 1000);
  const pad = n => String(n).padStart(2, "0");
  const countdown = [[Math.floor(sec / 86400),"日"],[Math.floor((sec % 86400) / 3600),"時間"],[Math.floor((sec % 3600) / 60),"分"],[sec % 60,"秒"]];

  const plans = [
    { id:"free",     name:"無料プラン",  price:0,    color:"#555",    desc:"まず閲覧・投稿を試したい方へ",       features:["企業情報・体験談の閲覧","登録不要で投稿・コメント可能","掲示板・募集要項の閲覧"], limits:["口コミ・年収全文は閲覧不可"] },
    { id:"standard", name:"スタンダード", price:980,  color:"#1a5276", desc:"転職活動中の方に最適",               features:["口コミ・年収情報の全文閲覧","すべての機能を制限なしで利用"],             limits:["CSV出力不可"], popular:true },
    { id:"premium",  name:"プレミアム",  price:2980, color:"#7B0000", desc:"本気で転職を成功させたい方へ",       features:["スタンダードの全機能","データのCSV出力","優先サポート","新機能の先行利用"],  limits:[] },
  ];

  return (
    <div>
      <PageHeader title="料金プラン" desc="" />
      <div style={{ background:C.accent, color:"#fff", padding:"14px 20px", marginBottom:24, textAlign:"center" }}>
        <div style={{ fontSize:11, letterSpacing:"0.12em", fontWeight:"bold", marginBottom:6 }}>期間限定キャンペーン実施中 - 残り時間</div>
        <div style={{ display:"flex", gap:4, alignItems:"center", justifyContent:"center", marginBottom:6 }}>
          {countdown.map(([n,l], i) => (
            <span key={l} style={{ display:"inline-flex", flexDirection:"column", alignItems:"center" }}>
              <span style={{ background:"rgba(255,255,255,0.2)", fontWeight:"bold", fontFamily:"'Zen Kaku Gothic New', sans-serif", fontSize:20, minWidth:34, textAlign:"center", padding:"3px 0", display:"block" }}>{pad(n)}</span>
              <span style={{ fontSize:9, marginTop:2 }}>{l}</span>
            </span>
          ))}
        </div>
        <div style={{ fontSize:12 }}>スタンダード・プレミアムが初月50%オフ - 正式リリース後は通常価格に戻ります</div>
      </div>
      <div style={{ border:"2px solid " + C.accent, padding:"14px 18px", marginBottom:20 }}>
        <div style={{ fontWeight:"bold", fontSize:14, marginBottom:4 }}>現在、すべての有料機能を<span style={{ color:C.accent }}>無料</span>でご利用いただけます</div>
        <p style={{ fontSize:12, color:C.sub, lineHeight:1.8 }}>ベータテスト期間中につき全機能を無料開放中です。早期登録者には正式リリース後も現行価格での継続利用を保証します。</p>
      </div>
      <div style={{ display:"flex", gap:0, marginBottom:20, border:"1px solid " + C.border, width:"fit-content" }}>
        {[["monthly","月払い"],["annual","年払い（2ヶ月分無料）"]].map(([k,l]) => (
          <button key={k} style={{ border:"none", padding:"8px 18px", fontSize:12, cursor:"pointer", fontFamily:"inherit", background: billing===k ? C.ink : "#F7F7F7", color: billing===k ? "#fff" : C.sub }} onClick={() => setBilling(k)}>{l}</button>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 12 : 0, maxWidth:900 }}>
        {plans.map((pl, i) => {
          const base     = billing === "annual" ? Math.floor(pl.price * 10 / 12) : pl.price;
          const disp     = pl.price === 0 ? 0 : Math.floor(base * 0.5);
          const isCurrent = plan === pl.id;
          return (
            <div key={pl.id} style={{ background:C.surface, position:"relative", ...(pl.popular ? { boxShadow:"0 0 0 2px #9B0000" } : {}), ...(isMobile ? {} : { borderRight: i < 2 ? "1px solid " + C.border : "none" }) }}>
              {pl.popular && <div style={{ position:"absolute", top:-11, left:"50%", transform:"translateX(-50%)", background:C.accent, color:"#fff", fontSize:10, padding:"2px 12px", fontWeight:"bold", whiteSpace:"nowrap" }}>人気No.1</div>}
              <div style={{ borderTop:"3px solid " + pl.color, padding:"18px 20px 14px" }}>
                <div style={{ fontSize:10, fontWeight:"bold", color:pl.color, letterSpacing:"0.1em", marginBottom:5 }}>{pl.name.toUpperCase()}</div>
                {pl.price === 0
                  ? <div style={{ fontSize:24, fontWeight:"bold", fontFamily:"'Zen Kaku Gothic New', sans-serif", marginBottom:4 }}>無料</div>
                  : (
                    <div style={{ marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                        <span style={{ fontSize:24, fontWeight:"bold", fontFamily:"'Zen Kaku Gothic New', sans-serif", color:C.accent }}>{"¥" + disp.toLocaleString()}</span>
                        <span style={{ fontSize:12, color:C.sub }}>/月</span>
                        <span style={{ fontSize:12, color:"#bbb", textDecoration:"line-through" }}>{"¥" + base.toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize:10, color:C.accent, fontWeight:"bold", marginTop:2 }}>初月50%OFFキャンペーン中</div>
                    </div>
                  )
                }
                <p style={{ fontSize:11, color:C.sub, marginBottom:12, lineHeight:1.6 }}>{pl.desc}</p>
                {isCurrent
                  ? <div style={{ border:"1px solid " + C.border, textAlign:"center", padding:"8px", fontSize:12, color:C.sub }}>現在のプラン</div>
                  : sess ? (
                    <div>
                      <button style={{ ...S.primaryBtn, width:"100%", padding:"9px", fontSize:12, background:pl.color, border:"none" }} onClick={() => upgradePlan(pl.id)}>
                        このプランに変更する（β無料）
                      </button>
                      <p style={{ fontSize:10, color:C.sub, textAlign:"center", marginTop:4 }}>
                        ベータ期間中は無料。Stripe課金は正式リリース時に有効化されます。
                      </p>
                    </div>
                  ) : (
                    <button style={{ ...S.primaryBtn, width:"100%", padding:"9px", fontSize:12, background:pl.color, border:"none" }} onClick={() => setAuthMode("register")}>
                      無料登録して始める →
                    </button>
                  )
                }
                {pl.id !== "free" && !isCurrent && <p style={{ fontSize:10, color:C.sub, textAlign:"center", marginTop:5 }}>クレジットカード不要・いつでも解約可</p>}
              </div>
              <div style={{ borderTop:"1px solid " + C.border, padding:"12px 20px" }}>
                {pl.features.map(f => <div key={f} style={{ display:"flex", gap:6, marginBottom:5, fontSize:12 }}><span style={{ color:"#16A34A", flexShrink:0, fontWeight:"bold" }}>✓</span><span>{f}</span></div>)}
                {pl.limits.map(f  => <div key={f} style={{ display:"flex", gap:6, marginBottom:5, fontSize:12, color:"#aaa"    }}><span style={{ flexShrink:0 }}>-</span><span>{f}</span></div>)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ background:"#FFF8F0", border:"1px solid #E8C97A", borderLeft:"4px solid " + C.accent, padding:"12px 16px", marginTop:20 }}>
        <p style={{ fontSize:12, color:C.sub, lineHeight:1.8 }}>
          ※ ベータ期間中は全プランが無料です。正式リリース時にStripeによる課金を有効化します。<br />
          ※ Stripe連携は Firebase Extensions で1クリックで追加可能です（App.jsxのコメントに手順あり）。<br />
          ※ 早期登録ユーザーには現行価格での継続利用を保証します。
        </p>
      </div>
    </div>
  );
}

// ─── 企業追加 ─────────────────────────────────────────────────────────────────
function AddCompanyPage({ go, onSubmit, uName, authUser, setAuthMode }) {
  const [f,   setF]   = useState({ name:"", group:"", industry:"", emoji:"🏢", established:"", employees:"", website:"" });
  const [err, setErr] = useState("");
  const subs = f.group ? (INDUSTRY_GROUPS[f.group] || []) : [];

  return (
    <div style={{ maxWidth:620, margin:"0 auto" }}>
      <PageHeader title="企業を追加する" desc="まだ掲載されていない企業を追加できます。無料会員登録が必要です。" />
      <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px" }}>
        {err && <div style={S.errBox}>{err}</div>}
        <Fld label="企業名 *">
          <input style={S.input} placeholder="例：株式会社○○" value={f.name} onChange={e => setF({ ...f, name:e.target.value })} />
        </Fld>
        <Fld label="業界（大分類）*">
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {ALL_GROUPS.map(g => (
              <button key={g} style={{ border:"1px solid " + C.border, background: f.group === g ? C.ink : "#F7F7F7", color: f.group === g ? "#fff" : C.sub, padding:"5px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setF({ ...f, group:g, industry:"" })}>
                {g}
              </button>
            ))}
          </div>
        </Fld>
        {subs.length > 0 && (
          <Fld label="業界（小分類）">
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {subs.map(s => (
                <button key={s} style={{ border:"1px solid " + C.border, background: f.industry === s ? C.accent : "#F7F7F7", color: f.industry === s ? "#fff" : C.sub, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setF({ ...f, industry:s })}>
                  {s}
                </button>
              ))}
            </div>
          </Fld>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Fld label="設立年（任意）"><input style={S.input} placeholder="例：1990" value={f.established} onChange={e => setF({...f, established:e.target.value})} /></Fld>
          <Fld label="従業員数（任意）"><input style={S.input} placeholder="例：5000人" value={f.employees} onChange={e => setF({...f, employees:e.target.value})} /></Fld>
        </div>
        <Fld label="公式サイトURL（任意）"><input style={S.input} placeholder="https://..." value={f.website} onChange={e => setF({...f, website:e.target.value})} /></Fld>
        {!authUser
          ? <div style={{ padding:"12px 14px", background:"#FFF8F0", border:"1px solid #E8C97A", marginBottom:12, fontSize:13 }}>
              企業を追加するには <button style={S.textLink} onClick={() => setAuthMode && setAuthMode("login")}>ログイン</button> が必要です（無料）
            </div>
          : <div style={{ padding:"10px 0", borderTop:"1px solid " + C.border, fontSize:12, color:C.sub }}>{uName} として追加されます</div>
        }
        <button style={{ ...S.primaryBtn, width:"100%", padding:"12px" }} onClick={async () => {
          if (!f.name.trim() || !f.group) { setErr("企業名と業界は必須です"); return; }
          const emoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
          await onSubmit({ ...f, emoji, industry: f.industry || f.group });
        }}>
          企業を追加する
        </button>
      </div>
    </div>
  );
}

// ─── マイページ ───────────────────────────────────────────────────────────────
function MyPage({ sess, go, companies, plan, upgradePlan, isMobile, diary, saveDiary, myPosts, myRevs, favPosts, favorites, profile, updateNotifications, markNotificationRead, clearNotifications, toggleFollowCompany, replyNotifs, markNotifsSeen, goThread, tracker, saveTracker, saveVerifications }) {
  const [mTab, setMTab] = useState("activity");
  const pl = PLANS[plan];

  if (!sess) {
    return (
      <div style={{ textAlign:"center", padding:"48px 20px" }}>
        <p style={{ marginBottom:14, color:C.sub }}>マイページはログインが必要です</p>
        <button style={S.primaryBtn} onClick={() => go("home")}>トップに戻る</button>
      </div>
    );
  }

  const exportCSV = () => {
    const rows = [["日付","企業","タイトル","段階"], ...myPosts.map(p => [
      p.createdAt?.toDate?.()?.toISOString().slice(0,10) || "",
      (companies.find(c => c.id === p.companyId) || {}).name || "",
      p.title, p.stage,
    ])];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv);
    a.download = "careerclub.csv";
    a.click();
  };

  return (
    <div>
      <PageHeader title="マイページ" desc="投稿履歴・就活日記・プラン情報" />
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "240px 1fr", gap:20, alignItems:"start" }}>
        <div style={{ border:"1px solid " + C.border, borderTop:"3px solid " + pl.color }}>
          <div style={{ padding:"16px 14px", borderBottom:"1px solid " + C.border }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <span style={{ background:pl.color, color:"#fff", width:34, height:34, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:"bold" }}>{ini(sess.displayName)}</span>
              <div>
                <div style={{ fontWeight:"bold", fontSize:14 }}>{sess.displayName}</div>
                <div style={{ fontSize:11, color:C.sub }}>{sess.email || ""}</div>
              </div>
            </div>
            <span style={{ background:pl.color, color:"#fff", fontSize:11, padding:"2px 10px", fontWeight:"bold" }}>{pl.name}</span>
            {plan !== "premium" && <button style={{ ...S.textLink, fontSize:11, marginLeft:8 }} onClick={() => go("pricing")}>変更 →</button>}
          </div>
          <div style={{ padding:"12px 14px" }}>
            {/* 投稿者バッジ */}
            {(() => {
              const totalPosts = (profile && profile.postCount) || 0;
              const myBadge = getBadge(totalPosts);
              const nextBadge = BADGES.slice().reverse().find(b => b.min > totalPosts);
              return (
                <div style={{ marginBottom:12, padding:"10px 12px", background: myBadge ? myBadge.bg : "#F5F8FC", borderRadius:8, border:"1px solid " + (myBadge ? myBadge.color + "33" : C.border) }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:24 }}>{myBadge ? myBadge.emoji : "🌱"}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:"bold", color: myBadge ? myBadge.color : C.sub }}>
                        {myBadge ? myBadge.name + "ランク" : "未投稿"}
                      </div>
                      <div style={{ fontSize:10, color:C.sub }}>累計 {totalPosts}件 投稿</div>
                    </div>
                  </div>
                  {nextBadge && (
                    <div style={{ fontSize:10, color:C.sub }}>
                      {nextBadge.name}まで あと <strong>{nextBadge.min - totalPosts}件</strong>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* 閲覧ステータス（全開放） */}
            <div style={{ marginBottom:12, padding:"8px 12px", background:"#F0FDF4", borderRadius:6, fontSize:11, color:"#166534", border:"1px solid #BBF7D0" }}>
              <strong>✓ 全コンテンツ閲覧可能</strong><br /><span style={{ fontSize:10 }}>登録不要で、すべての投稿が読めます</span>
            </div>
            {/* もらったいいね数 */}
            {(() => {
              const totalLikes = myPosts.reduce((sum, p) => sum + ((p.likes || []).length), 0)
                              + myRevs.reduce((sum, r) => sum + ((r.likes || []).length), 0);
              if (totalLikes === 0) return null;
              return (
                <div style={{ marginBottom:12, padding:"10px 12px", background:"#FEE2E2", border:"1px solid #FCA5A5", borderRadius:8 }}>
                  <div style={{ fontSize:11, color:"#991B1B", marginBottom:2 }}>あなたの投稿が獲得した</div>
                  <div style={{ fontSize:18, fontWeight:"bold", color:"#DC2626" }}>❤️ {totalLikes} いいね</div>
                </div>
              );
            })()}
            {[["体験談", myPosts.length + "件"],["口コミ", myRevs.length + "件"],["お気に入り", (favorites||[]).length + "件"],["日記", diary.length + "件"]].map(([l,v]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid " + C.border, fontSize:12 }}>
                <span style={{ color:C.sub }}>{l}</span><span style={{ fontWeight:"bold" }}>{v}</span>
              </div>
            ))}
          </div>
          {plan === "premium" && (
            <div style={{ padding:"10px 14px", borderTop:"1px solid " + C.border }}>
              <button style={{ ...S.secondaryBtn, width:"100%", fontSize:12 }} onClick={exportCSV}>CSV出力</button>
            </div>
          )}
        </div>
        <div>
          <div style={{ display:"flex", borderBottom:"2px solid " + C.ink, marginBottom:14 }}>
            {[["activity","投稿履歴"],["favorites","お気に入り"],["notifications", "🔔 通知" + ((replyNotifs || []).length > 0 ? ` (${(replyNotifs || []).length})` : "")],["diary","就活日記"],["tracker","📊 選考管理"],["settings","⚙ 設定"]].map(([k,l]) => (
              <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: mTab===k ? C.accent : C.sub, borderBottom:"3px solid " + (mTab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: mTab===k ? "bold" : "500" }} onClick={() => setMTab(k)}>{l}</button>
            ))}
          </div>
          {mTab === "diary" && <DiarySection entries={diary} onSave={saveDiary} />}
          {mTab === "tracker" && <TrackerSection entries={tracker} onSave={saveTracker} />}
          {mTab === "favorites" && (
            <div>
              <STitle label={"お気に入りした投稿（" + (favPosts||[]).length + "件）"} />
              {(favPosts||[]).length === 0
                ? <Empty text="まだお気に入りがありません。投稿の☆ボタンで追加できます。" />
                : (favPosts||[]).map(p => (
                    <div key={p.id} style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", companies.find(c => c.id === p.companyId))}>
                      <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
                        <StageBadge s={p.stage} />
                        {p.jobCategory && p.jobCategory !== "全職種" && <span style={{ fontSize:10, background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"1px 7px", fontWeight:"bold" }}>{p.jobCategory}</span>}
                        <span style={{ fontSize:10, color:C.sub, marginLeft:"auto" }}>{ago(p.createdAt)}</span>
                      </div>
                      <div style={{ fontWeight:"bold", fontSize:13, marginBottom:3 }}>{p.title}</div>
                      <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>{(companies.find(c => c.id === p.companyId) || {}).name}</div>
                      <div style={{ fontSize:12, color:C.sub, lineHeight:1.7 }}>{p.content && p.content.slice(0, 80)}{p.content && p.content.length > 80 ? "..." : ""}</div>
                    </div>
                  ))
              }
            </div>
          )}
          {mTab === "activity" && (
            <div>
              <STitle label="投稿した体験談" />
              {myPosts.length === 0
                ? <Empty text="まだ投稿がありません" />
                : myPosts.map(p => (
                    <div key={p.id} style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", companies.find(c => c.id === p.companyId))}>
                      <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}><StageBadge s={p.stage} /><span style={{ fontSize:11, color:C.sub, marginLeft:"auto" }}>{ago(p.createdAt)}</span></div>
                      <div style={{ fontWeight:"bold", fontSize:13, marginBottom:3 }}>{p.title}</div>
                      <div style={{ fontSize:11, color:C.sub }}>{(companies.find(c => c.id === p.companyId) || {}).name}</div>
                    </div>
                  ))
              }
              <div style={{ marginTop:16 }} />
              <STitle label="投稿した口コミ" />
              {myRevs.length === 0
                ? <Empty text="まだ口コミがありません" />
                : myRevs.map(r => (
                    <div key={r.id} style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", companies.find(c => c.id === r.companyId), "review")}>
                      <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}><Stars r={r.overall} size={12} /><span style={{ fontWeight:"bold", color:C.accent, fontSize:12 }}>{r.overall.toFixed(1)}</span><span style={{ fontSize:11, color:C.sub, marginLeft:"auto" }}>{ago(r.createdAt)}</span></div>
                      <div style={{ fontSize:11, color:C.sub }}>{(companies.find(c => c.id === r.companyId) || {}).name} · {r.empType} · {r.tenure}</div>
                    </div>
                  ))
              }
            </div>
          )}
          {mTab === "notifications" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border }}>
                <span style={{ fontSize:12, color:C.sub }}>{(replyNotifs || []).length}件の新着返信</span>
                {(replyNotifs || []).length > 0 && (
                  <button style={{ ...S.secondaryBtn, fontSize:11, padding:"5px 12px" }} onClick={() => markNotifsSeen && markNotifsSeen()}>すべて既読</button>
                )}
              </div>
              {(replyNotifs || []).length === 0
                ? <Empty text="新しい返信はありません。あなたの投稿にコメントが付くとここに表示されます。" />
                : (replyNotifs || []).map((n, i) => (
                    <div key={n.comment.id + "_" + i} style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:8, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}
                      onClick={() => { if (goThread) goThread(n.post); if (markNotifsSeen) markNotifsSeen(); }}>
                      <div style={{ fontSize:13, fontWeight:"bold", color:C.ink, marginBottom:4 }}>{(n.comment.author || "匿名")}さんが返信しました</div>
                      <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>「{n.post.title}」</div>
                      <div style={{ fontSize:12, color:C.ink, lineHeight:1.7, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{n.comment.content}</div>
                    </div>
                  ))
              }
            </div>
          )}
          {mTab === "settings" && (
            <div>
              <VerificationSection verifications={profile?.verifications} onSave={saveVerifications} />
              <STitle label="通知設定" />
              <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px", marginBottom:18 }}>
                <p style={{ fontSize:12, color:C.sub, marginBottom:14, lineHeight:1.7 }}>
                  通知が不要な項目はオフにできます。サイト内通知は常に表示されます（重要な通知のみ）。
                </p>
                {[
                  ["email",       "📧 メール通知を受け取る",      "オフにすると、すべてのメール通知が止まります"],
                  ["comments",    "💬 自分の投稿へのコメント",   "コメント・返信があった時に通知"],
                  ["likes",       "❤️ 投稿のマイルストーン",     "10/50/100いいね到達時に通知"],
                  ["weeklyDigest","📊 週次ダイジェスト",         "週1回、自分の投稿の反応をまとめてお知らせ"],
                  ["followedCos", "⭐ フォロー中の企業の新着",    "フォローした企業に新しい投稿があった時に通知"],
                ].map(([key, label, desc]) => {
                  const checked = (profile?.notifications || {})[key] !== false;
                  return (
                    <div key={key} style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"12px 0", borderBottom:"1px solid " + C.border }}>
                      <label style={{ display:"flex", alignItems:"center", cursor:"pointer", marginTop:2 }}>
                        <input type="checkbox" checked={checked} onChange={e => {
                          const newSettings = { ...(profile?.notifications || {}), [key]: e.target.checked };
                          updateNotifications && updateNotifications(newSettings);
                        }} style={{ width:18, height:18, cursor:"pointer" }} />
                      </label>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:"bold", color:C.ink, marginBottom:2 }}>{label}</div>
                        <div style={{ fontSize:11, color:C.sub, lineHeight:1.6 }}>{desc}</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop:14, padding:"10px 12px", background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:6, fontSize:11, color:"#0C4A6E", lineHeight:1.7 }}>
                  💡 通知メールには「通知を停止する」リンクが含まれています。メールから直接オフにすることもできます。
                </div>
              </div>

              <STitle label="フォロー中の企業" />
              <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px" }}>
                {(profile?.followedCompanies || []).length === 0
                  ? <p style={{ fontSize:12, color:C.sub, textAlign:"center", padding:"12px 0" }}>まだフォローしている企業はありません。<br />企業ページの「⭐ フォロー」ボタンで追加できます。</p>
                  : (profile?.followedCompanies || []).map(coId => {
                      const co = companies.find(c => c.id === coId);
                      if (!co) return null;
                      return (
                        <div key={coId} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid " + C.border }}>
                          <CompanyLogo company={co} size={28} />
                          <span style={{ flex:1, fontSize:13, fontWeight:"bold", color:C.ink, cursor:"pointer" }} onClick={() => go("company", co)}>{co.name}</span>
                          <button style={{ ...S.secondaryBtn, fontSize:11, padding:"4px 10px" }} onClick={() => toggleFollowCompany && toggleFollowCompany(coId)}>解除</button>
                        </div>
                      );
                    })
                }
              </div>

              {/* 連続投稿日数 */}
              {profile?.streak > 0 && (
                <>
                  <div style={{ marginTop:18 }} />
                  <STitle label="連続投稿記録" />
                  <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px", display:"flex", alignItems:"center", gap:14 }}>
                    {(() => {
                      const sb = getStreakBadge(profile.streak);
                      return (
                        <>
                          <span style={{ fontSize:36 }}>{sb ? sb.emoji : "🌱"}</span>
                          <div>
                            <div style={{ fontSize:18, fontWeight:"bold", color: sb ? sb.color : C.sub }}>{profile.streak}日連続</div>
                            <div style={{ fontSize:11, color:C.sub }}>{sb ? sb.name + "バッジ獲得中" : "投稿を続けるとバッジが獲得できます"}</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 就活日記 ─────────────────────────────────────────────────────────────────
function VerifyBadge({ v }) {
  if (!v) return null;
  const ok = v.status === "verified";
  return <span title={ok ? "認証済み" : "自己申告（未認証）"} style={{ display:"inline-flex", alignItems:"center", gap:2, background: ok ? "#ECFDF5" : C.light, color: ok ? "#047857" : C.sub, border:"1px solid " + (ok ? "#A7F3D0" : C.border), padding:"1px 7px", fontSize:9, fontWeight:"bold", borderRadius:10, whiteSpace:"nowrap", marginLeft:4 }}>{ok ? "✓" : "🪪"}{v.type}{ok ? "" : "(自己申告)"}</span>;
}

function VerificationSection({ verifications, onSave }) {
  const list = verifications || [];
  const [type, setType] = React.useState("在籍");
  const [company, setCompany] = React.useState("");
  const [email, setEmail] = React.useState("");
  const add = () => {
    if (!company.trim()) { alert("企業名を入力してください"); return; }
    if (type === "在籍" && (!email || !email.includes("@"))) { alert("勤務先メールアドレスを入力してください"); return; }
    const domain = type === "在籍" ? (email.split("@")[1] || "").toLowerCase().trim() : "";
    const v = { id: Math.random().toString(36).slice(2, 10), type, company: company.trim(), domain, status: "self", date: today() };
    onSave([v, ...list]); setCompany(""); setEmail("");
  };
  const remove = (id) => onSave(list.filter(v => v.id !== id));
  return (
    <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px", marginBottom:18 }}>
      <div style={{ fontSize:13, fontWeight:"bold", color:C.ink, marginBottom:6 }}>🪪 在籍・内定の登録</div>
      <p style={{ fontSize:11, color:C.sub, lineHeight:1.7, marginBottom:12 }}>
        登録すると、その企業の掲示板であなたの投稿に申告ラベルが付きます。<b style={{ color:"#B45309" }}>現在は自己申告（未認証）</b>で、勤務先メールによる本人認証は今後対応予定です。入力したメールアドレスは表示・公開されません。
      </p>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ ...S.input, fontSize:13, flex:"0 1 110px" }}>
          <option value="在籍">在籍中</option>
          <option value="内定">内定者</option>
          <option value="元社員">元社員</option>
        </select>
        <input value={company} onChange={e => setCompany(e.target.value)} placeholder="企業名（正式名称）" style={{ ...S.input, fontSize:13, flex:"1 1 150px" }} />
        {type === "在籍" && <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="勤務先メール" style={{ ...S.input, fontSize:13, flex:"1 1 150px" }} />}
        <button onClick={add} style={{ ...S.primaryBtn, padding:"8px 16px", fontSize:13 }}>登録</button>
      </div>
      {list.length === 0
        ? <p style={{ fontSize:11, color:C.sub }}>まだ登録がありません。</p>
        : list.map(v => (
            <div key={v.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:"1px solid " + C.border, fontSize:12 }}>
              <VerifyBadge v={v} />
              <span style={{ color:C.ink }}>{v.company}</span>
              {v.domain && <span style={{ color:C.sub, fontSize:11 }}>@{v.domain}</span>}
              <button onClick={() => remove(v.id)} title="削除" style={{ marginLeft:"auto", background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:16 }}>×</button>
            </div>
          ))}
    </div>
  );
}

function TrackerRow({ e, onStage, onRemove }) {
  const doneSet = ["内定", "内定辞退", "不合格", "辞退"];
  const isDone = doneSet.includes(e.stage);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"10px 12px", marginBottom:8, opacity: isDone ? 0.7 : 1 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:"bold", color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.company}</div>
        <div style={{ fontSize:10, color:C.sub, marginTop:2 }}>更新: {e.updated || e.date}</div>
      </div>
      <select value={e.stage} onChange={ev => onStage(e.id, ev.target.value)} style={{ ...S.input, fontSize:12, padding:"5px 8px", flex:"0 0 auto", maxWidth:130 }}>
        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button onClick={() => onRemove(e.id)} title="削除" style={{ background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:18, padding:"2px 4px", lineHeight:1 }}>×</button>
    </div>
  );
}

function TrackerSection({ entries, onSave }) {
  const [co, setCo] = React.useState("");
  const [stage, setStage] = React.useState(STAGES[0]);
  const list = entries || [];
  const add = () => {
    if (!co.trim()) return;
    const ne = { id: Math.random().toString(36).slice(2, 10), company: co.trim(), stage, date: today(), updated: today() };
    onSave([ne, ...list]); setCo("");
  };
  const onStage = (id, st) => onSave(list.map(e => e.id === id ? { ...e, stage: st, updated: today() } : e));
  const onRemove = (id) => onSave(list.filter(e => e.id !== id));
  const doneSet = ["内定", "内定辞退", "不合格", "辞退"];
  const active = list.filter(e => !doneSet.includes(e.stage));
  const done = list.filter(e => doneSet.includes(e.stage));
  return (
    <div>
      <STitle label="選考管理" />
      <p style={{ fontSize:12, color:C.sub, lineHeight:1.7, marginBottom:12 }}>応募中の企業と選考ステータスを記録できます（自分だけが見られます）。</p>
      <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
        <input value={co} onChange={e => setCo(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} placeholder="企業名" style={{ ...S.input, flex:"1 1 160px", fontSize:13 }} />
        <select value={stage} onChange={e => setStage(e.target.value)} style={{ ...S.input, fontSize:13, flex:"0 1 140px" }}>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={add} style={{ ...S.primaryBtn, padding:"8px 16px", fontSize:13 }}>追加</button>
      </div>
      {list.length === 0 && <Empty text="まだ登録がありません。応募中の企業を追加してみましょう。" />}
      {active.length > 0 && <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, margin:"4px 0 8px" }}>進行中（{active.length}）</div>}
      {active.map(e => <TrackerRow key={e.id} e={e} onStage={onStage} onRemove={onRemove} />)}
      {done.length > 0 && <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, margin:"18px 0 8px" }}>完了（{done.length}）</div>}
      {done.map(e => <TrackerRow key={e.id} e={e} onStage={onStage} onRemove={onRemove} />)}
    </div>
  );
}

function DiarySection({ entries, onSave }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title:"", content:"", mood:"😊", date:today() });
  const moods = ["😊","😐","😔","💪","🤔"];
  const save = () => {
    if (!f.title.trim() || !f.content.trim()) return;
    onSave([{ ...f, id: Math.random().toString(36).slice(2,10) }, ...entries]);
    setAdding(false);
    setF({ title:"", content:"", mood:"😊", date:today() });
  };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, paddingBottom:10, borderBottom:"1px solid " + C.border }}>
        <span style={{ fontSize:12, color:C.sub }}>{entries.length}件の日記</span>
        <button style={S.primaryBtn} onClick={() => setAdding(a => !a)}>{adding ? "キャンセル" : "＋ 日記を書く"}</button>
      </div>
      {adding && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:14 }}>
          <Fld label="日付"><input style={S.input} type="date" value={f.date} onChange={e => setF({ ...f, date:e.target.value })} /></Fld>
          <Fld label="気分">
            <div style={{ display:"flex", gap:8 }}>
              {moods.map(m => (
                <button key={m} style={{ fontSize:22, background:"none", border:"2px solid " + (f.mood === m ? C.accent : "#ddd"), borderRadius:5, padding:"3px 7px", cursor:"pointer" }} onClick={() => setF({ ...f, mood:m })}>{m}</button>
              ))}
            </div>
          </Fld>
          <Fld label="タイトル"><input style={S.input} placeholder="今日の就活メモ" value={f.title} onChange={e => setF({ ...f, title:e.target.value })} /></Fld>
          <Fld label="内容"><textarea style={{ ...S.input, resize:"vertical" }} rows={5} value={f.content} onChange={e => setF({ ...f, content:e.target.value })} /></Fld>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"10px" }} onClick={save}>保存する</button>
        </div>
      )}
      {entries.length === 0 && !adding && <Empty text="まだ日記がありません。転職活動の記録を残しましょう。" />}
      {entries.map(e => (
        <div key={e.id} style={{ ...S.cardItem, cursor:"default" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:20 }}>{e.mood}</span>
            <span style={{ fontWeight:"bold", fontSize:14, fontFamily:"'Zen Kaku Gothic New', sans-serif", flex:1 }}>{e.title}</span>
            <span style={{ fontSize:11, color:C.sub }}>{e.date}</span>
            <button style={{ background:"none", border:"1px solid #FAA", padding:"3px 8px", fontSize:11, cursor:"pointer", fontFamily:"inherit", color:"#C00", marginLeft:4 }} onClick={() => onSave(entries.filter(x => x.id !== e.id))}>削除</button>
          </div>
          <p style={{ fontSize:13, lineHeight:1.85, borderTop:"1px solid " + C.border, paddingTop:8 }}>{e.content}</p>
        </div>
      ))}
    </div>
  );
}

// ─── 管理パネル ───────────────────────────────────────────────────────────────
function AdminPage({ companies, posts, reviews, salaries, jobListings, adminDelete, setEditTgt, isMobile }) {
  const [tab, setTab] = useState("posts");
  const allCmts = posts.flatMap(p => (p.comments || []).map(c => ({ ...c, postId:p.id, postTitle:p.title })));
  const tabs = [
    ["posts",     "投稿(" + posts.length + ")"],
    ["reviews",   "口コミ(" + reviews.length + ")"],
    ["salaries",  "年収(" + salaries.length + ")"],
    ["jobs",      "募集要項(" + jobListings.length + ")"],
    ["companies", "企業(" + companies.length + ")"],
    ["comments",  "コメント(" + allCmts.length + ")"],
  ];
  const rowsByTab = {
    posts:     posts.map(p =>      ({ id:p.id,         primary:p.title,                secondary:(companies.find(c => c.id === p.companyId) || {}).name + " · " + p.author + " · " + ago(p.createdAt),           onEdit:() => setEditTgt({ type:"post",    data:p }),  onDel:() => adminDelete("post",    p.id) })),
    reviews:   reviews.map(r =>    ({ id:r.id,         primary:"★" + r.overall.toFixed(1) + " " + ((companies.find(c => c.id === r.companyId) || {}).name || ""), secondary:r.author + " · " + ago(r.createdAt), onEdit:() => setEditTgt({ type:"review",  data:r }),  onDel:() => adminDelete("review",  r.id) })),
    salaries:  salaries.map(s =>   ({ id:s.id,         primary:((companies.find(c => c.id === s.companyId) || {}).name || "") + " " + s.annualSalary + "万円 " + s.jobType, secondary:s.author + " · " + ago(s.createdAt),                                             onEdit:() => setEditTgt({ type:"salary",  data:s }),  onDel:() => adminDelete("salary",  s.id) })),
    jobs:      jobListings.map(j=> ({ id:j.id,         primary:j.title,                secondary:((companies.find(c => c.id === j.companyId) || {}).name || "") + " · " + (j.postedDate || "") + " · " + j.author, onEdit:() => setEditTgt({ type:"job",     data:j }),  onDel:() => adminDelete("job",     j.id) })),
    companies: companies.map(c =>  ({ id:c.id,         primary:c.emoji + " " + c.name, secondary:c.industry + " · " + (c.author || ""),                                                                            onEdit:() => setEditTgt({ type:"company", data:c }),  onDel:() => adminDelete("company", c.id) })),
    comments:  allCmts.map(cm =>   ({ id:cm.postId+":"+cm.id, primary:cm.content,      secondary:cm.author + " → 「" + cm.postTitle + "」",                                                                        onDel:() => adminDelete("comment", cm.postId + ":" + cm.id) })),
  };
  const rows = rowsByTab[tab] || [];

  return (
    <div>
      <PageHeader title="管理パネル" desc="全コンテンツの管理" />
      {isMobile
        ? <select style={{ ...S.input, marginBottom:16 }} value={tab} onChange={e => setTab(e.target.value)}>{tabs.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select>
        : <div style={{ display:"flex", borderBottom:"2px solid " + C.ink, marginBottom:16, flexWrap:"wrap" }}>{tabs.map(([k,l]) => <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? C.accent : C.sub, borderBottom:"3px solid " + (tab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500", whiteSpace:"nowrap" }} onClick={() => setTab(k)}>{l}</button>)}</div>
      }
      {rows.length === 0
        ? <Empty text="データがありません" />
        : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={S.tableRow}>
                  <td style={{ ...S.td, width:"100%" }}>
                    <div style={{ fontSize:13, fontWeight:"bold", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:460 }}>{r.primary}</div>
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{r.secondary}</div>
                  </td>
                  <td style={{ ...S.td, whiteSpace:"nowrap" }}>
                    {r.onEdit && <SmBtn onClick={r.onEdit}>編集</SmBtn>}
                    <SmBtn red onClick={r.onDel}>削除</SmBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </div>
  );
}

// ─── アクセス解析 ─────────────────────────────────────────────────────────────
function AnalyticsPage({ companies, posts, reviews, salaries, isMobile }) {
  const grouped   = Object.fromEntries(ALL_GROUPS.map(g => [g, companies.filter(c => (c.group || getGroup(c.industry)) === g).length]));
  const topActive = [...companies].map(co => ({ ...co, score: posts.filter(p => p.companyId === co.id).length + reviews.filter(r => r.companyId === co.id).length })).sort((a,b) => b.score - a.score).slice(0, 8);
  const weekAgo   = Date.now() - 7 * 86400000;
  const weekPosts = posts.filter(p => (p.createdAt?.toDate?.()?.getTime() || 0) > weekAgo).length;

  return (
    <div>
      <PageHeader title="アクセス解析" desc="コンテンツ統計" />
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap:0, border:"1px solid " + C.border, marginBottom:20 }}>
        {[["投稿数",posts.length],["口コミ数",reviews.length],["年収情報",salaries.length],["掲載企業",companies.length],["今週の投稿",weekPosts]].map(([l,v],i) => (
          <div key={l} style={{ padding:"12px 14px", background:C.surface, textAlign:"center", ...(i > 0 ? { borderLeft:"1px solid " + C.border } : {}) }}>
            <div style={{ fontSize:11, color:C.sub, marginBottom:5 }}>{l}</div>
            <div style={{ fontSize:22, fontWeight:"bold", color:C.accent, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14 }}>
        <div style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px" }}>
          <h3 style={{ fontSize:13, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"1px solid " + C.border }}>業界別企業数</h3>
          {Object.entries(grouped).filter(([,v]) => v > 0).map(([g,v]) => (
            <div key={g} style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 0", borderBottom:"1px solid " + C.border }}>
              <span style={{ flex:1, fontSize:12 }}>{g}</span>
              <div style={{ width:80, height:5, background:"#eee" }}>
                <div style={{ width: (companies.length ? (v / companies.length) * 100 : 0) + "%", height:"100%", background:C.accent }} />
              </div>
              <span style={{ fontSize:12, fontWeight:"bold", minWidth:28, textAlign:"right" }}>{v}社</span>
            </div>
          ))}
        </div>
        <div style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px" }}>
          <h3 style={{ fontSize:13, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"1px solid " + C.border }}>投稿数ランキング</h3>
          {topActive.map((co, i) => (
            <div key={co.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid " + C.border }}>
              <span style={{ fontSize:12, fontWeight:"bold", color: i < 3 ? C.accent : "#bbb", width:20 }}>{i + 1}</span>
              <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, fontSize:13 }}><CompanyLogo company={co} size={20} /><span>{co.name}</span></div>
              <span style={{ fontSize:13, fontWeight:"bold", color:C.accent }}>{co.score}件</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 共通 UI ─────────────────────────────────────────────────────────────────
function Stars({ r, size = 13 }) {
  return (
    <span style={{ display:"inline-flex", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize:size, color: i <= Math.round(r) ? C.accent : "#DDD" }}>★</span>
      ))}
    </span>
  );
}
function StarPicker({ value, onChange, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, paddingBottom:8, borderBottom:"1px solid " + C.border }}>
      <span style={{ fontSize:12, color:C.sub, width:134, flexShrink:0 }}>{label}</span>
      {[1,2,3,4,5].map(n => (
        <button key={n} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color: n <= value ? C.accent : "#DDD", padding:0 }} onClick={() => onChange(n)}>★</button>
      ))}
      <span style={{ fontSize:12, color:C.sub, marginLeft:4 }}>{value}.0</span>
    </div>
  );
}
function StageBadge({ s }) {
  const c = STAGE_COLORS[s] || { bg:"#F9FAFB", tx:"#525252", br:"#CCC" };
  return (
    <span style={{ fontSize:11, fontWeight:"bold", padding:"2px 9px", border:"1px solid " + c.br, background:c.bg, color:c.tx }}>{s}</span>
  );
}
function PostCard({ post, co, go, isAdmin, onDelete, onEdit }) {
  return (
    <article style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", co)}>
      {isAdmin && (
        <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:6 }} onClick={e => e.stopPropagation()}>
          <SmBtn onClick={() => onEdit(post)}>編集</SmBtn>
          <SmBtn red onClick={() => onDelete("post", post.id)}>削除</SmBtn>
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:C.sub, display:"flex", alignItems:"center", gap:4 }}>{co && <CompanyLogo company={co} size={16} />}<span>{co && co.name}</span></span>
        <StageBadge s={post.stage} />
        <span style={{ fontSize:10, color:C.sub, marginLeft:"auto" }}>{ago(post.createdAt)}</span>
      </div>
      <h3 style={{ fontSize:14, fontWeight:"bold", marginBottom:6, lineHeight:1.5, fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{post.title}</h3>
      <p style={{ fontSize:12, color:C.sub, lineHeight:1.8, marginBottom:8 }}>{post.content && post.content.slice(0, 90)}{post.content && post.content.length > 90 ? "..." : ""}</p>
      <div style={{ display:"flex", alignItems:"center", gap:8, borderTop:"1px solid " + C.border, paddingTop:8 }}>
        <AC>{ini(post.author)}</AC>
        <span style={{ fontSize:11, color:C.sub }}>{post.author}</span>
        <span style={{ marginLeft:"auto", fontSize:11, color:C.sub }}>♡ {(post.likes || []).length}</span>
      </div>
    </article>
  );
}
function STitle({ label }) {
  return (
    <div style={{ borderTop:"3px solid " + C.ink, paddingTop:10, marginBottom:14 }}>
      {label && <h2 style={{ fontSize:14, fontWeight:"bold", letterSpacing:"0.04em" }}>{label}</h2>}
    </div>
  );
}
function PageHeader({ title, desc }) {
  return (
    <div style={{ borderTop:"3px solid " + C.ink, paddingTop:14, marginBottom:20 }}>
      <h1 style={{ fontSize:"clamp(18px,3vw,26px)", fontWeight:"bold", fontFamily:"'Zen Kaku Gothic New', sans-serif" }}>{title}</h1>
      {desc && <p style={{ color:C.sub, marginTop:6, fontSize:12 }}>{desc}</p>}
    </div>
  );
}
function Fld({ label, children }) {
  return (
    <div style={{ marginBottom:13 }}>
      <label style={{ display:"block", fontSize:10, fontWeight:"bold", color:C.sub, letterSpacing:"0.08em", marginBottom:4 }}>{label}</label>
      {children}
    </div>
  );
}
function Empty({ text }) {
  return (
    <div style={{ textAlign:"center", color:C.sub, padding:"28px 0", fontSize:13, borderTop:"1px solid " + C.border, borderBottom:"1px solid " + C.border }}>{text}</div>
  );
}
function AccessDenied({ go }) {
  return (
    <div style={{ textAlign:"center", padding:"72px 20px" }}>
      <div style={{ fontSize:44, marginBottom:14 }}>🔒</div>
      <h2 style={{ fontSize:18, fontWeight:"bold", fontFamily:"'Zen Kaku Gothic New', sans-serif", marginBottom:10 }}>アクセス権限がありません</h2>
      <p style={{ fontSize:13, color:C.sub, marginBottom:20, lineHeight:1.8 }}>このページは管理者のみが閲覧できます。</p>
      <button style={S.primaryBtn} onClick={() => go("home")}>トップに戻る</button>
    </div>
  );
}
function BoardLockedNotice({ setAuthMode, count, type, sess }) {
  return (
    <div style={{
      background:"#fff",
      border:"2px solid " + C.accent,
      borderRadius:12,
      padding:"24px 28px",
      marginBottom:16,
      boxShadow:"0 4px 16px rgba(43,123,209,0.12)"
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14, flexWrap:"wrap" }}>
        <div style={{ fontSize:32 }}>🔓</div>
        <div style={{ flex:1, minWidth:200 }}>
          {!sess ? (
            <>
              <h3 style={{ fontSize:15, fontWeight:"bold", color:C.ink, marginBottom:4 }}>
                {type}を見るには無料会員登録が必要です
              </h3>
              <p style={{ fontSize:12, color:C.sub, lineHeight:1.7 }}>
                登録済みの<strong style={{ color:C.accent }}>{count}件</strong>の投稿が閲覧できます。
              </p>
            </>
          ) : (
            <>
              <h3 style={{ fontSize:15, fontWeight:"bold", color:C.ink, marginBottom:4 }}>
                投稿すると30日間 見放題！
              </h3>
              <p style={{ fontSize:12, color:C.sub, lineHeight:1.7 }}>
                体験談・口コミなどを<strong style={{ color:C.accent }}>1件投稿</strong>するだけで、登録済みの{count}件すべてが閲覧可能になります。
              </p>
            </>
          )}
        </div>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
        {["✓ 選考フロー","✓ 内定情報","✓ 面接の質問","✓ 通過率"].map(t => (
          <span key={t} style={{ background:C.light, color:C.accent, padding:"4px 10px", fontSize:11, borderRadius:14, fontWeight:"bold" }}>{t}</span>
        ))}
      </div>
      {!sess ? (
        <>
          <button style={{
            background:C.accent, color:"#fff", border:"none",
            padding:"12px 28px", fontSize:14, fontWeight:"bold",
            fontFamily:"inherit", cursor:"pointer", borderRadius:30,
            width:"100%",
            boxShadow:"0 2px 8px rgba(43,123,209,0.3)"
          }} onClick={() => setAuthMode("register")}>
            閲覧する（無料会員登録）→
          </button>
          <div style={{ fontSize:11, color:C.sub, marginTop:8, textAlign:"center" }}>
            すでに会員の方は <button style={{...S.textLink, fontSize:11}} onClick={() => setAuthMode("login")}>ログイン</button>
          </div>
        </>
      ) : (
        <div style={{ background:"#FFF8E7", border:"1px solid #FCD34D", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#92400E", textAlign:"center" }}>
          🎁 体験談を1件投稿で<strong>30日間 全コンテンツ閲覧可能</strong>
        </div>
      )}
    </div>
  );
}

function PopularPosters({ posts, reviews }) {
  // 投稿者ごとのもらったいいね数を集計
  const likeCounts = {};
  const names = {};
  [...posts, ...reviews].forEach(item => {
    const uid = item.authorUid;
    if (!uid) return;
    const lk = (item.likes || []).length;
    likeCounts[uid] = (likeCounts[uid] || 0) + lk;
    if (item.author) names[uid] = item.author;
  });
  const ranked = Object.entries(likeCounts)
    .filter(([_, c]) => c > 0)
    .map(([uid, c]) => ({ uid, count:c, name:names[uid] || "ユーザー" }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 5);

  if (ranked.length === 0) return null;
  return (
    <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px", marginTop:16 }}>
      <h3 style={{ fontSize:14, fontWeight:"bold", marginBottom:12, color:C.ink, paddingBottom:8, borderBottom:"2px solid #DC2626" }}>
        ❤️ 人気投稿者ランキング
      </h3>
      {ranked.map((u, i) => (
        <div key={u.uid} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom: i < ranked.length - 1 ? "1px solid " + C.border : "none" }}>
          <span style={{ fontSize:13, fontWeight:"bold", width:18, color: i < 3 ? "#DC2626" : C.sub }}>{i + 1}.</span>
          <span style={{ flex:1, fontSize:12, color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</span>
          <span style={{ fontSize:11, fontWeight:"bold", color:"#DC2626" }}>❤️ {u.count}</span>
        </div>
      ))}
      <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid " + C.border, fontSize:10, color:C.sub, lineHeight:1.6 }}>
        投稿の累計いいね数で集計
      </div>
    </div>
  );
}

function TopContributors({ posts, reviews, salaries }) {
  // 月初からの集計
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthMs = monthStart.getTime();

  const counts = {};
  const names = {};
  [...posts, ...reviews, ...salaries].forEach(item => {
    const ts = item.createdAt?.toDate?.()?.getTime() || 0;
    if (ts < monthMs || !item.authorUid) return;
    counts[item.authorUid] = (counts[item.authorUid] || 0) + 1;
    if (item.author) names[item.authorUid] = item.author;
  });
  const ranked = Object.entries(counts)
    .map(([uid, c]) => ({ uid, count:c, name:names[uid] || "ユーザー" }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px" }}>
      <h3 style={{ fontSize:14, fontWeight:"bold", marginBottom:12, color:C.ink, paddingBottom:8, borderBottom:"2px solid #F59E0B" }}>
        🏆 今月の貢献者ランキング
      </h3>
      {ranked.length === 0
        ? <p style={{ fontSize:11, color:C.sub, padding:"8px 0" }}>今月の投稿者はまだいません</p>
        : ranked.map((u, i) => {
            const badge = getBadge(u.count);
            return (
              <div key={u.uid} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom: i < ranked.length - 1 ? "1px solid " + C.border : "none" }}>
                <span style={{ fontSize:13, fontWeight:"bold", width:18, color: i < 3 ? C.accent : C.sub }}>{i + 1}.</span>
                <span style={{ flex:1, fontSize:12, color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</span>
                {badge && <BadgeChip badge={badge} small />}
                <span style={{ fontSize:11, fontWeight:"bold", color:C.accent }}>{u.count}件</span>
              </div>
            );
          })
      }
      <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid " + C.border, fontSize:10, color:C.sub, lineHeight:1.6 }}>
        投稿数に応じてバッジ獲得：<br />
        🥉ブロンズ(1+) 🥈シルバー(5+) 🥇ゴールド(20+) 💎プラチナ(50+)
      </div>
    </div>
  );
}

function AISummary({ posts, reviews, type }) {
  const items = type === "interview" ? posts.filter(p => p.ptype === "interview") : reviews;
  if (items.length < 3) return null;

  // 主要ポイント抽出（簡易版）
  let summaryPoints = [];
  if (type === "interview") {
    // 段階数の中央値
    const stageCounts = items.map(i => (i.stages || []).length).filter(n => n > 0).sort((a,b) => a - b);
    const medianStages = stageCounts[Math.floor(stageCounts.length / 2)] || 0;
    // 最終結果の分布
    const results = items.filter(i => i.finalResult);
    const offerRate = results.filter(i => i.finalResult === "内定" || i.finalResult === "内定辞退").length;
    // 応募方法の上位
    const methods = {};
    items.forEach(i => { if (i.applyMethod) methods[i.applyMethod] = (methods[i.applyMethod] || 0) + 1; });
    const topMethod = Object.entries(methods).sort((a,b) => b[1] - a[1])[0];
    // オファー金額の中央値
    const offers = items.map(i => Number(i.offerAmount) || 0).filter(n => n > 0).sort((a,b) => a - b);
    const medianOffer = offers[Math.floor(offers.length / 2)];

    if (medianStages) summaryPoints.push(`選考は平均 **${medianStages}段階** で構成されています`);
    if (results.length > 2) summaryPoints.push(`内定到達率は約 **${Math.round(offerRate / results.length * 100)}%**（${results.length}件中${offerRate}件）`);
    if (topMethod) summaryPoints.push(`最も多い応募経路は **${topMethod[0]}**（${topMethod[1]}件）`);
    if (medianOffer) summaryPoints.push(`提示年収の中央値は **${medianOffer}万円**`);
  } else if (type === "review") {
    // 退職検討理由トップ3
    const reasons = {};
    items.forEach(i => { if (i.quitReason && i.quitReason !== "退職検討なし") reasons[i.quitReason] = (reasons[i.quitReason] || 0) + 1; });
    const topReasons = Object.entries(reasons).sort((a,b) => b[1] - a[1]).slice(0, 3);
    // 平均残業
    const overtimes = items.map(i => i.overtimeBucket).filter(Boolean);
    const otCounts = {};
    overtimes.forEach(o => { otCounts[o] = (otCounts[o] || 0) + 1; });
    const topOT = Object.entries(otCounts).sort((a,b) => b[1] - a[1])[0];
    // 上位ポイント
    const allRats = items.flatMap(i => Object.entries(i.rats || {})).filter(([k,v]) => v >= 4);
    const ratCounts = {};
    allRats.forEach(([k]) => { ratCounts[k] = (ratCounts[k] || 0) + 1; });
    const topRat = Object.entries(ratCounts).sort((a,b) => b[1] - a[1])[0];
    const ratLabels = { motivation:"働きがい", morale:"社員のやる気", relations:"同僚・上司との関係", white:"ホワイト度", growth:"成長環境", wlb:"ワークライフバランス", salary:"待遇・給与", mgmt:"経営の安定性" };

    if (topRat) summaryPoints.push(`高評価が多い項目は **${ratLabels[topRat[0]]}**（${topRat[1]}件で4以上の評価）`);
    if (topOT) summaryPoints.push(`月間残業時間で最も多いゾーンは **${topOT[0]}**`);
    if (topReasons.length > 0) summaryPoints.push(`退職検討理由のトップは **${topReasons.map(([r,c]) => `${r}（${c}件）`).join("、")}**`);
  }

  if (summaryPoints.length === 0) return null;

  return (
    <div style={{
      background:"linear-gradient(135deg, #EFF6FF 0%, #FEF3C7 100%)",
      border:"1px solid #BFDBFE",
      borderRadius:8,
      padding:"14px 16px",
      marginBottom:14,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <span style={{ fontSize:20 }}>🤖</span>
        <span style={{ fontSize:13, fontWeight:"bold", color:"#1E40AF" }}>AIによる投稿の傾向まとめ</span>
        <span style={{ fontSize:10, background:"#1E40AF", color:"#fff", padding:"1px 6px", borderRadius:8, marginLeft:"auto" }}>{items.length}件分析</span>
      </div>
      <ul style={{ listStyle:"none", padding:0, margin:0 }}>
        {summaryPoints.map((p, i) => (
          <li key={i} style={{ fontSize:12, color:C.ink, padding:"4px 0", lineHeight:1.7, display:"flex", gap:6 }}>
            <span style={{ color:"#1E40AF" }}>▸</span>
            <span dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#1E40AF">$1</strong>') }} />
          </li>
        ))}
      </ul>
      <p style={{ fontSize:10, color:C.sub, marginTop:8, fontStyle:"italic" }}>
        ※ 投稿の自動集計に基づく傾向です。最新3件のみ表示しています。
      </p>
    </div>
  );
}

function CommentThread({ post, uName, authUserKey, authUser, isAdmin, onAddComment, adminDelete, getAuthorBadge, bestAnswerId, onSetBestAnswer, canMarkBest, onSetGuestName, group }) {
  const [cmt, setCmt] = React.useState("");
  const [replyTo, setReplyTo] = React.useState(null); // 返信先のコメントID
  const [replyText, setReplyText] = React.useState("");

  const comments = post.comments || [];
  // 親 = parentId なし、子 = parentId あり
  const topsRaw = comments.filter(c => !c.parentId);
  const tops = bestAnswerId ? [...topsRaw.filter(c => c.id === bestAnswerId), ...topsRaw.filter(c => c.id !== bestAnswerId)] : topsRaw;
  const childrenOf = (id) => comments.filter(c => c.parentId === id);

  const handleSubmit = async (parentId) => {
    const text = parentId ? replyText : cmt;
    if (!text.trim()) return;
    await onAddComment(post.id, text.trim(), parentId);
    if (parentId) { setReplyText(""); setReplyTo(null); }
    else setCmt("");
  };

  const renderComment = (c, depth = 0) => {
    const kids = childrenOf(c.id);
    const indent = Math.min(depth, 2) * 18; // 最大2レベル下までインデント
    const liked = (c.likes || []).includes(authUserKey);
    const isBest = c.id && c.id === bestAnswerId;
    return (
      <div key={c.id} style={{ marginLeft:indent, marginBottom:8 }}>
        <div style={{ background: isBest ? "#F0FAF4" : (depth === 0 ? "#FAFCFE" : "#fff"), border: isBest ? "2px solid " + C.success : "1px solid " + C.border, borderRadius:8, padding:"10px 12px" }}>
          {isBest && <div style={{ display:"inline-flex", alignItems:"center", gap:5, background:C.success, color:"#fff", fontSize:11, fontWeight:"bold", padding:"2px 9px", borderRadius:5, marginBottom:8 }}>✅ ベストアンサー</div>}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, flexWrap:"wrap" }}>
            <AC>{ini(c.author)}</AC>
            <span style={{ fontSize:12, fontWeight:"bold", color:C.ink }}>{c.author}</span>
            <PosterId id={c.posterId} seed={c.authorUid || ("anon:" + (c.author || "?") + ":" + (c.id || ""))} />
            {getAuthorBadge && getAuthorBadge(c.authorUid) && <BadgeChip badge={getAuthorBadge(c.authorUid)} small />}
            <span style={{ fontSize:10, color:C.sub }}>{c.date}</span>
            {isAdmin && <SmBtn red onClick={() => adminDelete("comment", post.id + ":" + c.id)}>削除</SmBtn>}
          </div>
          <p style={{ fontSize:13, lineHeight:1.8, color:C.ink, marginBottom:6 }}>{c.content}</p>
          <div style={{ display:"flex", gap:6 }}>
            <button style={{ background:"none", border:"1px solid " + C.border, color: liked ? "#DC2626" : C.sub, fontSize:11, cursor:"pointer", fontFamily:"inherit", padding:"3px 10px", borderRadius:14 }} onClick={async () => {
              // コメントいいね機能（簡易版）
              const newComments = (post.comments || []).map(cc => {
                if (cc.id !== c.id) return cc;
                const cl = cc.likes || [];
                return { ...cc, likes: cl.includes(authUserKey) ? cl.filter(u => u !== authUserKey) : [...cl, authUserKey] };
              });
              await onAddComment(post.id, "__updateComments__", null, newComments);
            }}>
              {liked ? "❤️" : "🤍"} {(c.likes || []).length || ""}
            </button>
            <button style={{ background:"none", border:"1px solid " + C.border, color:C.sub, fontSize:11, cursor:"pointer", fontFamily:"inherit", padding:"3px 10px", borderRadius:14 }} onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
              💬 返信
            </button>
            {canMarkBest && depth === 0 && (
              <button style={{ background: isBest ? C.success : "none", border:"1px solid " + C.success, color: isBest ? "#fff" : C.success, fontSize:11, cursor:"pointer", fontFamily:"inherit", padding:"3px 10px", borderRadius:14, fontWeight:"bold" }} onClick={() => onSetBestAnswer && onSetBestAnswer(c.id)}>
                {isBest ? "★ 解除" : "★ ベストアンサーにする"}
              </button>
            )}
          </div>
        </div>
        {replyTo === c.id && (
          <div style={{ marginLeft:24, marginTop:6, display:"flex", gap:6, alignItems:"flex-start" }}>
            <AC>{ini(uName)}</AC>
            <div style={{ flex:1 }}>
              <textarea style={{ ...S.input, resize:"vertical", width:"100%" }} rows={2} placeholder={`${c.author}さんへの返信`} value={replyText} onChange={e => setReplyText(e.target.value)} />
              <div style={{ display:"flex", gap:6, marginTop:4 }}>
                <button style={{ ...S.primaryBtn, fontSize:11, padding:"5px 12px" }} onClick={() => handleSubmit(c.id)}>
                  返信する
                </button>
                <button style={{ background:"none", border:"1px solid " + C.border, color:C.sub, fontSize:11, padding:"5px 12px", cursor:"pointer", fontFamily:"inherit", borderRadius:4 }} onClick={() => { setReplyTo(null); setReplyText(""); }}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 子コメント（再帰） */}
        {kids.length > 0 && (
          <div style={{ marginTop:6 }}>
            {kids.map(k => renderComment(k, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid " + C.border }}>
      {tops.length === 0 && <p style={{ fontSize:11, color:C.sub, textAlign:"center", padding:"8px 0" }}>まだコメントがありません。最初のコメントを残しましょう。</p>}
      {tops.map(c => renderComment(c, 0))}
      <div style={{ display:"flex", gap:8, marginTop:12, alignItems:"flex-start", paddingTop:10, borderTop:"1px solid " + C.border }}>
        <AC>{ini(uName)}</AC>
        <div style={{ flex:1 }}>
          {onSetGuestName && !authUser && (
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, color:C.sub, whiteSpace:"nowrap" }}>表示名</span>
              <input value={uName} onChange={e => onSetGuestName(e.target.value)} placeholder="名前（自由に変更できます）" style={{ ...S.input, fontSize:12, padding:"5px 9px", maxWidth:200 }} />
              <button type="button" onClick={() => onSetGuestName(genGuestName(group))} title="別の名前を生成" style={{ background:"none", border:"1px solid " + C.border, color:C.accentDark, fontSize:11, borderRadius:8, padding:"4px 8px", cursor:"pointer", fontFamily:"inherit" }}>🎲</button>
              <span style={{ fontSize:10, color:C.sub }}>ログイン不要・自動で名前が入ります</span>
            </div>
          )}
          <textarea style={{ ...S.input, resize:"vertical", width:"100%" }} rows={2} placeholder="コメントを入力" value={cmt} onChange={e => setCmt(e.target.value)} />
          <button style={{ ...S.primaryBtn, marginTop:6, fontSize:12, padding:"7px 14px" }} onClick={() => handleSubmit(null)}>
            コメントする
          </button>
        </div>
      </div>
    </div>
  );
}

function LikeButton({ liked, count, onClick }) {
  const [animate, setAnimate] = React.useState(false);
  const handle = () => {
    onClick();
    if (!liked) { setAnimate(true); setTimeout(() => setAnimate(false), 400); }
  };
  return (
    <button
      onClick={handle}
      style={{
        background: liked ? "#FEE2E2" : "#fff",
        border: "1px solid " + (liked ? "#FCA5A5" : "#E1E9F2"),
        color: liked ? "#DC2626" : "#6B7B91",
        fontSize: 12, fontWeight: liked ? "bold" : "normal",
        fontFamily: "inherit", cursor: "pointer",
        padding: "6px 14px", borderRadius: 18,
        display: "flex", alignItems: "center", gap: 4,
        transform: animate ? "scale(1.15)" : "scale(1)",
        transition: "transform .2s, background .2s, color .2s",
      }}>
      <span style={{ fontSize: 14 }}>{liked ? "❤️" : "🤍"}</span>
      <span>{count > 0 ? count : "いいね"}</span>
    </button>
  );
}

function BadgeChip({ badge, small }) {
  if (!badge) return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      background: badge.bg, color: badge.color,
      padding: small ? "1px 6px" : "2px 8px",
      fontSize: small ? 9 : 10, fontWeight:"bold",
      borderRadius: 10, border:"1px solid " + badge.color + "33",
      marginLeft:4, whiteSpace:"nowrap",
    }}>
      <span>{badge.emoji}</span>{badge.name}
    </span>
  );
}

function LockedContent({ setAuthMode, count, type, sess }) {
  return (
    <div style={{
      position:"relative",
      background:"linear-gradient(180deg, rgba(255,255,255,0.4) 0%, #fff 30%)",
      marginTop:-100,
      paddingTop:80,
      paddingBottom:24,
      paddingLeft:20,
      paddingRight:20,
      textAlign:"center",
      zIndex:10,
    }}>
      <div style={{
        background:"#fff",
        border:"2px solid " + C.accent,
        borderRadius:12,
        padding:"24px 24px",
        maxWidth:520,
        margin:"0 auto",
        boxShadow:"0 8px 28px rgba(43,123,209,0.18)"
      }}>
        <div style={{ fontSize:32, marginBottom:8 }}>🔓</div>
        {!sess ? (
          <>
            <h3 style={{ fontSize:16, fontWeight:"bold", marginBottom:8, color:C.ink }}>
              続きを読むには無料会員登録
            </h3>
            <p style={{ fontSize:13, color:C.sub, marginBottom:18, lineHeight:1.7 }}>
              残り <strong style={{ color:C.accent, fontSize:15 }}>{count}件</strong> の{type}が閲覧できます。<br />
              メールアドレスだけで30秒で完了します。
            </p>
            <button style={{
              background:C.accent, color:"#fff", border:"none",
              padding:"12px 36px", fontSize:14, fontWeight:"bold",
              fontFamily:"inherit", cursor:"pointer", borderRadius:30,
              boxShadow:"0 2px 8px rgba(43,123,209,0.3)"
            }} onClick={() => setAuthMode("register")}>
              閲覧する（無料会員登録）→
            </button>
            <div style={{ fontSize:11, color:C.sub, marginTop:10 }}>
              すでに会員の方は <button style={{...S.textLink, fontSize:11}} onClick={() => setAuthMode("login")}>ログイン</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ fontSize:16, fontWeight:"bold", marginBottom:8, color:C.ink }}>
              投稿すると30日間 全コンテンツが見放題！
            </h3>
            <p style={{ fontSize:13, color:C.sub, marginBottom:18, lineHeight:1.7 }}>
              残り <strong style={{ color:C.accent, fontSize:15 }}>{count}件</strong> の{type}が閲覧できます。<br />
              <strong>体験談・口コミ・年収情報を1件投稿</strong>するだけで、<br />
              30日間すべてのコンテンツが閲覧可能になります。
            </p>
            <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap", marginTop:8 }}>
              {[["📝 面接体験談を投稿","interview"],["⭐ 口コミを投稿","review"],["💰 年収情報を投稿","salary"]].map(([l,k]) => (
                <span key={k} style={{ background:C.light, color:C.accent, padding:"6px 14px", fontSize:12, borderRadius:18, fontWeight:"bold" }}>
                  {l}
                </span>
              ))}
            </div>
            <p style={{ fontSize:11, color:C.sub, marginTop:14 }}>
              気になる企業のページから投稿できます
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SmBtn({ onClick, red, children }) {
  return (
    <button style={{ background:"none", border:"1px solid " + (red ? "#FAA" : C.border), padding:"3px 8px", fontSize:11, cursor:"pointer", fontFamily:"inherit", color: red ? "#C00" : C.sub, marginLeft:4 }} onClick={onClick}>{children}</button>
  );
}
function PosterId({ id, seed }) {
  const v = id || (seed != null ? makePosterId(seed) : null);
  if (!v) return null;
  return <span title="荒らし対策の投稿者ID（同じ人は同じIDになります）" style={{ fontSize:10, color:"#C0C0C0", fontFamily:"monospace", letterSpacing:"0.02em", whiteSpace:"nowrap" }}>#{v}</span>;
}
function AC({ children }) {
  return (
    <span style={{ background:C.accent, color:"#fff", width:22, height:22, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:"bold", flexShrink:0 }}>{children}</span>
  );
}

// ─── スタイル ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Zen+Maru+Gothic:wght@700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-feature-settings: "palt" 1; }
  button { cursor: pointer; transition: all .15s; font-family: inherit; }
  button:hover { opacity: .9; }
  textarea, input, select { font-family: inherit; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .fadeUp { animation: fadeUp .18s ease; }
  tr:hover td { background: #FBF9F4; }
  a { color: inherit; }
  .tabnum { font-variant-numeric: tabular-nums; letter-spacing: .01em; }
  @media (prefers-reduced-motion: reduce){ * { animation: none !important; } }
`;

const S = {
  root:        { fontFamily:"'Zen Kaku Gothic New', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'BIZ UDPGothic', 'Yu Gothic', 'Noto Sans JP', sans-serif", background:C.bg, minHeight:"100vh", color:C.ink, fontSize:14 },
  pageWrap:    { background:C.bg },
  nav:         { background:"#fff", position:"sticky", top:0, zIndex:200, borderBottom:"1px solid " + C.border, boxShadow:"0 2px 8px rgba(43,123,209,0.06)" },
  logoBtn:     { background:"none", border:"none", textAlign:"left", cursor:"pointer" },
  logoText:    { display:"block", fontWeight:900, color:C.accentDark, fontFamily:"'Zen Maru Gothic', sans-serif", letterSpacing:"0.02em" },
  toast:       { position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:C.ink, color:"#fff", padding:"9px 20px", fontSize:12, zIndex:600, boxShadow:"0 2px 10px rgba(0,0,0,0.25)", whiteSpace:"nowrap" },
  overlay:     { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  modal:       { background:"#fff", padding:"24px 22px", width:"100%", maxWidth:420, maxHeight:"94vh", overflowY:"auto", borderTop:"4px solid " + C.accent },
  modalTitle:  { fontSize:17, fontWeight:"bold", fontFamily:"'Zen Kaku Gothic New', sans-serif", marginBottom:12 },
  modalHr:     { height:1, background:C.border, marginBottom:14 },
  errBox:      { background:"#FFF5F5", border:"1px solid #F5AAAA", color:"#8B0000", padding:"8px 12px", fontSize:12, marginBottom:12 },
  main:        { maxWidth:1160, margin:"0 auto" },
  hero:        { borderBottom:"1px solid " + C.border, paddingBottom:24, marginBottom:24, marginTop:20, display:"flex", gap:24, alignItems:"flex-start" },
  th:          { fontSize:11, fontWeight:"bold", color:C.sub, padding:"8px 10px", borderBottom:"2px solid " + C.accent, textAlign:"left", letterSpacing:"0.04em", whiteSpace:"nowrap", background:"#FAFCFE" },
  tableRow:    { borderBottom:"1px solid " + C.border },
  td:          { padding:"8px 10px", fontSize:13, verticalAlign:"middle" },
  cardItem:    { background:C.surface, padding:"12px 0", borderBottom:"1px solid " + C.border },
  input:       { width:"100%", padding:"8px 12px", border:"1px solid " + C.border, fontSize:13, background:"#fff", color:C.ink, outline:"none", fontFamily:"inherit", borderRadius:5 },
  primaryBtn:  { background:C.accent, color:"#fff", border:"none", padding:"8px 18px", fontSize:13, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer", borderRadius:6, boxShadow:"0 1px 3px rgba(43,123,209,0.2)" },
  secondaryBtn:{ background:"#fff", border:"1px solid " + C.border, color:C.ink, padding:"8px 18px", fontSize:13, fontFamily:"inherit", cursor:"pointer", borderRadius:6 },
  textLink:    { background:"none", border:"none", color:C.accent, fontWeight:"bold", fontFamily:"inherit", fontSize:12, cursor:"pointer", textDecoration:"underline" },
  chip:        { border:"1px solid " + C.border, background:"#F5F8FC", color:C.sub, padding:"5px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", borderRadius:14 },
  chipOn:      { background:C.ink, color:"#fff", borderColor:C.ink },
  footer:      { borderTop:"2px solid " + C.ink, padding:"16px 20px", background:C.surface, marginTop:20 },
};
