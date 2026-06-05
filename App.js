import React, { useState, useEffect, useRef } from "react";
import {
  SafeAreaView, ScrollView, View, Text, Pressable, TextInput, Modal,
  ActivityIndicator, StyleSheet, StatusBar, Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WORDS } from "./words";

const C = { navy:"#1F3864", blue:"#2E5C9E", bg:"#f4f6fb", card:"#fff", green:"#1E6B2F",
  greenbg:"#E2EFDA", red:"#9C2A2A", redbg:"#FCE4E4", gray:"#6B7280", line:"#d8e0ee" };
const STAGE_SIZE = 14;
const STAGES = [];
for (let i = 0; i < WORDS.length; i += STAGE_SIZE) STAGES.push(WORDS.slice(i, i + STAGE_SIZE));

const shuffle = (a) => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const norm = (s) => (s||"").toString().trim().toLowerCase();
const cloze = (s,w) => s.replace(new RegExp("\\b"+w+"\\b","i"),"______");
const MODE_LABEL = { flash:"Flashcard", mean:"Meaning", word:"Find the word", recall:"Recall", context:"In context" };
const COACH_SYS = "You are Coach, a patient SAT vocabulary tutor for one student. Help with the exact word provided (its meaning, usage, why an answer choice was wrong, or more example sentences). Keep replies short, friendly, and plain (no markdown headers). If asked something off-topic, gently steer back to studying.";
const GEMINI_MODEL = "gemini-2.0-flash";

export default function App() {
  const [prog, setProg] = useState({});         // word -> {s, c}
  const [workerUrl, setWorkerUrl] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ name:"home" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const progRef = useRef({});

  useEffect(() => { (async () => {
    try { const p = await AsyncStorage.getItem("satvocab"); if (p){ progRef.current=JSON.parse(p); setProg(progRef.current);} } catch {}
    try { const u = await AsyncStorage.getItem("coach_url"); if (u) setWorkerUrl(u); } catch {}
    try { const g = await AsyncStorage.getItem("gemini_key"); if (g) setGeminiKey(g); } catch {}
    setReady(true);
  })(); }, []);

  const saveProg = (np) => { progRef.current = np; setProg(np); AsyncStorage.setItem("satvocab", JSON.stringify(np)).catch(()=>{}); };
  const mastery = (w) => { const k = progRef.current[w]; return (!k||!k.s)?0:Math.round(k.c/k.s*100); };
  const stageMastery = (arr) => Math.round(arr.reduce((a,x)=>a+mastery(x[0]),0)/arr.length);

  const recordAttempt = (word, ok) => {
    const np = { ...progRef.current };
    const k = np[word[0]] || { s:0, c:0 }; k.s++; if (ok) k.c++; np[word[0]] = k; saveProg(np);
    if (workerUrl) {  // cloud sync (best-effort)
      fetch(workerUrl.replace(/\/+$/,"")+"/log", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ user:"david", subtopic:"Vocabulary", qid:word[0], correct:ok }) }).catch(()=>{});
    }
  };

  if (!ready) return <View style={[s.fill,{justifyContent:"center"}]}><ActivityIndicator size="large" color={C.blue} /></View>;

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <Text style={s.h1}>David's SAT Vocabulary</Text>
        <Text style={s.sub}>The most-used SAT words, in stages — five ways to practice each.</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding:14, paddingBottom:60 }}>
        {view.name === "home" && <Home {...{ STAGES, stageMastery, setView, coachReady:!!(workerUrl||geminiKey), setSettingsOpen, progRef }} />}
        {view.name === "menu" && <Menu {...{ stage:view.stage, stageMastery, setView }} />}
        {view.name === "quiz" && <Quiz {...{ view, setView, recordAttempt, mastery, workerUrl, geminiKey }} />}
        {view.name === "summary" && <Summary {...{ view, setView }} />}
      </ScrollView>
      <SettingsModal {...{ settingsOpen, setSettingsOpen, workerUrl, setWorkerUrl, geminiKey, setGeminiKey }} />
    </SafeAreaView>
  );
}

function Btn({ title, onPress, sec, style }) {
  return <Pressable onPress={onPress} style={[s.btn, sec && s.btnSec, style]}>
    <Text style={[s.btnT, sec && { color:C.navy }]}>{title}</Text></Pressable>;
}

