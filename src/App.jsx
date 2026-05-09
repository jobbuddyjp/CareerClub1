import React, { useState, useEffect, useRef } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
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
  "航空・交通":   ["航空","鉄道","バス","海運"],
};
const ALL_GROUPS   = Object.keys(INDUSTRY_GROUPS);
const STAGES       = ["書類選考","一次面接","二次面接","三次面接","最終面接","内定","内定辞退","不合格","辞退"];
const BOARD_STAGES = ["書類選考中","書類通過","一次選考","二次選考","三次選考","四次選考","最終選考","内定","内定辞退","不合格","辞退"];
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
  "航空・交通":   ["全職種","パイロット（自社養成）","パイロット（既卒）","キャビンアテンダント","グランドスタッフ","整備士","運航管理","その他"],
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
  bg:"#F7FAFC",          // 明るい背景
  surface:"#FFFFFF",     // カード背景
  ink:"#1A2B4A",         // 深い紺色（テキスト）
  sub:"#5A6B82",         // サブテキスト
  accent:"#1E5A96",      // 上品な青（メインカラー）
  accent2:"#2B7BD1",     // 明るい青（ホバー・アクセント）
  light:"#E3F0FA",       // 淡い青
  border:"#D5DEE8",      // 境界線
  success:"#16A34A",     // 成功色
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
  { name:"三菱UFJ銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"三井住友銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"みずほ銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"りそな銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"埼玉りそな銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"三井住友信託銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"SBI新生銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"あおぞら銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"ゆうちょ銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"農林中央金庫", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"日本政策投資銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"商工組合中央金庫", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"新生銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"日本政策金融公庫", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"住信SBIネット銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"セブン銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"イオン銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"楽天銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"auじぶん銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"ソニー銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"PayPay銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"横浜銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"千葉銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"常陽銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"静岡銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"ふくおかフィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"西日本シティ銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"八十二銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"群馬銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"京都銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"広島銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"北陸銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"北海道銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"山口フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"めぶきフィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"コンコルディア・フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"九州フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"北國フィナンシャルホールディングス", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"岩手銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"秋田銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"東邦銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"武蔵野銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"千葉興業銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"東京きらぼしフィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"スルガ銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"山梨中央銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"北越銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"富山第一銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"福井銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"百五銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"三十三フィナンシャルグループ", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"滋賀銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"南都銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"紀陽銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"但馬銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"池田泉州ホールディングス", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"阿波銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"百十四銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"伊予銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"四国銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"佐賀銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"十八親和銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"肥後銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"大分銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"宮崎銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"鹿児島銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"琉球銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"沖縄銀行", group:"金融・銀行", industry:"地方銀行", emoji:"🏦" },
  { name:"三菱UFJ信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦" },
  { name:"みずほ信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦" },
  { name:"野村信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦" },
  { name:"SMBC信託銀行", group:"金融・銀行", industry:"信託銀行", emoji:"🏦" },
  { name:"野村證券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"大和証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"SMBC日興証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"みずほ証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"三菱UFJモルガン・スタンレー証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"岡三証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"東海東京証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"松井証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"マネックスグループ", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"SBI証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"楽天証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"au カブコム証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"GMOクリック証券", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"ジャフコ グループ", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"東京証券取引所", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"日本取引所グループ", group:"金融・銀行", industry:"証券会社", emoji:"🏦" },
  { name:"日本生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"第一生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"明治安田生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"住友生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"かんぽ生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"ソニー生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"アフラック生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"プルデンシャル生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"T&Dホールディングス", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"大樹生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"太陽生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"富国生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"朝日生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"ライフネット生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"アクサ生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"オリックス生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"三井住友海上あいおい生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"東京海上日動あんしん生命保険", group:"金融・銀行", industry:"生命保険", emoji:"🏦" },
  { name:"東京海上日動火災保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"三井住友海上火災保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"損害保険ジャパン", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"あいおいニッセイ同和損害保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"東京海上ホールディングス", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"SOMPOホールディングス", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"MS&ADインシュアランスグループホールディングス", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"AIG損害保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"Chubb損害保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"ゼネラリ・ホールディングス・ジャパン", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"チューリッヒ保険", group:"金融・銀行", industry:"損害保険", emoji:"🏦" },
  { name:"オリックス", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"三菱HCキャピタル", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"東京センチュリー", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"リコーリース", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"NECキャピタルソリューション", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"クレディセゾン", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"ジャックス", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"アコム", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"アイフル", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"SBIホールディングス", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"オリエントコーポレーション", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"イオンフィナンシャルサービス", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"ジャパンネット銀行", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"セゾン情報システムズ", group:"金融・銀行", industry:"銀行", emoji:"🏦" },
  { name:"三菱商事", group:"商社", industry:"総合商社", emoji:"🌐" },
  { name:"三井物産", group:"商社", industry:"総合商社", emoji:"🌐" },
  { name:"伊藤忠商事", group:"商社", industry:"総合商社", emoji:"🌐" },
  { name:"住友商事", group:"商社", industry:"総合商社", emoji:"🌐" },
  { name:"丸紅", group:"商社", industry:"総合商社", emoji:"🌐" },
  { name:"豊田通商", group:"商社", industry:"総合商社", emoji:"🌐" },
  { name:"双日", group:"商社", industry:"総合商社", emoji:"🌐" },
  { name:"メタルワン", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"三菱食品", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"伊藤忠食品", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"三井食品", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"加賀電子", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"稲畑産業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"兼松", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"日鉄物産", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"JFE商事", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"阪和興業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"エレマテック", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"因幡電機産業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"日伝", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"西華産業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"光世証券", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"岡谷鋼機", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"蝶理", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"東邦HD", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"スズケン", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"アルフレッサ ホールディングス", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"メディパルホールディングス", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"ユアサ商事", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"岩谷産業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"中外鉱業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"ハピネット", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"あらた", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"パルタック", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"三谷商事", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"ミスミグループ本社", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"正栄食品工業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"明和産業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"東京産業", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"TKC", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"シナネンホールディングス", group:"商社", industry:"専門商社", emoji:"🌐" },
  { name:"トヨタ自動車", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ホンダ", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"日産自動車", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"スズキ", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"マツダ", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"SUBARU", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"いすゞ自動車", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"三菱自動車工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ヤマハ発動機", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"川崎重工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"日野自動車", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"UDトラックス", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"デンソー", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"アイシン", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"豊田自動織機", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ジェイテクト", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"トヨタ紡織", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"小糸製作所", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"豊田合成", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"NTN", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"NSK", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"日本特殊陶業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ブリヂストン", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"住友ゴム工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"横浜ゴム", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"TOYO TIRE", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"曙ブレーキ工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ボッシュ", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"エクセディ", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"太平洋工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"河西工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"スタンレー電気", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"市光工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"日本電産", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ミツバ", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ヨロズ", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ハイレックス", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"フタバ産業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"シロキ工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"愛三工業", group:"メーカー", industry:"自動車", emoji:"🏭" },
  { name:"ソニーグループ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"パナソニックホールディングス", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"日立製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"三菱電機", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"東芝", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"シャープ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"富士通", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"NEC", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"キヤノン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"リコー", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"コニカミノルタ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"セイコーエプソン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ブラザー工業", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"オムロン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"横河電機", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"アンリツ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"島津製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"島田理化工業", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"HOYA", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"オリンパス", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ニコン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"富士フイルムホールディングス", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"アドバンテスト", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"スクリーンホールディングス", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ディスコ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"東京精密", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"新光電気工業", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"イビデン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"太陽誘電", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ニチコン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ルビコン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"FDK", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"古河電池", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"GSユアサ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ローム", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ルネサスエレクトロニクス", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"東京エレクトロン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"SUMCO", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"信越化学工業", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"レーザーテック", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"アルプスアルパイン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"TDK", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"村田製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"京セラ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ミネベアミツミ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ヒロセ電機", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ヤマハ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"コルグ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"JVCケンウッド", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"パイオニア", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"アイホン", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"アイコム", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"リョービ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"マキタ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ホシザキ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"パナソニック", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"アイリスオーヤマ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ダイキン工業", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"三菱重工サーマルシステムズ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"富士電機", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"明電舎", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"東芝テック", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"NECネッツエスアイ", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"パナホーム", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"東光電気", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"タムラ製作所", group:"メーカー", industry:"電機・電子", emoji:"🏭" },
  { name:"ロームグループ", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"KOKUSAI ELECTRIC", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"東京応化工業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"JSR", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"アドテック", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"東洋合成工業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"住友ベークライト", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"三菱マテリアル", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"三井金属鉱業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"古河電気工業", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"昭和電工", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"レゾナック", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"DOWAホールディングス", group:"メーカー", industry:"半導体・電子部品", emoji:"🏭" },
  { name:"三菱重工業", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"IHI", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"クボタ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"ファナック", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"コマツ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"日立建機", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"オークマ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"DMG森精機", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"アマダ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"JUKI", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"ナブテスコ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"ヤンマーホールディングス", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"タダノ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"タクボ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"新明和工業", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"住友重機械工業", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"日本製鋼所", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"椿本チエイン", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"ハーモニック・ドライブ・システムズ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"ジャパンマテリアル", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"SMC", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"CKD", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"エスペック", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"ナガオカ", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"日本精工", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"東京瓦斯", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"大阪ガス", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"東邦ガス", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"西部ガス", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"JERA", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"関西電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"東北電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"中部電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"北陸電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"中国電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"四国電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"九州電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"沖縄電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"北海道電力", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"東京電力ホールディングス", group:"メーカー", industry:"機械・重工", emoji:"🏭" },
  { name:"三菱ケミカルグループ", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"住友化学", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"三井化学", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"旭化成", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"東レ", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"帝人", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"クラレ", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"DIC", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"日本触媒", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"日油", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"花王", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"ライオン", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"資生堂", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"コーセー", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"ポーラ・オルビスホールディングス", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"マンダム", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"小林製薬", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"アース製薬", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"ピジョン", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"ユニ・チャーム", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"エステー", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"白元アース", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"日本製鉄", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"JFEホールディングス", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"神戸製鋼所", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"日新製鋼", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"大同特殊鋼", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"山陽特殊製鋼", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"住友金属鉱山", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"古河機械金属", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"AGC", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"日本電気硝子", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"日本板硝子", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"太平洋セメント", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"住友大阪セメント", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"UBE", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"TOTO", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"LIXILグループ", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"INAX", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"タカラスタンダード", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"クリナップ", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"リクシル", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"パナソニックハウジング", group:"メーカー", industry:"化学・素材", emoji:"🏭" },
  { name:"サントリーホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"アサヒグループホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"キリンホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"サッポロホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"オリオンビール", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"コカ・コーラボトラーズジャパンホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ダイドーグループホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ポッカサッポロフード&ビバレッジ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"伊藤園", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"コカ・コーラ ボトラーズジャパン", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"味の素", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ヤマザキビスケット", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"明治ホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"森永製菓", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"江崎グリコ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"カルビー", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ロッテ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"森永乳業", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"雪印メグミルク", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ヤクルト本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"フジパングループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"敷島製パン", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"山崎製パン", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"パスコ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"日清食品ホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"東洋水産", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ハウス食品グループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"エスビー食品", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ミツカン", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"キッコーマン", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"カゴメ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"Mizkan", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"プリマハム", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"伊藤ハム", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"日本ハム", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ニチレイ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"マルハニチロ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"ニチロ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"極洋", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"東洋製罐", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"東京製鐵", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"日清製粉グループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"日清オイリオグループ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"J-オイルミルズ", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"不二製油グループ本社", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"日東富士製粉", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"昭和産業", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"王子ホールディングス", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"日本製紙", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"北越コーポレーション", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"三菱製紙", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"レンゴー", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"大王製紙", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"日本紙パルプ商事", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"凸版印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"大日本印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"共同印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"図書印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"DNP大日本印刷", group:"メーカー", industry:"食品・飲料", emoji:"🏭" },
  { name:"武田薬品工業", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"アステラス製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"第一三共", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"エーザイ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"中外製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"大塚ホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"塩野義製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"協和キリン", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"参天製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"小野薬品工業", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"大日本住友製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"住友ファーマ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"東邦ホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ロート製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"久光製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ツムラ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ロハス・モチベーション", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"沢井製薬", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"日医工", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ソレイジア・ファーマ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"クラシエホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"テルモ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ニプロ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"シスメックス", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"JMS", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"日本光電工業", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"フクダ電子", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"アズビル", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"PHCホールディングス", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"エム・スリー", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ペプチドリーム", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"アンジェス", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"Chugai Pharmabody Research", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"GSK", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ノバルティス ファーマ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ファイザー", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"メルク", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"サノフィ", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"ロシュ・ダイアグノスティックス", group:"メーカー", industry:"医薬品", emoji:"🏭" },
  { name:"YKK", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"YKK AP", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"三菱鉛筆", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"パイロットコーポレーション", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"コクヨ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"プラス", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"セーラー万年筆", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ぺんてる", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"マブチモーター", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ナカニシ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ユニチャーム", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"アシックス", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ミズノ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"デサント", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ゴールドウイン", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ヨネックス", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"シマノ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ジーシー", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"モリタホールディングス", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"松風", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"シキボウ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"セーレン", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"三菱レイヨン", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"東洋紡", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"クラボウ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ヘリオス テクノ ホールディング", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"タカラトミー", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"エポック社", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"セガサミーホールディングス", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"アディダス", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ナイキ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"プーマ", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"タイガー魔法瓶", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"象印マホービン", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ピーコック魔法瓶工業", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"ティファール", group:"メーカー", industry:"その他メーカー", emoji:"🏭" },
  { name:"NTTデータ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"野村総合研究所", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"日鉄ソリューションズ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"SCSK", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"TIS", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"BIPROGY", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"伊藤忠テクノソリューションズ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"日本ユニシス", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"オービックビジネスコンサルタント", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"オービック", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"日立ソリューションズ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"NSD", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"コムチュア", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"アルファシステムズ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"DTS", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"ＳＣＳＫ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"システナ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"NSSOL", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"ネットワンシステムズ", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"クエスト", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"アイネット", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"電通国際情報サービス", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"CTC", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"TDCソフト", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"アルゴグラフィックス", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"インフォコム", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"ウェルネット", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"ITホールディングス", group:"IT・テック", industry:"SIer", emoji:"💻" },
  { name:"サイボウズ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"マネーフォワード", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"freee", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"Sansan", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"ラクス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"ラクスル", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"BASE", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"STORES", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"Chatwork", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"kintone", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"ZOHO", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"セールスフォース", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"SAP", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"オラクル", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"アドビ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"ワークス アプリケーションズ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"プロネクサス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"ジーニー", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"アドウェイズ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"DACホールディングス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"VOYAGE GROUP", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"Speee", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"エフルート", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"インタースペース", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"アジャイルメディア・ネットワーク", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"アイレップ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"セプテーニ・ホールディングス", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"オプトホールディング", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"オープンエイト", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"フリークアウト", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"アシスト", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"オロ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"ユーザベース", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"JBCC", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"JBS", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"クニエ", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"Diquest", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"Ridge-i", group:"IT・テック", industry:"ソフトウェア", emoji:"💻" },
  { name:"楽天グループ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"LINEヤフー", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"Zホールディングス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"メルカリ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"DeNA", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"サイバーエージェント", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"リクルートホールディングス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ZOZO", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"エムスリー", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"クックパッド", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"エニグモ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"スタートトゥデイ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"クラウドワークス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ランサーズ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ココナラ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ベース", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ミクシィ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"グリー", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"コロプラ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"アカツキ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"エイチーム", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"Klab", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ガンホー・オンライン・エンターテイメント", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"SHIFT", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"エス・エム・エス", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ビジョナル", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ビズリーチ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ユナイテッド", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ぐるなび", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"食べログ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"カカクコム", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"オリコ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ぴあ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ローソンチケット", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"Tマガジン", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ヤフオク", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"モバオク", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ZOZOTOWN", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ZOZOUSED", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ピクシブ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ニコニコ動画", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ドワンゴ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"KADOKAWA", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ユーチューブ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"TikTok", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"インスタグラム", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"Twitter", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ペイパル", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"Stripe", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"スマレジ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"Square", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"アマゾンジャパン", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"ネットプロテクションズ", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"WiL", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"スパイラル", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"Smarpony", group:"IT・テック", industry:"Web・インターネット", emoji:"💻" },
  { name:"NTT", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"NTTドコモ", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"KDDI", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"ソフトバンク", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"楽天モバイル", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"沖縄セルラー電話", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"インターネットイニシアティブ", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"ソフトバンクテクノロジー", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"ニフティ", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"BIGLOBE", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"エキサイト", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"USEN-NEXT HOLDINGS", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"スカパーJSATホールディングス", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"ジュピターテレコム", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"ケーブルテレビジョン東京", group:"IT・テック", industry:"通信", emoji:"💻" },
  { name:"アクセンチュア", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"デロイトトーマツコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"PwCコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"ベイカレント・コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"アビームコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"EYストラテジー・アンド・コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"KPMGコンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"ボストン コンサルティング グループ", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"マッキンゼー・アンド・カンパニー", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"ベイン・アンド・カンパニー", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"アーサー・ディ・リトル", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"ローランド・ベルガー", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"A.T. カーニー", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"ストラテジー&", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"オリバー・ワイマン", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"ATカーニー", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"シグマクシス", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"リブ・コンサルティング", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"リッジラインズ", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"フィールドマネージメント", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"コーポレイトディレクション", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"ドリームインキュベータ", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"経営共創基盤", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"リクルートマネジメントソリューションズ", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"船井総合研究所", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"タナベコンサルティンググループ", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"山田コンサルティンググループ", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"プライスウォーターハウスクーパース", group:"コンサル", industry:"経営コンサル", emoji:"💡" },
  { name:"フューチャー", group:"コンサル", industry:"ITコンサル", emoji:"💡" },
  { name:"JBCCホールディングス", group:"コンサル", industry:"ITコンサル", emoji:"💡" },
  { name:"ガートナー ジャパン", group:"コンサル", industry:"ITコンサル", emoji:"💡" },
  { name:"フロスト&サリバン ジャパン", group:"コンサル", industry:"ITコンサル", emoji:"💡" },
  { name:"三井不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"三菱地所", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"住友不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"東急不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"野村不動産ホールディングス", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"森ビル", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"ヒューリック", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"東京建物", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"オープンハウスグループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"レオパレス21", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"大東建託", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"スターツコーポレーション", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"アパグループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"サンフロンティア不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"プレサンスコーポレーション", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"タカラレーベン", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"フージャースホールディングス", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"シノケングループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"INTERTRUST", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"SREホールディングス", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"リログループ", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"平和不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"平河ヒューテック", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"東京楽天地", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"京阪神ビルディング", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"近鉄不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"阪急阪神不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"南海不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"ユーシン精機", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"関電不動産", group:"不動産・建設", industry:"デベロッパー", emoji:"🏢" },
  { name:"大成建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"鹿島建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"清水建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"大林組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"竹中工務店", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"戸田建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"熊谷組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"前田建設工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"西松建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"鴻池組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"奥村組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"鉄建建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"東鉄工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"錢高組", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"東洋建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"佐藤工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"長谷工コーポレーション", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"木下グループ", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"三井住友建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"東急建設", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"JR西日本テクノス", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"住友林業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"積水ハウス", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"大和ハウス工業", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"ミサワホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"旭化成ホームズ", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"三井ホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"トヨタホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"タマホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"アキュラホーム", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"オープンハウス", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"建築工房零", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"コタ", group:"不動産・建設", industry:"建設・ゼネコン", emoji:"🏢" },
  { name:"セブン&アイ・ホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"イオン", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ファーストリテイリング", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ニトリホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"良品計画", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"三越伊勢丹ホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"高島屋", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"大丸松坂屋百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"Jフロント リテイリング", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"H2Oリテイリング", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"近鉄百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"松屋", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"東急百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"小田急百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"西武百貨店", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"そごう", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"コクミン", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ココカラファイン", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"スギ薬局", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"マツモトキヨシ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ツルハホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ウエルシアホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"コスモス薬品", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"クスリのアオキ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ドラッグストアマツモトキヨシ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ヤマダホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ビックカメラ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ヨドバシカメラ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ノジマ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ケーズホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"エディオン", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"上新電機", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"コジマ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ベスト電器", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ヨドバシ・ドット・コム", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"Amazon", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"楽天市場", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"Yahoo!ショッピング", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"BUYMA", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ZARA", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"H&M", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"GAP", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"UNIQLO", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"しまむら", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"西松屋チェーン", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"アダストリア", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ユナイテッドアローズ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ビームス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"シップス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"オンワードホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ワールド", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"TSI ホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ストライプインターナショナル", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ハニーズホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ABCマート", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"チヨダ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"エービーシー・マート", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ジーフット", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ヒラキ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"オアシスライフスタイルグループ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"コナカ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"AOKIホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"青山商事", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"はるやまホールディングス", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"タカキュー", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"アスクル", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ロハコ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"モノタロウ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ミスミ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"コクヨマーケティング", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"アイリスプラザ", group:"小売・流通", industry:"専門小売", emoji:"🛒" },
  { name:"ヨーカドー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ライフコーポレーション", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ロピア", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"オーケー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"サミット", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"成城石井", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"紀ノ国屋", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"クイーンズ伊勢丹", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ヤオコー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ベルク", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"マルエツ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"東急ストア", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"東武ストア", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"小田急OX", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ライフ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ダイエー", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"西友", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"平和堂", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"アークス", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"アクシアル リテイリング", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ヤマナカ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ハローズ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"イズミ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"フジ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"コープこうべ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ユーコープ", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"コープみらい", group:"小売・流通", industry:"百貨店・スーパー", emoji:"🛒" },
  { name:"ベルーナ", group:"小売・流通", industry:"EC・通販", emoji:"🛒" },
  { name:"ニッセン・ホールディングス", group:"小売・流通", industry:"EC・通販", emoji:"🛒" },
  { name:"千趣会", group:"小売・流通", industry:"EC・通販", emoji:"🛒" },
  { name:"スターゼン", group:"小売・流通", industry:"EC・通販", emoji:"🛒" },
  { name:"オイシックス・ラ・大地", group:"小売・流通", industry:"EC・通販", emoji:"🛒" },
  { name:"日本郵船", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"商船三井", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"川崎汽船", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"NSユナイテッド海運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"飯野海運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"明治海運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"東京汽船", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"名村造船所", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"ヤマトホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"SGホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"佐川急便", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"日本通運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"NIPPON EXPRESSホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"近鉄エクスプレス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"上組", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"三井倉庫ホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"住友倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"三菱倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"澁澤倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"安田倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"日本梱包運輸倉庫", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"C&Fロジホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"セイノーホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"セイノー", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"福山通運", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"トナミホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"ハマキョウレックス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"センコーグループホールディングス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"鴻池運輸", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"関西エアポート", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"成田国際空港", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"羽田空港ターミナルサービス", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"JR貨物", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"JFEエンジニアリング", group:"小売・流通", industry:"物流・運輸", emoji:"🛒" },
  { name:"リクルート", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"パーソルホールディングス", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"パソナグループ", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"エン・ジャパン", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"マイナビ", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"ディップ", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"レバレジーズ", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"インフォマート", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"クイック", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"JAC Recruitment", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"ヒューマンホールディングス", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"ニッソーネット", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"アウトソーシング", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"キャリアデザインセンター", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"UTグループ", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"アヴァンティスタッフ", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"ヒトコム", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"アイデムホールディングス", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"アクセス・ジャパン", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"ウィルグループ", group:"サービス", industry:"人材・派遣", emoji:"📢" },
  { name:"電通グループ", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"博報堂DYホールディングス", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"ADKホールディングス", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"東急エージェンシー", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"デルフィス", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"DAサーチ&リンク", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"ジェイアール東日本企画", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"読売広告社", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"アサツー ディ・ケイ", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"ベクトル", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"プラップジャパン", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"共同ピーアール", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"電通PR", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"オズマピーアール", group:"サービス", industry:"広告・PR", emoji:"📢" },
  { name:"朝日新聞社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"読売新聞社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"毎日新聞社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"産業経済新聞社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"日本経済新聞社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"共同通信社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"時事通信社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"NHK", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"日本テレビホールディングス", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"TBSホールディングス", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"フジ・メディア・ホールディングス", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"テレビ朝日ホールディングス", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"テレビ東京ホールディングス", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"WOWOW", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"スカパーJSAT", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"TOKYO MX", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"毎日放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"朝日放送グループホールディングス", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"関西テレビ放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"読売テレビ放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"東海テレビ放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"中部日本放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"北海道放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"東北放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"RKB毎日放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"琉球放送", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"琉球新報社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"沖縄タイムス社", group:"サービス", industry:"メディア", emoji:"📢" },
  { name:"日本マクドナルドホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ゼンショーホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"コロワイド", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"くら寿司", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"スシロー", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"FOOD&LIFE COMPANIES", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"王将フードサービス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"松屋フーズホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"吉野家ホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ロイヤルホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ロッテリア", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"モスフードサービス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ドトール・日レスホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"スターバックスコーヒージャパン", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"タリーズコーヒージャパン", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"プロント コーポレーション", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"コメダ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ピザハット", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ピザーラ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ドミノ・ピザ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"フォーシーズ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"クリエイト・レストランツ・ホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ワタミ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"チムニー", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ダイヤモンドダイニング", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"エスエルディー", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"和民", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"モンテローザ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"金の蔵", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"白木屋", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"笑笑", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ハイデイ日高", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"リンガーハット", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"幸楽苑ホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"物語コーポレーション", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"あみやき亭", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"木曽路", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"アークランドサービスホールディングス", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"サイゼリヤ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"フジオフードグループ本社", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ジョイフル", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ガスト", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"バーミヤン", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ジョナサン", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"カフェ・ベローチェ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"エクセルシオール カフェ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"プロント", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"タリーズ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"スタバ", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"コメダ珈琲店", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"コーヒーチェーン", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ロイヤルホスト", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"びっくりドンキー", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"ステーキガスト", group:"サービス", industry:"外食", emoji:"📢" },
  { name:"SMS", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"アイビー化粧品", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"ファンケル", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"DHC", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"ノエビアホールディングス", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"ポーラ", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"オルビス", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"アルビオン", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"カネボウ化粧品", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"アクセーヌ", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"クラブコスメチックス", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"シャネル", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"ディオール", group:"医療・ヘルス", industry:"医療機器", emoji:"🏥" },
  { name:"ベネッセホールディングス", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"学研ホールディングス", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"ナガセ", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"東進ハイスクール", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"河合塾", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"駿台予備学校", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"代々木ゼミナール", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"Z会", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"早稲田アカデミー", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"臨海セミナー", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"TAC", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"資格の大原", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"LEC東京リーガルマインド", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"ECC", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"ベルリッツ", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"ステップ", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"明光ネットワークジャパン", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"リソー教育", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"幼児活動研究会", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"ヒューマンアカデミー", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"シナジア・キャピタル", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"リクルート(スタディサプリ)", group:"教育・公共", industry:"学校・予備校", emoji:"📚" },
  { name:"バンダイナムコホールディングス", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"任天堂", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"カプコン", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"コナミグループ", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"スクウェア・エニックス・ホールディングス", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"コーエーテクモホールディングス", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"KLab", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"Aiming", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"gumi", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"フジ・スタートアップ・ベンチャーズ", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"ソニー・インタラクティブエンタテインメント", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"マイクロソフト", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"エレクトロニック・アーツ", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"ユービーアイソフト", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"ブリザード", group:"エンタメ", industry:"ゲーム", emoji:"🎮" },
  { name:"東宝", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"東映", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"松竹", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"角川映画", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ワーナー ブラザース", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ディズニー", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ジブリ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ソニー・ミュージックエンタテインメント", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"エイベックス", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ユニバーサル ミュージック", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ワーナーミュージック・ジャパン", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"アミューズ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ホリプロ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"研音", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"スターダストプロモーション", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"太田プロダクション", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"吉本興業", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"松竹芸能", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"ナベプロ", group:"エンタメ", industry:"映像・音楽", emoji:"🎮" },
  { name:"講談社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"集英社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"小学館", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"新潮社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"文藝春秋", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"幻冬舎", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"早川書房", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"東洋経済新報社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"ダイヤモンド社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"プレジデント社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"日経BP", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"日本経済新聞出版", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"日経BPマーケティング", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"ベネッセコーポレーション", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"学研プラス", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"旺文社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"河出書房新社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"岩波書店", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"三省堂", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"学研ステイフル", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"主婦の友社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"主婦と生活社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"光文社", group:"エンタメ", industry:"出版", emoji:"🎮" },
  { name:"ANAホールディングス", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"日本航空", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"スカイマーク", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"Peach Aviation", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"ジェットスター・ジャパン", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"春秋航空日本", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"AIRDO", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"ソラシドエア", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"スターフライヤー", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"アイベックスエアラインズ", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"フジドリームエアラインズ", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"オリエンタルエアブリッジ", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"新中央航空", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"天草エアライン", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"琉球エアーコミューター", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"JAL", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"ANA", group:"航空・交通", industry:"航空", emoji:"✈️" },
  { name:"JR東日本", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"JR東海", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"JR西日本", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"JR北海道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"JR九州", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"JR四国", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"東京地下鉄(東京メトロ)", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"東京都交通局", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"小田急電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"東急電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"京王電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"京急電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"京成電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"京浜急行電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"西武鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"東武鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"名古屋鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"近鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"南海電気鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"阪急電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"阪神電気鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"京阪電気鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"西日本鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"新京成電鉄", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"北総鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"相模鉄道", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"横浜市交通局", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"名古屋市交通局", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"大阪市高速電気軌道(Osaka Metro)", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"京都市交通局", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"札幌市交通局", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"仙台市交通局", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"九州旅客鉄道(JR九州)", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"小田急バス", group:"航空・交通", industry:"鉄道", emoji:"✈️" },
  { name:"JR東日本バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"JRバス関東", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"京王電鉄バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"京急バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"京成バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"東急バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"西武バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"東武バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"西鉄バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"近鉄バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"阪急バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"南海バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"京阪バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"名鉄バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"千葉中央バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"関東バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
  { name:"横浜市営バス", group:"航空・交通", industry:"バス", emoji:"✈️" },
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
  const [selTab,   setSelTab]   = useState("interview");
  const [authMode, setAuthMode] = useState(null);
  const [toast,    setToast]    = useState(null);
  const [editTgt,  setEditTgt]  = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQ,  setSearchQ]  = useState("");
  const [grpFilter,setGrpFilter]= useState("");
  const [subFilter,setSubFilter]= useState("");
  const [sortBy,   setSortBy]   = useState("posts");

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
  const go = (p, co = null, tab = null) => {
    setPage(p);
    if (co  !== null) setSelCo(co);
    if (tab !== null) setSelTab(tab);
    else if (p === "company") setSelTab("interview");
    window.scrollTo(0, 0);
    setMenuOpen(false);
  };

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
  const addCompany = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に企業追加できます"); return; }
    const data = { ...d, group: d.group || getGroup(d.industry), author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("companies", data);
    setCompanies(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("「" + d.name + "」を追加しました");
    go("company", { id, ...data }, "interview");
  };

  const addPost = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null, likes: [], comments: [] };
    const id   = await fsAdd("posts", data);
    setPosts(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("投稿しました");
    go("company", companies.find(c => c.id === d.companyId), d.ptype);
  };

  const addReview = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に口コミ投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("reviews", data);
    setReviews(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("口コミを投稿しました");
    go("company", companies.find(c => c.id === d.companyId), "review");
  };

  const addSalary = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に年収情報投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("salaries", data);
    setSalaries(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("年収情報を投稿しました");
    go("company", companies.find(c => c.id === d.companyId), "salary");
  };

  const addJobListing = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に募集要項追加できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("joblistings", data);
    setJobListings(prev => [{ id, ...data }, ...prev]);
    toast2("募集要項を追加しました");
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
  if (searchQ)    filteredCos = filteredCos.filter(c => c.name.includes(searchQ));
  if (sortBy === "rating")  filteredCos.sort((a,b) => (calcAvg(coRevs(b.id))?.overall || 0) - (calcAvg(coRevs(a.id))?.overall || 0));
  else if (sortBy === "salary") filteredCos.sort((a,b) => (calcAvgSal(coSals(b.id)) || 0) - (calcAvgSal(coSals(a.id)) || 0));
  else filteredCos.sort((a,b) => coPosts(b.id).length + coRevs(b.id).length - (coPosts(a.id).length + coRevs(a.id).length));

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

  const sp = { sess, go, companies, posts, reviews, salaries, jobListings, plan, isAdmin, adminDelete, adminEdit, setEditTgt, setAuthMode, isMobile, uName, upgradePlan, authUser, favorites, toggleFavorite };

  return (
    <ErrorBoundary>
    <div style={S.root}>
      <style>{CSS}</style>
      <AppNav {...sp} menuOpen={menuOpen} setMenuOpen={setMenuOpen} logout={logout} />
      {toast && <div style={S.toast} className="fadeUp">{toast}</div>}
      {authMode && <AuthModal mode={authMode} setMode={setAuthMode} onLogin={login} onRegister={register} onReset={resetPassword} />}
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
        {page === "home"       && <HomePage       {...sp} coPosts={coPosts} coRevs={coRevs} coSals={coSals} setAuthMode={setAuthMode} />}
        {page === "companies"  && <CompaniesPage  {...sp} filtered={filteredCos} searchQ={searchQ} setSearchQ={setSearchQ} grpFilter={grpFilter} setGrpFilter={setGrpFilter} subFilter={subFilter} setSubFilter={setSubFilter} sortBy={sortBy} setSortBy={setSortBy} coPosts={coPosts} coRevs={coRevs} coSals={coSals} />}
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
function AuthModal({ mode, setMode, onLogin, onRegister, onReset }) {
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
function AppNav({ sess, go, plan, isAdmin, setAuthMode, isMobile, menuOpen, setMenuOpen, logout }) {
  const [drop, setDrop] = useState(false);
  const pl = PLANS[plan];
  return (
    <nav style={S.nav}>
      <div style={{ height:3, background:"linear-gradient(90deg, #1E5A96 0%, #2B7BD1 100%)" }} />
      <div style={{ maxWidth:1160, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", padding: isMobile ? "8px 12px" : "10px 24px" }}>
        <button style={S.logoBtn} onClick={() => go("home")}>
          <span style={{ ...S.logoText, fontSize: isMobile ? 17 : 22 }}>CareerClub</span>
          {!isMobile && <span style={{ display:"block", fontSize:9, color:C.sub, letterSpacing:"0.1em", marginTop:1 }}>転職・就活情報コミュニティ「キャリクラ」</span>}
        </button>
        {isMobile ? (
          <button style={{ background:"none", border:"none", display:"flex", flexDirection:"column", gap:4, padding:6, cursor:"pointer" }} onClick={() => setMenuOpen(o => !o)}>
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", transform: menuOpen ? "rotate(45deg) translateY(6px)" : "none" }} />
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", transform: menuOpen ? "rotate(-45deg) translateY(-6px)" : "none" }} />
          </button>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:0 }}>
            {[["home","ホーム"],["companies","企業一覧"],["ranking","ランキング"]].map(([p,l]) => (
              <span key={p}>
                <button style={{ background:"none", border:"none", color:C.ink, fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go(p)}>{l}</button>
                <span style={{ color:C.border, fontSize:11 }}>|</span>
              </span>
            ))}
            <button style={{ background:"none", border:"none", color:C.ink, fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go("addCompany")}>＋企業追加</button>
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
          {[["home","ホーム"],["companies","企業一覧"],["ranking","ランキング"],["addCompany","＋企業追加"]].map(([p,l]) => (
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
function HomePage({ sess, go, companies, posts, reviews, salaries, isAdmin, adminDelete, setEditTgt, coPosts, coRevs, coSals, isMobile, setAuthMode }) {
  const recent   = posts.slice(0, 8);
  const topCos   = [...companies].sort((a,b) => coRevs(b.id).length + coPosts(b.id).length - (coRevs(a.id).length + coPosts(a.id).length)).slice(0, 10);
  const weekAgo  = Date.now() - 7 * 86400000;
  const trending = [...posts].filter(p => {
    const ts = p.createdAt?.toDate?.()?.getTime() || 0;
    return ts > weekAgo;
  }).sort((a,b) => (b.likes?.length || 0) - (a.likes?.length || 0)).slice(0, 4);

  return (
    <div>
      {/* ヒーローセクション - 明るい青グラデーション */}
      <section style={{
        background: "linear-gradient(135deg, #1E5A96 0%, #2B7BD1 100%)",
        color: "#fff",
        padding: isMobile ? "32px 20px" : "56px 40px",
        marginBottom: 24,
        borderRadius: 12,
        marginTop: 16,
      }}>
        <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center" }}>
          <p style={{ fontSize:11, fontWeight:"bold", letterSpacing:"0.18em", opacity:0.9, marginBottom:12 }}>
            CAREER COMMUNITY
          </p>
          <h1 style={{ fontSize: isMobile ? 22 : 32, fontWeight:"bold", lineHeight:1.5, marginBottom:14, fontFamily:"\"Noto Serif JP\", serif" }}>
            転職・就活の<span style={{ color:"#FCD34D" }}>本音</span>が集まる<br />
            キャリア情報コミュニティ
          </h1>
          <p style={{ fontSize: isMobile ? 13 : 15, lineHeight:1.9, opacity:0.95, marginBottom:24 }}>
            面接体験談・年収・口コミ・選考情報を{!isMobile && <br />}
            みんなで共有して、転職・就活を成功させよう
          </p>
          {!sess && (
            <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
              <button style={{
                background:"#fff", color:"#1E5A96", border:"none",
                padding:"12px 32px", fontSize:14, fontWeight:"bold",
                fontFamily:"inherit", cursor:"pointer", borderRadius:6,
                boxShadow:"0 4px 12px rgba(0,0,0,0.15)"
              }} onClick={() => setAuthMode("register")}>
                無料会員登録（30秒）
              </button>
              <button style={{
                background:"rgba(255,255,255,0.15)", color:"#fff",
                border:"2px solid rgba(255,255,255,0.5)",
                padding:"10px 24px", fontSize:14, fontWeight:"bold",
                fontFamily:"inherit", cursor:"pointer", borderRadius:6
              }} onClick={() => setAuthMode("login")}>
                ログイン
              </button>
            </div>
          )}
          <div style={{ display:"flex", gap: isMobile ? 16 : 32, justifyContent:"center", marginTop:28, flexWrap:"wrap" }}>
            {[[companies.length,"企業"],[posts.length,"体験談"],[reviews.length,"口コミ"],[salaries.length,"年収情報"]].map(([n,l]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize: isMobile ? 22 : 28, fontWeight:"bold", fontFamily:"\"Noto Serif JP\", serif" }}>{n.toLocaleString()}</div>
                <div style={{ fontSize:11, opacity:0.85, marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 未ログインユーザー向けの登録誘導 */}
      {!sess && (
        <section style={{
          background:"#FFF8E7", border:"1px solid #F5D982", borderRadius:8,
          padding: isMobile ? "16px 18px" : "20px 28px", marginBottom:24,
          display:"flex", alignItems:"center", gap:16, flexWrap:"wrap"
        }}>
          <div style={{ fontSize:32, flexShrink:0 }}>🎁</div>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontWeight:"bold", fontSize:15, color:"#92400E", marginBottom:4 }}>
              会員登録（無料）でできること
            </div>
            <div style={{ fontSize:13, color:"#78350F", lineHeight:1.7 }}>
              ✓ 企業の口コミ・年収を全文閲覧 &nbsp; ✓ 体験談・選考情報を投稿 &nbsp; ✓ お気に入り企業を保存
            </div>
          </div>
          <button style={{
            background:"#1E5A96", color:"#fff", border:"none",
            padding:"10px 24px", fontSize:13, fontWeight:"bold",
            fontFamily:"inherit", cursor:"pointer", borderRadius:6, whiteSpace:"nowrap"
          }} onClick={() => setAuthMode("register")}>
            無料会員登録 →
          </button>
        </section>
      )}

      {/* メインコンテンツ：2カラム */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap:24, alignItems:"start" }}>
        {/* 左カラム：トレンドと最新投稿 */}
        <section>
          {trending.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:16, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"3px solid " + C.accent, color:C.ink, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ background:C.accent, color:"#fff", padding:"3px 10px", fontSize:11, borderRadius:4 }}>HOT</span>
                今週のトレンド
              </h2>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:12 }}>
                {trending.map(p => (
                  <PostCard key={p.id} post={p} co={companies.find(c => c.id === p.companyId)} go={go} isAdmin={isAdmin} onDelete={adminDelete} onEdit={d => setEditTgt({ type:"post", data:d })} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 style={{ fontSize:16, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"3px solid " + C.accent, color:C.ink }}>
              最新の体験談・口コミ
            </h2>
            {recent.length === 0
              ? <Empty text="まだ投稿がありません。最初の投稿をしてみましょう！" />
              : recent.map(p => (
                  <PostCard key={p.id} post={p} co={companies.find(c => c.id === p.companyId)} go={go} isAdmin={isAdmin} onDelete={adminDelete} onEdit={d => setEditTgt({ type:"post", data:d })} />
                ))
            }
          </div>
        </section>

        {/* 右カラム：注目企業＋業種ナビ */}
        {!isMobile && (
          <aside>
            <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px", marginBottom:16 }}>
              <h3 style={{ fontSize:14, fontWeight:"bold", marginBottom:12, color:C.ink, paddingBottom:8, borderBottom:"2px solid " + C.accent }}>
                ⭐ 注目の企業
              </h3>
              {topCos.slice(0,8).map((co,i) => {
                const a   = calcAvg(coRevs(co.id));
                const sal = calcAvgSal(coSals(co.id));
                return (
                  <div key={co.id} style={{ padding:"8px 0", borderBottom: i < 7 ? "1px solid " + C.border : "none", cursor:"pointer", display:"flex", alignItems:"center", gap:8 }} onClick={() => go("company", co)}>
                    <span style={{ fontSize:11, color:C.accent, fontWeight:"bold", width:18 }}>{i+1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:"bold", color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{co.name}</div>
                      <div style={{ fontSize:10, color:C.sub, marginTop:1 }}>
                        {a && <span style={{ color:C.accent, fontWeight:"bold" }}>★{a.overall.toFixed(1)}</span>}
                        {a && sal && " · "}
                        {sal && <span>{sal}万円</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button style={{
                width:"100%", background:"#fff", border:"1px solid " + C.accent,
                color:C.accent, padding:"8px", fontSize:12, fontWeight:"bold",
                marginTop:10, cursor:"pointer", fontFamily:"inherit", borderRadius:4
              }} onClick={() => go("ranking")}>
                ランキングをもっと見る →
              </button>
            </div>

            <div style={{ background:"#fff", border:"1px solid " + C.border, borderRadius:8, padding:"16px 18px" }}>
              <h3 style={{ fontSize:14, fontWeight:"bold", marginBottom:12, color:C.ink, paddingBottom:8, borderBottom:"2px solid " + C.accent }}>
                🏢 業種別に企業を探す
              </h3>
              {ALL_GROUPS.map(grp => {
                const count = companies.filter(c => (c.group || getGroup(c.industry)) === grp).length;
                return (
                  <div key={grp} style={{ padding:"6px 0", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", fontSize:12 }} onClick={() => go("companies")}>
                    <span style={{ color:C.ink }}>{grp}</span>
                    <span style={{ color:C.sub, fontSize:11 }}>{count}社</span>
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {/* SEO用の隠しテキストではなく、フッター上部に検索キーワード関連のリンク集 */}
      <section style={{ marginTop:32, padding:"20px 24px", background:"#fff", border:"1px solid " + C.border, borderRadius:8 }}>
        <h2 style={{ fontSize:14, fontWeight:"bold", marginBottom:12, color:C.ink }}>転職・就活でよく検索されるキーワード</h2>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {["面接体験談","年収口コミ","選考フロー","中途採用","新卒採用","残業時間","内定","退職金","面接対策","志望動機","ES通過","年収比較","給料","ボーナス","働き方","企業研究"].map(kw => (
            <span key={kw} style={{
              background:C.light, color:C.accent, border:"1px solid " + C.border,
              padding:"4px 10px", fontSize:11, borderRadius:14, cursor:"pointer"
            }} onClick={() => go("companies")}>#{kw}</span>
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
            <button key={grp} style={{ ...S.chip, ...(grpFilter === grp ? S.chipOn : {}) }} onClick={() => setGrpFilter(g => g === grp ? "" : grp)}>{grp}</button>
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
                    <span style={{ fontSize:22 }}>{co.emoji}</span>
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
                    <td style={S.td}><span style={{ fontSize:16, marginRight:8 }}>{co.emoji}</span><span style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</span></td>
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
function CompanyPage({ go, co, cposts, crevs, csals, cjobs, initTab, onToggleLike, onAddComment, onAddPost, onAddReview, onAddSalary, onAddJob, isAdmin, adminDelete, setEditTgt, plan, setAuthMode, isMobile, uName, favorites, toggleFavorite, sess }) {
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
          <span style={{ fontSize: isMobile ? 28 : 40 }}>{co.emoji}</span>
          <div style={{ flex:1 }}>
            <h1 style={{ fontWeight:"bold", fontFamily:"serif", fontSize: isMobile ? 18 : 24 }}>{co.name}</h1>
            <p style={{ fontSize:12, color:C.sub, marginTop:3 }}>{co.group || getGroup(co.industry)} &gt; {co.industry}</p>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {a && (
              <div style={{ textAlign:"center", border:"1px solid " + C.border, padding:"10px 14px", minWidth:90 }}>
                <div style={{ fontSize:10, color:C.sub, marginBottom:3 }}>総合評価</div>
                <div style={{ fontSize:26, fontWeight:"bold", color:C.accent, fontFamily:"serif", lineHeight:1 }}>{a.overall.toFixed(1)}</div>
                <Stars r={a.overall} size={11} />
              </div>
            )}
            {sal && (
              <div style={{ textAlign:"center", border:"1px solid " + C.border, padding:"10px 14px", minWidth:90 }}>
                <div style={{ fontSize:10, color:C.sub, marginBottom:3 }}>平均年収</div>
                <div style={{ fontSize:22, fontWeight:"bold", color:"#1a5276", fontFamily:"serif", lineHeight:1 }}>{sal}<span style={{ fontSize:12, fontWeight:"normal" }}>万円</span></div>
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
      {/* 職種別フィルター */}
      <div style={{ overflowX:"auto", margin:"12px 0 0 0", paddingBottom:4 }}>
        <div style={{ display:"flex", gap:4, minWidth:"max-content" }}>
          {getJobCategories(co.group || co.industry).map(jc => (
            <button key={jc} style={{ border:"1px solid " + C.border, background: jobCat===jc ? C.accent : "#F7F7F7", color: jobCat===jc ? "#fff" : C.sub, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }} onClick={() => setJobCat(jc)}>{jc}</button>
          ))}
        </div>
      </div>
      {/* タブグループ：選考者向け（オレンジ系）/ 在籍者向け（青系）/ その他 */}
      <div style={{ marginTop:14, marginBottom:0 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:0, borderBottom:"2px solid " + C.ink }}>
          {/* 選考者向け */}
          <div style={{ display:"flex", paddingRight:14, borderRight:"1px solid " + C.border, position:"relative" }}>
            <span style={{ position:"absolute", top:-14, left:0, fontSize:9, color:"#C2410C", fontWeight:"bold", letterSpacing:"0.06em", whiteSpace:"nowrap" }}>📝 選考を受けた人の情報</span>
            {tabsCandidate.map(([k,l,n]) => (
              <button key={k} style={{ background:"none", border:"none", padding:"9px 12px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? "#C2410C" : C.sub, borderBottom:"3px solid " + (tab===k ? "#F59E0B" : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500", whiteSpace:"nowrap" }} onClick={() => setTab(k)}>
                {l}<span style={{ fontSize:10, background: tab===k ? "#F59E0B" : "#eee", color: tab===k ? "#fff" : C.sub, padding:"1px 5px", marginLeft:3, borderRadius:2 }}>{n}</span>
              </button>
            ))}
          </div>
          {/* 在籍者向け */}
          <div style={{ display:"flex", paddingLeft:14, paddingRight:14, borderRight:"1px solid " + C.border, position:"relative" }}>
            <span style={{ position:"absolute", top:-14, left:14, fontSize:9, color:C.accent, fontWeight:"bold", letterSpacing:"0.06em", whiteSpace:"nowrap" }}>🏢 在籍者・元社員の情報</span>
            {tabsEmployee.map(([k,l,n]) => (
              <button key={k} style={{ background:"none", border:"none", padding:"9px 12px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? C.accent : C.sub, borderBottom:"3px solid " + (tab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500", whiteSpace:"nowrap" }} onClick={() => setTab(k)}>
                {l}<span style={{ fontSize:10, background: tab===k ? C.accent : "#eee", color: tab===k ? "#fff" : C.sub, padding:"1px 5px", marginLeft:3, borderRadius:2 }}>{n}</span>
              </button>
            ))}
          </div>
          {/* その他 */}
          <div style={{ display:"flex", paddingLeft:14 }}>
            {tabsOther.map(([k,l,n]) => (
              <button key={k} style={{ background:"none", border:"none", padding:"9px 12px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? C.ink : C.sub, borderBottom:"3px solid " + (tab===k ? C.ink : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500", whiteSpace:"nowrap" }} onClick={() => setTab(k)}>
                {l}<span style={{ fontSize:10, background: tab===k ? C.ink : "#eee", color: tab===k ? "#fff" : C.sub, padding:"1px 5px", marginLeft:3, borderRadius:2 }}>{n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop:18 }} />
      <div style={{ paddingTop:20 }}>
        {tab === "interview" && <PostsTab posts={iv} ptype="interview" label="面接体験談" co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} sess={sess} setAuthMode={setAuthMode} />}
        {tab === "board"     && <PostsTab posts={bd} ptype="board"     label="選考掲示板" co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} sess={sess} setAuthMode={setAuthMode} />}
        {tab === "es"        && <PostsTab posts={es} ptype="es"        label="ES例文"     co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} sess={sess} setAuthMode={setAuthMode} />}
        {tab === "review"    && <ReviewsTab revs={crevs} avgData={a}   co={co} uName={uName} plan={plan} onAddReview={onAddReview} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} go={go} sess={sess} setAuthMode={setAuthMode} />}
        {tab === "salary"    && <SalaryTab  sals={csals} avgSalary={sal} co={co} uName={uName} plan={plan} onAddSalary={onAddSalary} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} go={go} sess={sess} setAuthMode={setAuthMode} />}
        {tab === "jobs"      && <JobsTab    jobs={cjobs} co={co} uName={uName} onAddJob={onAddJob} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} />}
      </div>
    </div>
  );
}

// ─── 掲示板・体験談タブ ───────────────────────────────────────────────────────
function PostsTab({ posts, ptype, label, co, uName, onAddPost, onToggleLike, onAddComment, isAdmin, adminDelete, setEditTgt, favorites, toggleFavorite, jobCat, sess, setAuthMode }) {
  const [exp,  setExp]  = useState(null);
  const [cmt,  setCmt]  = useState("");
  const [form, setForm] = useState(null);
  const [customStage, setCustomStage] = useState("");
  const [showCustomStage, setShowCustomStage] = useState(false);
  const [stages, setStages] = useState([{ stage:"", content:"" }]);
  const isES = ptype === "es";
  const isInterview = ptype === "interview";
  const initF = isES
    ? { companyId:co.id, ptype, stage:"内定", title:"", content:"", jobCategory:"全職種", esQuestion:"", year:new Date().getFullYear() }
    : isInterview
    ? {
        companyId:co.id, ptype, stage:"", title:"", content:"", jobCategory:"全職種",
        // 多段階情報
        applyMethod:"", prevJobType:"", prevSalary:"", prevAge:"",
        stages:[
          { name:"書類選考", content:"", days:"", result:"通過" }
        ],
        finalResult:"", offerAmount:"", offerBase:"", offerBonus:""
      }
    : { companyId:co.id, ptype, stage:"", title:"", content:"", jobCategory:"全職種", offerAmount:"", offerBase:"", offerBonus:"" };
  const sorted = [...posts].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  return (
    <div>
      {ptype === "board" && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", padding:"10px 14px", borderRadius:6, marginBottom:14, fontSize:12, color:"#92400E", lineHeight:1.7 }}>
          <strong>📋 職種ごとに掲示板が分かれています</strong><br />
          上部の「職種カテゴリ」から選びたい職種を選んでください。投稿時も職種を選んでください。
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
          <Fld label="職種カテゴリ">
            <select style={S.input} value={form.jobCategory || "全職種"} onChange={e => setForm({ ...form, jobCategory:e.target.value })}>
              {getJobCategories(co.group || co.industry).map(j => <option key={j}>{j}</option>)}
            </select>
          </Fld>
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
          {!isES && !isInterview && (
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
              <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"12px 14px", borderRadius:6, marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:"bold", color:"#0C4A6E", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span>🎯 選考プロセス（段階ごとに記入）</span>
                  <button type="button" style={{ background:C.accent, color:"#fff", border:"none", padding:"4px 12px", fontSize:11, fontFamily:"inherit", cursor:"pointer", borderRadius:4 }} onClick={() => {
                    const next = form.stages.length;
                    const defaultName = ["書類選考","一次面接","二次面接","三次面接","四次面接","五次面接","六次面接","七次面接","八次面接","最終面接"][next] || `${next + 1}回目の選考`;
                    setForm({...form, stages:[...form.stages, { name:defaultName, content:"", days:"", result:"通過" }]});
                  }}>＋ 段階を追加</button>
                </div>
                {form.stages.map((stg, i) => (
                  <div key={i} style={{ background:"#fff", border:"1px solid " + C.border, padding:"10px 12px", marginBottom:8, borderRadius:4 }}>
                    <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
                      <span style={{ background:C.accent, color:"#fff", padding:"2px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>段階 {i + 1}</span>
                      <input style={{...S.input, flex:1}} placeholder="例：書類選考、一次面接、最終面接" value={stg.name} onChange={e => {
                        const ns = [...form.stages]; ns[i] = {...ns[i], name:e.target.value}; setForm({...form, stages:ns});
                      }} />
                      {form.stages.length > 1 && (
                        <button type="button" style={{ background:"#FEE2E2", color:"#991B1B", border:"none", padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", borderRadius:3 }} onClick={() => {
                          const ns = form.stages.filter((_, idx) => idx !== i); setForm({...form, stages:ns});
                        }}>削除</button>
                      )}
                    </div>
                    <Fld label={`${stg.name}の内容（質問・課題・形式など）`}>
                      <textarea style={{...S.input, resize:"vertical"}} rows={3} placeholder="例：志望動機、自己PR、逆質問など。30分の面接で...などを記入" value={stg.content} onChange={e => {
                        const ns = [...form.stages]; ns[i] = {...ns[i], content:e.target.value}; setForm({...form, stages:ns});
                      }} />
                    </Fld>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      <Fld label="結果通知までの日数"><input style={S.input} placeholder="例：3日後" value={stg.days} onChange={e => {
                        const ns = [...form.stages]; ns[i] = {...ns[i], days:e.target.value}; setForm({...form, stages:ns});
                      }} /></Fld>
                      <Fld label="結果">
                        <select style={S.input} value={stg.result} onChange={e => {
                          const ns = [...form.stages]; ns[i] = {...ns[i], result:e.target.value}; setForm({...form, stages:ns});
                        }}>
                          <option>通過</option>
                          <option>不通過</option>
                          <option>辞退</option>
                          <option>選考中</option>
                        </select>
                      </Fld>
                    </div>
                  </div>
                ))}
              </div>
              <Fld label="最終結果 *">
                <select style={S.input} value={form.finalResult} onChange={e => setForm({...form, finalResult:e.target.value, stage:e.target.value})}>
                  <option value="">選択してください</option>
                  <option value="内定">内定（入社）</option>
                  <option value="内定辞退">内定辞退</option>
                  <option value="不合格">不合格</option>
                  <option value="辞退">途中辞退</option>
                  <option value="選考中">選考中</option>
                </select>
              </Fld>
              {(form.finalResult === "内定" || form.finalResult === "内定辞退") && (
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
          ) : (
            <Fld label={`本文 *（最低30文字）　現在${form.content.length}文字`}>
              <textarea style={{ ...S.input, resize:"vertical", borderColor: form.content.length > 0 && form.content.length < 30 ? "#DC2626" : C.border }} rows={5} placeholder="面接の様子、聞かれた内容、準備のポイントなどをご記入ください。（最低30文字）" value={form.content} onChange={e => setForm({ ...form, content:e.target.value })} />
              {form.content.length > 0 && form.content.length < 30 && <p style={{ fontSize:11, color:"#DC2626", marginTop:4 }}>あと{30 - form.content.length}文字以上入力してください</p>}
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
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:"1px solid " + C.border, fontSize:12, color:C.sub }}>
            <AC>{ini(uName)}</AC>{uName} として投稿
          </div>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.title.trim()) { alert("タイトルを入力してください"); return; }
            if (isInterview) {
              if (!form.applyMethod) { alert("応募方法を選択してください"); return; }
              if (!form.finalResult) { alert("最終結果を選択してください"); return; }
              if (form.stages.length === 0) { alert("選考段階を1つ以上入力してください"); return; }
              // 補完
              const summary = form.stages.map(s => `【${s.name}】${s.content}`).join("\n\n");
              await onAddPost({ ...form, content: form.content || summary, stage: form.finalResult });
              setForm(null);
              return;
            }
            if (!isES && !form.stage) return;
            if (isES && !form.esQuestion.trim()) { alert("ES設問内容を入力してください"); return; }
            if (!isInterview && form.content.length < 30) { alert("本文は30文字以上入力してください"); return; }
            await onAddPost(form);
            setForm(null);
          }}>
            投稿する
          </button>
        </div>
      )}
      {sorted.length === 0 && <Empty text={"まだ" + label + "がありません。最初の投稿をしてみましょう！"} />}
      {/* 選考掲示板・ES例文は1件目からロック、面接体験談は2件目以降ロック */}
      {sorted.length > 0 && !sess && (ptype === "board" || ptype === "es") && (
        <BoardLockedNotice setAuthMode={setAuthMode} count={sorted.length} type={label} />
      )}
      {sorted.map((p, idx) => {
        const isLocked = !sess && (
          (ptype === "board" || ptype === "es") ? idx >= 0 :
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
              <h3 style={{ fontSize:15, fontWeight:"bold", marginBottom:8, lineHeight:1.55, fontFamily:"serif" }}>{p.title}</h3>
              {p.year && p.ptype === "es" && (
                <div style={{ fontSize:11, color:C.sub, marginBottom:6 }}>応募: {p.year}年 / 結果: {p.stage}</div>
              )}
              {/* 面接体験談の概要バッジ（誰でも見える基本情報） */}
              {p.ptype === "interview" && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                  {p.finalResult && (
                    <span style={{ background: p.finalResult === "内定" ? "#16A34A" : p.finalResult === "内定辞退" ? "#0891B2" : p.finalResult === "不合格" ? "#DC2626" : "#6B7280", color:"#fff", padding:"3px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>
                      最終結果: {p.finalResult}
                    </span>
                  )}
                  {p.stages && p.stages.length > 0 && (
                    <span style={{ background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"3px 10px", fontSize:11, fontWeight:"bold", borderRadius:3 }}>
                      {p.stages.length}段階の選考
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
              {p.ptype === "interview" && p.stages && p.stages.length > 0 && (
                <div style={{ marginBottom:10 }}>
                  {p.stages.map((stg, i) => (
                    <div key={i} style={{ borderLeft:"3px solid " + C.accent, paddingLeft:10, marginBottom:8 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, fontWeight:"bold", color:C.accent }}>{stg.name}</span>
                        {stg.result && <span style={{ fontSize:10, background: stg.result === "通過" ? "#DCFCE7" : "#FEE2E2", color: stg.result === "通過" ? "#166534" : "#991B1B", padding:"1px 6px", borderRadius:2 }}>{stg.result}</span>}
                        {stg.days && <span style={{ fontSize:10, color:C.sub }}>結果通知: {stg.days}</span>}
                      </div>
                      {stg.content && <p style={{ fontSize:12, lineHeight:1.7, color:C.ink, marginBottom:4 }}>{stg.content}</p>}
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
                <button style={{ background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", fontFamily:"inherit", marginLeft:"auto" }} onClick={() => onToggleLike(p.id)}>
                  {(p.likes || []).length > 0 ? ("♥ " + (p.likes || []).length) : "♡ いいね"}
                </button>
                <button style={{ background:"none", border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit", color: favorites && favorites.includes(p.id) ? "#E8A000" : C.sub }} onClick={() => toggleFavorite && toggleFavorite(p.id)}>
                  {favorites && favorites.includes(p.id) ? "★ お気に入り" : "☆ お気に入り"}
                </button>
                <button style={{ background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setExp(exp === p.id ? null : p.id)}>
                  コメント({(p.comments || []).length}){exp === p.id ? " ▴" : " ▾"}
                </button>
              </div>
              {exp === p.id && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid " + C.border }}>
                  {(p.comments || []).map(c => (
                    <div key={c.id} style={{ borderLeft:"3px solid " + C.border, paddingLeft:10, marginBottom:8, paddingBottom:8 }}>
                      {isAdmin && <span style={{ float:"right" }}><SmBtn red onClick={() => adminDelete("comment", p.id + ":" + c.id)}>削除</SmBtn></span>}
                      <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>{c.author} · {c.date}</div>
                      <p style={{ fontSize:13, lineHeight:1.8 }}>{c.content}</p>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"flex-start" }}>
                    <AC>{ini(uName)}</AC>
                    <div style={{ flex:1 }}>
                      <textarea style={{ ...S.input, resize:"vertical", width:"100%" }} rows={2} placeholder="コメントを入力" value={cmt} onChange={e => setCmt(e.target.value)} />
                      <button style={{ ...S.primaryBtn, marginTop:6, fontSize:12, padding:"7px 14px" }} onClick={async () => {
                        if (cmt.trim()) { await onAddComment(p.id, cmt.trim()); setCmt(""); }
                      }}>
                        送信
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </article>
        );
      })}
      {!sess && ptype === "interview" && sorted.length > 1 && <LockedContent setAuthMode={setAuthMode} count={sorted.length - 1} type={label} />}
    </div>
  );
}

// ─── 口コミタブ ───────────────────────────────────────────────────────────────
function ReviewsTab({ revs, avgData: a, co, uName, plan, onAddReview, isAdmin, adminDelete, setEditTgt, go, sess, setAuthMode }) {
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
            <div style={{ fontSize:46, fontWeight:"bold", color:C.accent, lineHeight:1, fontFamily:"serif" }}>{filteredAvg.overall.toFixed(1)}</div>
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
        // 未ログインの場合：最初の1件だけプレビュー、それ以降はぼかして登録誘導
        const isLocked = !sess && idx >= 1;
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
          </div>
        </div>
      );
      })}
      {/* 未ログイン時の登録誘導オーバーレイ */}
      {!sess && filteredRevs.length > 1 && <LockedContent setAuthMode={setAuthMode} count={filteredRevs.length - 1} type="口コミ" />}
    </div>
  );
}

// ─── 年収タブ ─────────────────────────────────────────────────────────────────
function SalaryTab({ sals, avgSalary, co, uName, plan, onAddSalary, isAdmin, adminDelete, setEditTgt, go, sess, setAuthMode }) {
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
            <div style={{ fontSize:36, fontWeight:"bold", color:"#1a5276", lineHeight:1, fontFamily:"serif" }}>{avgSalary}<span style={{ fontSize:13, fontWeight:"normal" }}>万円</span></div>
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
              <select style={S.input} value={form.jobType} onChange={e => setForm({ ...form, jobType:e.target.value })}>
                <option value="">選択してください</option>
                {getJobCategories(co.group || co.industry).filter(j => j !== "全職種").map(t => <option key={t}>{t}</option>)}
              </select>
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
        const isLocked = !sess && idx >= 1;
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
              <div style={{ fontSize:22, fontWeight:"bold", color:"#1a5276", fontFamily:"serif", marginBottom:4 }}>{s.annualSalary}<span style={{ fontSize:13, fontWeight:"normal", color:C.sub }}>万円/年</span></div>
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
          </div>
        </div>
        );
      })}
      {!sess && sals.length > 1 && <LockedContent setAuthMode={setAuthMode} count={sals.length - 1} type="年収情報" />}
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
                <h3 style={{ fontSize:15, fontWeight:"bold", marginBottom:6, fontFamily:"serif" }}>{j.title}</h3>
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
              <td style={S.td}><span style={{ fontSize:15, fontWeight:"bold", color: i < 3 ? C.accent : "#bbb", fontFamily:"serif" }}>{i + 1}</span></td>
              <td style={S.td}><span style={{ fontSize:16, marginRight:8 }}>{co.emoji}</span><span style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</span></td>
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
              <span style={{ background:"rgba(255,255,255,0.2)", fontWeight:"bold", fontFamily:"serif", fontSize:20, minWidth:34, textAlign:"center", padding:"3px 0", display:"block" }}>{pad(n)}</span>
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
                  ? <div style={{ fontSize:24, fontWeight:"bold", fontFamily:"serif", marginBottom:4 }}>無料</div>
                  : (
                    <div style={{ marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                        <span style={{ fontSize:24, fontWeight:"bold", fontFamily:"serif", color:C.accent }}>{"¥" + disp.toLocaleString()}</span>
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
function MyPage({ sess, go, companies, plan, upgradePlan, isMobile, diary, saveDiary, myPosts, myRevs, favPosts, favorites }) {
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
            {[["activity","投稿履歴"],["favorites","お気に入り"],["diary","就活日記"]].map(([k,l]) => (
              <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: mTab===k ? C.accent : C.sub, borderBottom:"3px solid " + (mTab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: mTab===k ? "bold" : "500" }} onClick={() => setMTab(k)}>{l}</button>
            ))}
          </div>
          {mTab === "diary" && <DiarySection entries={diary} onSave={saveDiary} />}
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
        </div>
      </div>
    </div>
  );
}

// ─── 就活日記 ─────────────────────────────────────────────────────────────────
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
            <span style={{ fontWeight:"bold", fontSize:14, fontFamily:"serif", flex:1 }}>{e.title}</span>
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
            <div style={{ fontSize:22, fontWeight:"bold", color:C.accent, fontFamily:"serif" }}>{v}</div>
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
              <span style={{ fontSize:13, flex:1 }}>{co.emoji} {co.name}</span>
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
        <span style={{ fontSize:11, color:C.sub }}>{co && co.emoji} {co && co.name}</span>
        <StageBadge s={post.stage} />
        <span style={{ fontSize:10, color:C.sub, marginLeft:"auto" }}>{ago(post.createdAt)}</span>
      </div>
      <h3 style={{ fontSize:14, fontWeight:"bold", marginBottom:6, lineHeight:1.5, fontFamily:"serif" }}>{post.title}</h3>
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
      <h1 style={{ fontSize:"clamp(18px,3vw,26px)", fontWeight:"bold", fontFamily:"serif" }}>{title}</h1>
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
      <h2 style={{ fontSize:18, fontWeight:"bold", fontFamily:"serif", marginBottom:10 }}>アクセス権限がありません</h2>
      <p style={{ fontSize:13, color:C.sub, marginBottom:20, lineHeight:1.8 }}>このページは管理者のみが閲覧できます。</p>
      <button style={S.primaryBtn} onClick={() => go("home")}>トップに戻る</button>
    </div>
  );
}
function BoardLockedNotice({ setAuthMode, count, type }) {
  return (
    <div style={{
      background:"#fff",
      border:"2px solid " + C.accent,
      borderRadius:8,
      padding:"24px 28px",
      marginBottom:16,
      boxShadow:"0 4px 16px rgba(30,90,150,0.12)"
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14, flexWrap:"wrap" }}>
        <div style={{ fontSize:32 }}>🔒</div>
        <div style={{ flex:1, minWidth:200 }}>
          <h3 style={{ fontSize:15, fontWeight:"bold", color:C.ink, marginBottom:4 }}>
            {type}を見るには無料会員登録が必要です
          </h3>
          <p style={{ fontSize:12, color:C.sub, lineHeight:1.7 }}>
            登録済みの<strong style={{ color:C.accent }}>{count}件</strong>の投稿が閲覧できます。メールアドレスだけで30秒で完了します。
          </p>
        </div>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
        {["✓ 選考フロー","✓ 内定情報","✓ 面接の質問","✓ 通過率"].map(t => (
          <span key={t} style={{ background:C.light, color:C.accent, padding:"4px 10px", fontSize:11, borderRadius:14, fontWeight:"bold" }}>{t}</span>
        ))}
      </div>
      <button style={{
        background:C.accent, color:"#fff", border:"none",
        padding:"12px 28px", fontSize:14, fontWeight:"bold",
        fontFamily:"inherit", cursor:"pointer", borderRadius:6,
        width:"100%",
        boxShadow:"0 2px 8px rgba(30,90,150,0.3)"
      }} onClick={() => setAuthMode("register")}>
        閲覧する（無料会員登録）→
      </button>
      <div style={{ fontSize:11, color:C.sub, marginTop:8, textAlign:"center" }}>
        すでに会員の方は <button style={{...S.textLink, fontSize:11}} onClick={() => setAuthMode("login")}>ログイン</button>
      </div>
    </div>
  );
}

function LockedContent({ setAuthMode, count, type }) {
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
        borderRadius:8,
        padding:"24px 24px",
        maxWidth:480,
        margin:"0 auto",
        boxShadow:"0 8px 28px rgba(30,90,150,0.18)"
      }}>
        <div style={{ fontSize:32, marginBottom:8 }}>🔒</div>
        <h3 style={{ fontSize:16, fontWeight:"bold", marginBottom:8, color:C.ink }}>
          続きを読むには無料会員登録
        </h3>
        <p style={{ fontSize:13, color:C.sub, marginBottom:18, lineHeight:1.7 }}>
          残り <strong style={{ color:C.accent, fontSize:15 }}>{count}件</strong> の{type}が閲覧できます<br />
          メールアドレスだけで30秒で完了
        </p>
        <button style={{
          background:C.accent, color:"#fff", border:"none",
          padding:"12px 36px", fontSize:14, fontWeight:"bold",
          fontFamily:"inherit", cursor:"pointer", borderRadius:6,
          boxShadow:"0 2px 8px rgba(30,90,150,0.3)"
        }} onClick={() => setAuthMode("register")}>
          閲覧する（無料会員登録）→
        </button>
        <div style={{ fontSize:11, color:C.sub, marginTop:10 }}>
          すでに会員の方は <button style={{...S.textLink, fontSize:11}} onClick={() => setAuthMode("login")}>ログイン</button>
        </div>
      </div>
    </div>
  );
}

function SmBtn({ onClick, red, children }) {
  return (
    <button style={{ background:"none", border:"1px solid " + (red ? "#FAA" : C.border), padding:"3px 8px", fontSize:11, cursor:"pointer", fontFamily:"inherit", color: red ? "#C00" : C.sub, marginLeft:4 }} onClick={onClick}>{children}</button>
  );
}
function AC({ children }) {
  return (
    <span style={{ background:C.accent, color:"#fff", width:22, height:22, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:"bold", flexShrink:0 }}>{children}</span>
  );
}

// ─── スタイル ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  button { cursor: pointer; transition: opacity .15s; }
  button:hover { opacity: .75; }
  textarea, input, select { font-family: 'Noto Sans JP', sans-serif; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .fadeUp { animation: fadeUp .18s ease; }
  tr:hover td { background: #FAFAF8; }
  a { color: inherit; }
`;

const S = {
  root:        { fontFamily:"'Noto Sans JP',sans-serif", background:C.bg, minHeight:"100vh", color:C.ink, fontSize:14 },
  pageWrap:    { background:C.bg },
  nav:         { background:"#fff", position:"sticky", top:0, zIndex:200, borderBottom:"1px solid " + C.border, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  logoBtn:     { background:"none", border:"none", textAlign:"left", cursor:"pointer" },
  logoText:    { display:"block", fontWeight:"bold", color:"#1E5A96", fontFamily:"'Noto Serif JP',serif", letterSpacing:"0.06em" },
  toast:       { position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:C.ink, color:"#fff", padding:"9px 20px", fontSize:12, zIndex:600, boxShadow:"0 2px 10px rgba(0,0,0,0.25)", whiteSpace:"nowrap" },
  overlay:     { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  modal:       { background:"#fff", padding:"24px 22px", width:"100%", maxWidth:420, maxHeight:"94vh", overflowY:"auto", borderTop:"4px solid " + C.accent },
  modalTitle:  { fontSize:17, fontWeight:"bold", fontFamily:"serif", marginBottom:12 },
  modalHr:     { height:1, background:C.border, marginBottom:14 },
  errBox:      { background:"#FFF5F5", border:"1px solid #F5AAAA", color:"#8B0000", padding:"8px 12px", fontSize:12, marginBottom:12 },
  main:        { maxWidth:1160, margin:"0 auto" },
  hero:        { borderBottom:"1px solid " + C.border, paddingBottom:24, marginBottom:24, marginTop:20, display:"flex", gap:24, alignItems:"flex-start" },
  th:          { fontSize:11, fontWeight:"bold", color:C.sub, padding:"6px 10px", borderBottom:"2px solid " + C.ink, textAlign:"left", letterSpacing:"0.04em", whiteSpace:"nowrap" },
  tableRow:    { borderBottom:"1px solid " + C.border },
  td:          { padding:"8px 10px", fontSize:13, verticalAlign:"middle" },
  cardItem:    { background:C.surface, padding:"12px 0", borderBottom:"1px solid " + C.border },
  input:       { width:"100%", padding:"8px 10px", border:"1px solid " + C.border, fontSize:13, background:"#fff", color:C.ink, outline:"none", fontFamily:"inherit" },
  primaryBtn:  { background:C.accent, color:"#fff", border:"none", padding:"8px 18px", fontSize:13, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer" },
  secondaryBtn:{ background:"none", border:"1px solid " + C.border, color:C.ink, padding:"8px 18px", fontSize:13, fontFamily:"inherit", cursor:"pointer" },
  textLink:    { background:"none", border:"none", color:C.accent, fontWeight:"bold", fontFamily:"inherit", fontSize:12, cursor:"pointer", textDecoration:"underline" },
  chip:        { border:"1px solid " + C.border, background:"#F7F7F7", color:C.sub, padding:"5px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
  chipOn:      { background:C.ink, color:"#fff", borderColor:C.ink },
  footer:      { borderTop:"2px solid " + C.ink, padding:"16px 20px", background:C.surface, marginTop:20 },
};
