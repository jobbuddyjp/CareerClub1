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

// ─── カラーパレット（モダン・洗練仕様にアップデート） ───────────────────────────
const C = {
  bg:"#F8FAFC",          // さらに洗練された淡いスレート系背景
  surface:"#FFFFFF",     // カード背景
  ink:"#0F172A",         // 深みのあるモダンな濃い色（テキスト）
  sub:"#64748B",         // 上品なスレート系サブテキスト
  accent:"#2563EB",      // 鮮やかで信頼感のあるモダンブルー（メイン）
  accent2:"#3B82F6",     // 明るいブルー（ホバー等）
  accentDark:"#1D4ED8",  // 強調用の濃い青
  light:"#EFF6FF",       // 極めて淡いブルー
  warm:"#FFFBEB",        // 品の良いクリーム色
  warmAccent:"#F59E0B",  // CTAボタン用の上質なアンバー
  border:"#E2E8F0",      // 明るくクリーンな境界線
  success:"#16A34A",     // モダンなグリーン
};

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
  { name:"ドラがストアマツモトキヨシ", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:765 },
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
  { name:"ヒラき", group:"小売・流通", industry:"専門小売", emoji:"🛒", sortRank:799 },
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
  const [favorites,   setFavorites]   = useState([]); // お気に入り投稿IDのリスト
  const [dataReady,   setDataReady]   = useState(false);

  // UI
  const [page,     setPage]     = useState("home");
  const [selCo,    setSelCo]    = useState(null);
  const [selTab,   setSelTab]   = useState("board"); // 掲示板デフォルト
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
      if (user) {
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
      } else {
        setProfile(null);
        setDiary([]);
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

  // ── 画面遷移
  const go = (p, co = null, tab = null, fromPopstate = false) => {
    setPage(p);
    if (co  !== null) setSelCo(co);
    if (tab !== null) setSelTab(tab);
    else if (p === "company") setSelTab("board"); // 掲示板メインへ遷移
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
      const co = s.coId ? companies.find(c => c.id === s.coId) : null;
      go(s.p, co, s.tab, true);
    };
    window.addEventListener("popstate", handler);
    // 初期ステートを設定
    if (window.history.state === null) {
      window.history.replaceState({ p:"home" }, "", "");
    }
    return () => window.removeEventListener("popstate", handler);
  }, [companies]);

  // ── 派生値
  const plan    = profile?.plan    || "free";
  const isAdmin = !!profile?.isAdmin;
  const sess    = authUser && profile ? { ...profile, uid: authUser.uid } : null;
  // 登録不要投稿のため、ログインしていなくても名前を使える
  const uName   = profile?.displayName || "匿名ユーザー";

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
    toast2("「" + d.name + "」を追加しました（30日間 全コンテンツ閲覧可能になりました）");
    go("company", { id, ...data }, "board");
  };

  const addPost = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null, likes: [], comments: [] };
    const id   = await fsAdd("posts", data);
    setPosts(prev => [{ id, ...data, createdAt: null }, ...prev]);
    await grantUnlock();
    toast2("投稿ありがとうございます！30日間 全コンテンツが閲覧可能になりました");
    go("company", companies.find(c => c.id === d.companyId), d.ptype);
  };

  const addReview = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に口コミ投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("reviews", data);
    setReviews(prev => [{ id, ...data, createdAt: null }, ...prev]);
    await grantUnlock();
    toast2("口コミありがとうございます！30日間 全コンテンツが閲覧可能になりました");
    go("company", companies.find(c => c.id === d.companyId), "review");
  };

  const addSalary = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に年収情報投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("salaries", data);
    setSalaries(prev => [{ id, ...data, createdAt: null }, ...prev]);
    await grantUnlock();
    toast2("年収情報ありがとうございます！30日間 全コンテンツが閲覧可能になりました");
    go("company", companies.find(c => c.id === d.companyId), "salary");
  };

  const addJobListing = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に募集要項追加できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("joblistings", data);
    setJobListings(prev => [{ id, ...data }, ...prev]);
    await grantUnlock();
    toast2("募集要項ありがとうございます！30日間 全コンテンツが閲覧可能になりました");
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

  const addComment = async (postId, content) => {
    const cmt     = { id: Math.random().toString(36).slice(2,10), author: uName, authorUid: authUser?.uid || null, content, date: today() };
    const post    = posts.find(p => p.id === postId);
    const newCmts = [...(post?.comments || []), cmt];
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

  const unlocked = !!authUser && profile && (profile.viewUnlockUntil || 0) > Date.now();

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

  const sp = { sess, go, goSubTop, companies, posts, reviews, salaries, jobListings, plan, isAdmin, adminDelete, adminEdit, setEditTgt, setAuthMode, isMobile, uName, upgradePlan, authUser, favorites, toggleFavorite, unlocked, profile, getAuthorBadge, authorPostCounts };

  return (
    <ErrorBoundary>
    <div style={S.root}>
      <style>{CSS}</style>
      <AppNav {...sp} menuOpen={menuOpen} setMenuOpen={setMenuOpen} logout={logout} doGlobalSearch={doGlobalSearch} globalSearch={globalSearch} />
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

      <main style={{ ...S.main, padding: isMobile ? "0 12px 60px" : "0 24px 72px" }}>
        {page === "home"       && <HomePage       {...sp} onToggleLike={toggleLike} onAddComment={addComment} onAddPost={addPost} coPosts={coPosts} coRevs={coRevs} coSals={coSals} setAuthMode={setAuthMode} doGlobalSearch={doGlobalSearch} />}
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
            diary={diary} saveDiary={saveDiary}
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
function AppNav({ sess, go, plan, isAdmin, setAuthMode, isMobile, menuOpen, setMenuOpen, logout, doGlobalSearch, globalSearch }) {
  const [drop, setDrop] = useState(false);
  const pl = PLANS[plan];
  return (
    <nav style={S.nav}>
      <div style={{ height:3, background:"linear-gradient(90deg, #2563EB 0%, #3B82F6 50%, #F59E0B 100%)" }} />
      <div style={{ maxWidth:1160, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", padding: isMobile ? "8px 12px" : "10px 24px" }}>
        <button style={S.logoBtn} onClick={() => go("home")}>
          <span style={{ ...S.logoText, fontSize: isMobile ? 17 : 22 }}>CareerClub</span>
          {!isMobile && <span style={{ display:"block", fontSize:9, color:C.sub, letterSpacing:"0.1em", marginTop:1 }}>転職体験談・選考情報の匿名コミュニティ</span>}
        </button>
        {!isMobile && (
          <div style={{ flex:1, maxWidth:480, margin:"0 24px", position:"relative" }}>
            <input
              type="text"
              placeholder="🔍 企業名・キーワードで検索"
              defaultValue={globalSearch}
              onKeyDown={(e) => { if (e.key === "Enter") doGlobalSearch(e.target.value); }}
              style={{
                width:"100%", padding:"9px 14px", paddingLeft:14,
                background:"#F1F5F9", border:"1px solid " + C.border, borderRadius:20,
                fontSize:13, fontFamily:"inherit", outline:"none",
                color:C.ink, transition:"all .2s"
              }}
              onFocus={(e) => { e.target.style.background = "#fff"; e.target.style.borderColor = C.accent; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
              onBlur={(e) => { e.target.style.background = "#F1F5F9"; e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
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
            {[["companies","情報交換掲示板"],["companies","企業一覧"],["ranking","ランキング"],["home","ホーム"]].map(([p,l]) => (
              <span key={p}>
                <button style={{ background:"none", border:"none", color: p === "companies" && l === "情報交換掲示板" ? C.accent : C.ink, fontWeight: p === "companies" && l === "情報交換掲示板" ? "bold" : "normal", fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go(p)}>{l}</button>
                <span style={{ color:C.border, fontSize:11 }}>|</span>
              </span>
            ))}
            <button style={{ background:"none", border:"none", color:C.ink, fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go("addCompany")}>＋企業追加</button>
            <span style={{ color:C.border, fontSize:11 }}>|</span>
            {sess ? (