function Home({ STAGES, stageMastery, setView, coachReady, setSettingsOpen, progRef }) {
  const weak = WORDS.filter(x => { const k = progRef.current[x[0]]; return k && k.s>0 && k.c/k.s < 0.7; });
  return (<>
    <View style={s.card}>
      <Text style={s.cardTitle}>Pick a stage</Text>
      <Text style={s.sub}>{WORDS.length} words · {STAGES.length} stages of {STAGE_SIZE}</Text>
      {STAGES.map((arr,i) => { const m = stageMastery(arr); return (
        <Pressable key={i} style={s.stage} onPress={() => setView({ name:"menu", stage:i })}>
          <View style={{ flex:1 }}>
            <Text style={s.stageT}>Stage {i+1}</Text>
            <Text style={s.stageM}>words {i*STAGE_SIZE+1}–{i*STAGE_SIZE+arr.length}</Text>
            <View style={s.mbar}><View style={[s.mbarFill,{ width:`${m}%` }]} /></View>
          </View>
          <Text style={s.stageM}>{m}% ›</Text>
        </Pressable>); })}
      <Btn sec title="🔁 Review my missed words" style={{ marginTop:10 }}
        onPress={() => weak.length ? setView({ name:"quiz", words:shuffle(weak), mode:"mix", i:0, correct:0, missed:[] })
                                   : setView({ name:"summary", empty:true })} />
    </View>
    <View style={[s.card,{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" }]}>
      <View style={{ flex:1, paddingRight:10 }}>
        <Text style={{ fontWeight:"800", color:C.navy }}>🤖 Coach chatbot</Text>
        <Text style={s.sub}>{coachReady ? "Connected — tap “Ask the coach” on any word." : "Not connected — tap Set up and paste your Gemini key."}</Text>
      </View>
      <Btn sec title={coachReady ? "Edit" : "Set up"} onPress={() => setSettingsOpen(true)} />
    </View>
  </>);
}

function Menu({ stage, stageMastery, setView }) {
  const arr = STAGES[stage];
  const go = (mode) => setView({ name:"quiz", words:shuffle(arr), mode, i:0, correct:0, missed:[] });
  const modes = [["flash","🃏 Flashcards","see word → flip"],["mean","📖 Meaning","word → definition"],
    ["word","🔤 Find the word","definition → word"],["recall","⌨️ Recall","type the word"],["context","📝 In context","fill the blank"]];
  return (<View style={s.card}>
    <Text style={s.pill}>Stage {stage+1}</Text>
    <Text style={s.cardTitle}>Choose how to practice</Text>
    <Text style={s.sub}>{arr.length} words · {stageMastery(arr)}% mastered</Text>
    <View style={{ flexDirection:"row", flexWrap:"wrap", justifyContent:"space-between", marginTop:8 }}>
      {modes.map(([k,t,d]) => (
        <Pressable key={k} style={s.mode} onPress={() => go(k)}>
          <Text style={s.modeT}>{t}</Text><Text style={s.modeD}>{d}</Text></Pressable>))}
    </View>
    <Btn title="🎯 Mixed review (all modes)" style={{ marginTop:10 }} onPress={() => go("mix")} />
    <Btn sec title="⌂ Back" style={{ marginTop:10 }} onPress={() => setView({ name:"home" })} />
  </View>);
}

function Quiz({ view, setView, recordAttempt, workerUrl, geminiKey }) {
  const { words, mode, i, correct, missed } = view;
  const word = words[i];
  const [answered, setAnswered] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [flip, setFlip] = useState(false);
  const [typed, setTyped] = useState("");
  const [curMode, setCurMode] = useState(mode === "mix" ? pick() : mode);
  const [chat, setChat] = useState(false);

  function pick(){ return shuffle(["flash","mean","word","recall","context"])[0]; }
  useEffect(() => { setAnswered(false); setChosen(null); setFlip(false); setTyped(""); setCurMode(mode==="mix"?pick():mode); }, [i]);

  const opts = (kind) => { // kind 0 -> words, 2 -> defs
    const others = shuffle(WORDS.filter(x => x[0]!==word[0])).slice(0,3);
    return shuffle([word, ...others]).map(x => kind===0 ? x[0] : x[2]);
  };
  const [optList] = useState(() => null); // placeholder
  const optionsRef = useRef(null);
  if (!optionsRef.current || optionsRef.current.for !== i) {
    optionsRef.current = { for:i, mean:opts(2), word:opts(0), context:opts(0) };
  }

  const finish = (ok) => {
    recordAttempt(word, ok);
    view._ok = ok;
    if (!ok) missed.push(word);
    view.correct = correct + (ok?1:0);
    setAnswered(true);
  };
  const next = () => {
    if (i+1 >= words.length) setView({ name:"summary", correct:view.correct, total:words.length, missed, mode });
    else setView({ ...view, i:i+1 });
  };

  const pct = Math.round(i/words.length*100);
  return (<View style={s.card}>
    <Text style={s.prog}>{i+1} / {words.length}   ·   Score {view.correct ?? correct}</Text>
    <View style={s.bar}><View style={[s.barFill,{ width:`${pct}%` }]} /></View>
    <Text style={s.pill}>{MODE_LABEL[curMode]}</Text>

    {curMode==="flash" && (!flip
      ? <Pressable style={s.flip} onPress={() => setFlip(true)}>
          <Text style={s.word}>{word[0]} <Text style={s.pos}>{word[1]}</Text></Text>
          <Text style={[s.sub,{ marginTop:10 }]}>tap to flip</Text></Pressable>
      : <View>
          <Text style={s.def}>{word[2]}</Text>
          <Text style={s.sent}>{cloze(word[3],word[0]).replace("______", word[0])}</Text>
          <Btn sec title="🤖 Ask the coach" style={{ marginTop:12 }} onPress={() => setChat(true)} />
          <View style={{ flexDirection:"row", gap:10, marginTop:10 }}>
            <Btn sec title="Review again" style={{ flex:1 }} onPress={() => { recordAttempt(word,false); missed.push(word); next(); }} />
            <Btn title="I knew it ✓" style={{ flex:1 }} onPress={() => { recordAttempt(word,true); view.correct=(view.correct??correct)+1; next(); }} />
          </View></View>)}

    {(curMode==="mean"||curMode==="word"||curMode==="context") && (() => {
      const isMean = curMode==="mean";
      const correctText = isMean ? word[2] : word[0];
      const list = optionsRef.current[curMode];
      return (<View>
        <Text style={s.q}>{isMean ? `What does “${word[0]}” (${word[1]}) mean?`
          : curMode==="word" ? `Which word means:  ${word[2]}`
          : "Which choice completes the text with the most logical and precise word?"}</Text>
        {curMode==="context" && <Text style={[s.sent,{ fontStyle:"normal", marginBottom:8 }]}>{cloze(word[3],word[0])}</Text>}
        {list.map((o,idx) => {
          let st = [s.choice];
          if (answered) { if (norm(o)===norm(correctText)) st.push(s.cCorrect); else if (o===chosen) st.push(s.cWrong); }
          return <Pressable key={idx} disabled={answered} style={st}
            onPress={() => { setChosen(o); finish(norm(o)===norm(correctText)); }}>
            <Text style={s.choiceT}>{o}</Text></Pressable>;
        })}
      </View>); })()}

    {curMode==="recall" && (<View>
      <Text style={s.q}>Type the word that means:</Text>
      <Text style={s.def}>{word[2]} <Text style={s.pos}>({word[1]})</Text></Text>
      <TextInput style={s.fill} value={typed} onChangeText={setTyped} editable={!answered}
        autoCapitalize="none" autoCorrect={false} placeholder="the word" onSubmitEditing={() => !answered && finish(norm(typed)===norm(word[0]))} />
      {!answered && <Btn title="Check" style={{ marginTop:10 }} onPress={() => finish(norm(typed)===norm(word[0]))} />}
    </View>)}

    {answered && curMode!=="flash" && (<View>
      <View style={[s.fb, view._ok ? s.fbOk : s.fbNo]}>
        <Text style={{ color: view._ok?C.green:C.red, fontWeight:"700" }}>
          {view._ok ? "✓ Correct" : `✗ Not quite — ${word[0]}: ${word[2]}`}</Text></View>
      <Text style={[s.sent,{ marginTop:8 }]}>{cloze(word[3],word[0]).replace("______", word[0])}</Text>
      <Btn sec title="🤖 Ask the coach about this" style={{ marginTop:10 }} onPress={() => setChat(true)} />
      <Btn title={i+1>=words.length ? "See results" : "Next"} style={{ marginTop:10 }} onPress={next} />
    </View>)}

    <Pressable onPress={() => setView({ name:"home" })} style={{ marginTop:14, alignItems:"center" }}>
      <Text style={s.link}>⌂ Menu</Text></Pressable>

    <ChatModal visible={chat} onClose={() => setChat(false)} word={word} workerUrl={workerUrl} geminiKey={geminiKey} />
  </View>);
}

function ChatModal({ visible, onClose, word, workerUrl, geminiKey }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = !!(workerUrl || geminiKey);
  useEffect(() => { if (visible) setMsgs([{ role:"assistant", text: connected
    ? `Ask me anything about “${word[0]}” — what it means, why a choice was wrong, or for more example sentences.`
    : `Coach isn't connected yet. On the home screen tap “Set up” and paste your Gemini key. Meanwhile: ${word[0]} — ${word[2]}.` }]); }, [visible]);

  const send = async () => {
    const t = text.trim(); if (!t) return;
    const hist = msgs.filter(m => m.text !== "…").map(m => ({ role:m.role, text:m.text }));
    setMsgs(m => [...m, { role:"user", text:t }]); setText("");
    if (!connected) { setMsgs(m => [...m, { role:"assistant", text:"Set up the coach first: home → Set up → paste your Gemini key." }]); return; }
    setBusy(true);
    try {
      let reply;
      if (workerUrl) {
        const r = await fetch(workerUrl.replace(/\/+$/,"")+"/tutor", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ question:{ subtopic:"Vocabulary (words in context)",
            text:`The student is studying the SAT word "${word[0]}" (${word[1]}), meaning: ${word[2]}. Example: ${word[3]}`,
            correct:word[0], explanation:word[2] }, history:hist, message:t }) });
        const d = await r.json(); reply = d.reply || "(no reply)";
      } else {
        const ctx = `${COACH_SYS}\n\nThe student is studying the SAT word "${word[0]}" (${word[1]}), meaning: ${word[2]}. Example sentence: ${word[3]}`;
        const contents = [{ role:"user", parts:[{ text:ctx }] }, { role:"model", parts:[{ text:"Ready to help with this word." }] }];
        hist.forEach(m => contents.push({ role: m.role === "assistant" ? "model" : "user", parts:[{ text:m.text }] }));
        contents.push({ role:"user", parts:[{ text:t }] });
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`,
          { method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ contents, generationConfig:{ temperature:0.4, maxOutputTokens:500 } }) });
        const d = await r.json();
        reply = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map(p => p.text).join("")
          || (d.error && d.error.message ? "Gemini error: " + d.error.message : "(no reply)");
      }
      setMsgs(m => [...m, { role:"assistant", text:reply }]);
    } catch { setMsgs(m => [...m, { role:"assistant", text:"Could not reach the coach. Check your key / internet." }]); }
    setBusy(false);
  };

  return (<Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={s.modalWrap}>
      <View style={s.modalCard}>
        <View style={s.modalHead}>
          <Text style={{ fontWeight:"800", color:C.navy }}>🤖 Coach — “{word[0]}”</Text>
          <Pressable onPress={onClose}><Text style={{ fontSize:22, color:C.gray }}>×</Text></Pressable></View>
        <ScrollView style={{ maxHeight:360, padding:12 }}>
          {msgs.map((m,i) => (
            <View key={i} style={{ alignItems: m.role==="user"?"flex-end":"flex-start", marginVertical:5 }}>
              <Text style={[s.bubble, m.role==="user"?s.bubbleMe:s.bubbleAI]}>{m.text}</Text></View>))}
          {busy && <ActivityIndicator color={C.blue} style={{ marginTop:6 }} />}
        </ScrollView>
        <View style={{ flexDirection:"row", gap:8, padding:10, borderTopWidth:1, borderTopColor:C.line }}>
          <TextInput style={[s.fill,{ flex:1 }]} value={text} onChangeText={setText} placeholder="Ask about this word…"
            autoCapitalize="none" onSubmitEditing={send} />
          <Btn title="Send" onPress={send} /></View>
      </View></View>
  </Modal>);
}

function Summary({ view, setView }) {
  if (view.empty) return (<View style={[s.card,{ alignItems:"center" }]}>
    <Text style={{ fontSize:40 }}>🎉</Text>
    <Text style={{ textAlign:"center" }}>No weak words yet — practice a stage and the ones you miss will collect here.</Text>
    <Btn title="Back" style={{ marginTop:12 }} onPress={() => setView({ name:"home" })} /></View>);
  const { correct, total, missed, mode } = view;
  const pct = Math.round(correct/Math.max(total,1)*100);
  return (<>
    <View style={[s.card,{ alignItems:"center" }]}>
      <Text style={s.big}>{correct}/{total}</Text>
      <Text style={s.sub}>{pct}% {pct>=85?"— mastered! 🎉":pct>=60?"— almost; review the misses":"— keep going"}</Text>
      <View style={{ flexDirection:"row", gap:10, marginTop:14 }}>
        {missed.length>0 && <Btn title={`Retry ${missed.length}`} onPress={() => setView({ name:"quiz", words:shuffle(missed), mode, i:0, correct:0, missed:[] })} />}
        <Btn sec title="Stages" onPress={() => setView({ name:"home" })} />
      </View>
    </View>
    {missed.length>0 && <View style={s.card}>
      <Text style={{ fontWeight:"800", color:C.red, marginBottom:6 }}>Words to review</Text>
      {missed.map((w,i) => (<Text key={i} style={{ paddingVertical:6, borderTopWidth:1, borderTopColor:C.line }}>
        <Text style={{ fontWeight:"800", color:C.navy }}>{w[0]}</Text> <Text style={s.pos}>{w[1]}</Text> — {w[2]}</Text>))}
    </View>}
  </>);
}

function SettingsModal({ settingsOpen, setSettingsOpen, workerUrl, setWorkerUrl, geminiKey, setGeminiKey }) {
  const [keyVal, setKeyVal] = useState(geminiKey);
  const [urlVal, setUrlVal] = useState(workerUrl);
  useEffect(() => { setKeyVal(geminiKey); setUrlVal(workerUrl); }, [settingsOpen]);
  const save = async () => {
    const k = keyVal.trim(), u = urlVal.trim();
    setGeminiKey(k); setWorkerUrl(u);
    try { await AsyncStorage.setItem("gemini_key", k); await AsyncStorage.setItem("coach_url", u); } catch {}
    setSettingsOpen(false);
  };
  return (<Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
    <ScrollView contentContainerStyle={[s.modalWrap,{ justifyContent:"center", padding:20 }]}>
      <View style={[s.modalCard,{ borderRadius:16, padding:16 }]}>
        <Text style={{ fontWeight:"800", color:C.navy, fontSize:16 }}>Set up the Coach</Text>
        <Text style={[s.sub,{ marginVertical:8 }]}>Paste your Gemini API key. It saves on this device — you only enter it once. (Get one free at aistudio.google.com → "Get API key".)</Text>
        <TextInput style={s.fill} value={keyVal} onChangeText={setKeyVal} autoCapitalize="none" autoCorrect={false}
          placeholder="Gemini API key (AIza…)" />
        <Text style={[s.sub,{ marginTop:14, marginBottom:6 }]}>Advanced (optional): use a Cloudflare Worker instead of the key — paste its URL. Leave blank to use the key above.</Text>
        <TextInput style={s.fill} value={urlVal} onChangeText={setUrlVal} autoCapitalize="none" autoCorrect={false}
          placeholder="https://sat-coach.YOURNAME.workers.dev" />
        <View style={{ flexDirection:"row", gap:10, marginTop:14 }}>
          <Btn sec title="Cancel" style={{ flex:1 }} onPress={() => setSettingsOpen(false)} />
          <Btn title="Save" style={{ flex:1 }} onPress={save} /></View>
      </View></ScrollView>
  </Modal>);
}

const s = StyleSheet.create({
  fill:{ flex:1, backgroundColor:C.bg },
  header:{ paddingHorizontal:14, paddingTop: Platform.OS==="android"?12:4, paddingBottom:8, borderBottomWidth:3, borderBottomColor:C.navy, backgroundColor:C.bg },
  h1:{ fontSize:21, fontWeight:"800", color:C.navy },
  sub:{ fontSize:13, color:C.gray, marginTop:3 },
  card:{ backgroundColor:C.card, borderWidth:1, borderColor:C.line, borderRadius:14, padding:16, marginBottom:12 },
  cardTitle:{ fontSize:16, fontWeight:"800", color:C.navy },
  stage:{ flexDirection:"row", alignItems:"center", borderWidth:1.5, borderColor:C.line, borderRadius:12, padding:13, marginTop:8 },
  stageT:{ fontWeight:"800", color:C.navy, fontSize:16 }, stageM:{ fontSize:12.5, color:C.gray },
  mbar:{ height:6, backgroundColor:"#e3e9f4", borderRadius:6, overflow:"hidden", marginTop:6, width:130 },
  mbarFill:{ height:"100%", backgroundColor:C.green },
  pill:{ alignSelf:"flex-start", backgroundColor:"#eaf1fb", color:C.blue, borderRadius:999, paddingVertical:2, paddingHorizontal:11, fontSize:12, fontWeight:"700", overflow:"hidden", marginBottom:8 },
  word:{ fontSize:30, fontWeight:"800", color:C.navy, textAlign:"center" },
  pos:{ fontSize:14, color:C.gray, fontStyle:"italic" },
  def:{ fontSize:19, marginVertical:12 },
  sent:{ fontSize:15, color:"#39507a", fontStyle:"italic", backgroundColor:"#f6f9ff", borderLeftWidth:4, borderLeftColor:C.blue, borderRadius:8, padding:10 },
  q:{ fontSize:16.5, marginBottom:8, color:"#152038" },
  choice:{ borderWidth:1.5, borderColor:C.line, borderRadius:11, padding:13, marginVertical:6, backgroundColor:"#fff" },
  choiceT:{ fontSize:16, color:"#152038" },
  cCorrect:{ backgroundColor:C.greenbg, borderColor:C.green }, cWrong:{ backgroundColor:C.redbg, borderColor:C.red },
  fill:{ borderWidth:1.5, borderColor:C.line, borderRadius:11, paddingHorizontal:14, paddingVertical:12, fontSize:16, backgroundColor:"#fff" },
  btn:{ backgroundColor:C.navy, borderRadius:11, paddingVertical:13, paddingHorizontal:18, alignItems:"center" },
  btnSec:{ backgroundColor:"#fff", borderWidth:1.5, borderColor:C.navy },
  btnT:{ color:"#fff", fontWeight:"700", fontSize:15 },
  prog:{ fontSize:13, color:C.gray, fontWeight:"700" },
  bar:{ height:7, backgroundColor:"#e3e9f4", borderRadius:6, overflow:"hidden", marginVertical:8 },
  barFill:{ height:"100%", backgroundColor:C.blue },
  flip:{ minHeight:150, justifyContent:"center", alignItems:"center" },
  fb:{ borderRadius:10, padding:11, marginTop:12 }, fbOk:{ backgroundColor:C.greenbg }, fbNo:{ backgroundColor:C.redbg },
  link:{ color:C.blue, fontWeight:"700" },
  mode:{ width:"48.5%", borderWidth:1.5, borderColor:C.line, borderRadius:12, padding:13, marginBottom:9, alignItems:"center" },
  modeT:{ fontWeight:"700", color:C.navy, fontSize:14, textAlign:"center" }, modeD:{ color:C.gray, fontSize:11.5, marginTop:3, textAlign:"center" },
  big:{ fontSize:42, fontWeight:"800", color:C.navy },
  modalWrap:{ flex:1, backgroundColor:"rgba(20,30,55,.45)", justifyContent:"flex-end" },
  modalCard:{ backgroundColor:"#fff", borderTopLeftRadius:18, borderTopRightRadius:18, width:"100%" },
  modalHead:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:14, borderBottomWidth:1, borderBottomColor:C.line },
  bubble:{ maxWidth:"86%", paddingVertical:9, paddingHorizontal:12, borderRadius:12, fontSize:14.5, overflow:"hidden" },
  bubbleMe:{ backgroundColor:C.navy, color:"#fff" }, bubbleAI:{ backgroundColor:"#eef3fb", color:"#1a2740" },
});
