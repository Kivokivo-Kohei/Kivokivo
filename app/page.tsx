"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";

type Participant = {
  id: string;
  name: string;
  occupation: string;
  industry?: string;
  sns?: string;
  uid: string;
};

type Message = {
  id: string;
  text: string;
  senderUid: string;
  receiverUid: string;
};

const stickyColors = [
  "#FFF1A8",
  "#FFD5E1",
  "#CFEFFF",
  "#DDF3C8",
  "#FFE6BA",
  "#E5D9FF",
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  // フォーム
  const [name, setName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [industry, setIndustry] = useState("");
  const [sns, setSns] = useState("");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedParticipant, setSelectedParticipant] =
    useState<Participant | null>(null);

  // DM
  const [dmParticipant, setDmParticipant] =
    useState<Participant | null>(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  const [submitting, setSubmitting] = useState(false);

  // ========================================
  // Firebase 匿名ログイン
  // ========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          return;
        }

        try {
          const result = await signInAnonymously(auth);
          setUser(result.user);
        } catch (error) {
          console.error("匿名ログインエラー:", error);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // ========================================
  // 参加者をリアルタイム取得
  // ========================================

  useEffect(() => {
    const q = query(
      collection(db, "participants"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Participant[] = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            name: data.name || "",
            occupation: data.occupation || "",
            industry: data.industry || "",
            sns: data.sns || "",
            uid: data.uid || "",
          };
        });

        setParticipants(list);
      },
      (error) => {
        console.error("参加者取得エラー:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // ========================================
  // プロフィール登録
  // ========================================

  const handleSubmit = async () => {
    if (!user) {
      alert("接続中です。少し待ってからもう一度お試しください。");
      return;
    }

    if (!name.trim()) {
      alert("お名前を入力してください。");
      return;
    }

    if (!occupation.trim()) {
      alert("職業を入力してください。");
      return;
    }

    if (!industry.trim()) {
      alert("業界を入力してください。");
      return;
    }

    try {
      setSubmitting(true);

      await addDoc(collection(db, "participants"), {
        name: name.trim(),
        occupation: occupation.trim(),
        industry: industry.trim(),
        sns: sns.trim(),
        uid: user.uid,
        createdAt: serverTimestamp(),
      });

      setName("");
      setOccupation("");
      setIndustry("");
      setSns("");

      alert("プロフィールを掲示板に貼りました！");
    } catch (error) {
      console.error("登録エラー:", error);
      alert("登録に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  // ========================================
  // DMをリアルタイム取得
  // ========================================

  useEffect(() => {
    if (!user || !dmParticipant) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allMessages: Message[] = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            text: data.text || "",
            senderUid: data.senderUid || "",
            receiverUid: data.receiverUid || "",
          };
        });

        const conversation = allMessages.filter(
          (item) =>
            (item.senderUid === user.uid &&
              item.receiverUid === dmParticipant.uid) ||
            (item.senderUid === dmParticipant.uid &&
              item.receiverUid === user.uid)
        );

        setMessages(conversation);
      },
      (error) => {
        console.error("DM取得エラー:", error);
      }
    );

    return () => unsubscribe();
  }, [user, dmParticipant]);

  // ========================================
  // DM送信
  // ========================================

  const sendMessage = async () => {
    if (!user || !dmParticipant || !message.trim()) {
      return;
    }

    try {
      await addDoc(collection(db, "messages"), {
        text: message.trim(),
        senderUid: user.uid,
        receiverUid: dmParticipant.uid,
        createdAt: serverTimestamp(),
      });

      setMessage("");
    } catch (error) {
      console.error("DM送信エラー:", error);
      alert("メッセージを送信できませんでした。");
    }
  };

  // ========================================
  // DM画面
  // ========================================

  if (dmParticipant && user) {
    return (
      <main style={pageStyle}>
        <div style={dmContainerStyle}>
          <button
            onClick={() => setDmParticipant(null)}
            style={backButtonStyle}
          >
            ← 掲示板に戻る
          </button>

          <div style={dmHeaderStyle}>
            <div style={miniEnglishStyle}>DIRECT MESSAGE</div>

            <h2 style={dmNameStyle}>{dmParticipant.name}</h2>

            <div style={dmProfileTextStyle}>
              {dmParticipant.occupation}
              {dmParticipant.industry
                ? ` ・ ${dmParticipant.industry}`
                : ""}
            </div>

            {dmParticipant.sns && (
              <div style={dmSnsStyle}>SNS：{dmParticipant.sns}</div>
            )}
          </div>

          <div style={messageAreaStyle}>
            {messages.length === 0 ? (
              <div style={emptyMessageStyle}>
                <div style={{ fontSize: "30px", marginBottom: "10px" }}>
                  ☕
                </div>

                まだメッセージはありません。
                <br />
                気軽に話しかけてみましょう。
              </div>
            ) : (
              messages.map((item) => {
                const isMine = item.senderUid === user.uid;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: isMine
                        ? "flex-end"
                        : "flex-start",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        ...messageBubbleStyle,
                        background: isMine ? "#60785d" : "#ecece5",
                        color: isMine ? "#ffffff" : "#343a34",
                      }}
                    >
                      {item.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={messageInputRowStyle}>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder="メッセージを入力..."
              style={messageInputStyle}
            />

            <button onClick={sendMessage} style={sendButtonStyle}>
              送信
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // メインページ
  // ========================================

  return (
    <main style={pageStyle}>
      <div style={mainContainerStyle}>
        {/* ==================================
            HEADER
        ================================== */}

        <header style={headerStyle}>
          <div>
            <h1 style={logoStyle}>
              KIVO Cafe <span style={{ fontSize: "30px" }}>☕</span>
            </h1>

            <p style={taglineStyle}>
              つながる・ひろがる・また会える
            </p>
          </div>

          <div style={headerNoteStyle}>
            あの時の仲間が
            <br />
            今、ここに。
          </div>
        </header>

        {/* ==================================
            FORM
        ================================== */}

        <section style={formSectionStyle}>
          <div style={formIntroStyle}>
            <div style={miniEnglishStyle}>YOUR PROFILE</div>

            <h2 style={formTitleStyle}>
              🌿 あなたのプロフィールを登録しよう
            </h2>

            <p style={formDescriptionStyle}>
              あなたのことを簡単に教えてください。
              <br />
              登録すると、みんなのボードに
              <br />
              あなたの付箋が表示されます。
            </p>
          </div>

          <div style={formFieldsStyle}>
            <div style={fieldRowStyle}>
              <label style={labelStyle}>名前</label>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例）山口 耕平"
                style={inputStyle}
              />
            </div>

            <div style={fieldRowStyle}>
              <label style={labelStyle}>職業</label>

              <input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="例）学生 / 会社員 / 公務員"
                style={inputStyle}
              />
            </div>

            <div style={fieldRowStyle}>
              <label style={labelStyle}>業界</label>

              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="例）教育 / IT / 金融"
                style={inputStyle}
              />
            </div>

            <div style={fieldRowStyle}>
              <label style={labelStyle}>SNS</label>

              <input
                value={sns}
                onChange={(e) => setSns(e.target.value)}
                placeholder="例）@kohei_y"
                style={inputStyle}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                ...answerButtonStyle,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "登録中..." : "✈ 回答する"}
            </button>
          </div>
        </section>

        {/* ==================================
            PARTICIPANTS TITLE
        ================================== */}

        <section style={participantHeadingStyle}>
          <div>
            <h2 style={participantTitleStyle}>
              👥 参加者のみなさん
            </h2>

            <p style={participantDescriptionStyle}>
              気になる人の付箋をタップすると、
              詳しいプロフィールやDMを見ることができます。
            </p>
          </div>

          <div style={participantCountStyle}>
            {participants.length} people
          </div>
        </section>

        {/* ==================================
            CORK BOARD
        ================================== */}

        <section style={boardFrameStyle}>
          <div style={corkBoardStyle}>
            {participants.length === 0 ? (
              <div style={emptyBoardStyle}>
                <div style={{ fontSize: "38px", marginBottom: "12px" }}>
                  📌
                </div>

                まだ付箋がありません。
                <br />
                最初のプロフィールを貼ってみましょう！
              </div>
            ) : (
              <div style={stickyGridStyle}>
                {participants.map((participant, index) => {
                  const rotation =
                    index % 4 === 0
                      ? "-1.5deg"
                      : index % 4 === 1
                      ? "1deg"
                      : index % 4 === 2
                      ? "-0.5deg"
                      : "1.5deg";

                  return (
                    <button
                      key={participant.id}
                      onClick={() =>
                        setSelectedParticipant(participant)
                      }
                      style={{
                        ...stickyNoteStyle,
                        background:
                          stickyColors[index % stickyColors.length],
                        transform: `rotate(${rotation})`,
                      }}
                    >
                      <div style={pinStyle} />

                      <div style={stickyNameStyle}>
                        {participant.name}
                      </div>

                      <div style={stickyDividerStyle} />

                      <div style={stickyInfoStyle}>
                        <span>💼</span>
                        <span>
                          {participant.occupation || "未設定"}
                        </span>
                      </div>

                      <div style={stickyInfoStyle}>
                        <span>🏷️</span>
                        <span>
                          {participant.industry || "未設定"}
                        </span>
                      </div>

                      {participant.sns && (
                        <div style={stickyInfoStyle}>
                          <span>＠</span>
                          <span>{participant.sns}</span>
                        </div>
                      )}

                      <div style={stickyTapStyle}>
                        タップして見る →
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={boardMessageStyle}>
              Good people
              <br />
              Good conversations
              <br />
              Better future!
            </div>
          </div>
        </section>

        <footer style={footerStyle}>
          KIVO Cafe
          <br />
          <span style={{ fontSize: "12px" }}>
            またここから、つながろう。
          </span>
        </footer>
      </div>

      {/* ==================================
          PROFILE MODAL
      ================================== */}

      {selectedParticipant && (
        <div
          style={overlayStyle}
          onClick={() => setSelectedParticipant(null)}
        >
          <div
            style={profileModalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedParticipant(null)}
              style={closeButtonStyle}
            >
              ×
            </button>

            <div style={miniEnglishStyle}>PROFILE</div>

            <div style={profilePinStyle} />

            <h2 style={profileNameStyle}>
              {selectedParticipant.name}
            </h2>

            <div style={profileLineStyle}>
              <span>💼</span>
              <div>
                <div style={profileLabelStyle}>職業</div>
                <div>{selectedParticipant.occupation || "未設定"}</div>
              </div>
            </div>

            <div style={profileLineStyle}>
              <span>🏷️</span>
              <div>
                <div style={profileLabelStyle}>業界</div>
                <div>{selectedParticipant.industry || "未設定"}</div>
              </div>
            </div>

            {selectedParticipant.sns && (
              <div style={profileLineStyle}>
                <span>＠</span>

                <div>
                  <div style={profileLabelStyle}>SNS</div>
                  <div>{selectedParticipant.sns}</div>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setDmParticipant(selectedParticipant);
                setSelectedParticipant(null);
              }}
              style={dmButtonStyle}
            >
              ✉ この人にDMする
            </button>

            <button
              onClick={() => setSelectedParticipant(null)}
              style={modalCancelButtonStyle}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ======================================================
// STYLES
// ======================================================

const pageStyle = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, #fbfaf5 0%, #f5f5ed 50%, #f9f7ef 100%)",
  fontFamily:
    '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif',
  color: "#314039",
  padding: "0 16px 60px",
};

const mainContainerStyle = {
  width: "100%",
  maxWidth: "1180px",
  margin: "0 auto",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  padding: "42px 15px 30px",
  flexWrap: "wrap" as const,
};

const logoStyle = {
  fontFamily: "Georgia, serif",
  fontWeight: 500,
  fontSize: "clamp(38px, 7vw, 58px)",
  letterSpacing: "3px",
  color: "#344e45",
  margin: 0,
};

const taglineStyle = {
  margin: "8px 0 0",
  letterSpacing: "3px",
  color: "#51645d",
  fontSize: "14px",
};

const headerNoteStyle = {
  background: "#e5f2d9",
  padding: "13px 30px",
  transform: "rotate(-2deg)",
  boxShadow: "0 5px 12px rgba(0,0,0,0.08)",
  fontWeight: 600,
  lineHeight: 1.6,
  textAlign: "center" as const,
};

const formSectionStyle = {
  background:
    "linear-gradient(135deg, rgba(239,246,230,0.96), rgba(250,251,244,0.98))",
  border: "1px solid #dde5d6",
  borderRadius: "18px",
  padding: "32px",
  display: "grid",
  gridTemplateColumns: "minmax(240px, 0.9fr) minmax(300px, 1.3fr)",
  gap: "45px",
  boxShadow: "0 8px 25px rgba(65,80,60,0.06)",
};

const formIntroStyle = {
  padding: "5px",
};

const miniEnglishStyle = {
  color: "#84917d",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "3px",
  marginBottom: "10px",
};

const formTitleStyle = {
  fontFamily: "Georgia, serif",
  fontSize: "26px",
  fontWeight: 600,
  margin: "0 0 20px",
};

const formDescriptionStyle = {
  lineHeight: 1.9,
  color: "#667067",
  fontSize: "14px",
};

const formFieldsStyle = {
  width: "100%",
};

const fieldRowStyle = {
  display: "grid",
  gridTemplateColumns: "100px 1fr",
  alignItems: "center",
  gap: "12px",
  marginBottom: "13px",
};

const labelStyle = {
  fontWeight: 700,
  fontSize: "14px",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "13px 14px",
  borderRadius: "8px",
  border: "1px solid #ccd2c8",
  background: "rgba(255,255,255,0.9)",
  fontSize: "16px",
  color: "#343a35",
  outline: "none",
};

const answerButtonStyle = {
  width: "calc(100% - 112px)",
  marginLeft: "112px",
  marginTop: "8px",
  padding: "14px 20px",
  border: "none",
  borderRadius: "9px",
  background: "#52764f",
  color: "white",
  fontWeight: 700,
  fontSize: "16px",
  cursor: "pointer",
  boxShadow: "0 5px 12px rgba(57,85,55,0.18)",
};

const participantHeadingStyle = {
  marginTop: "50px",
  padding: "0 12px 18px",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "20px",
  flexWrap: "wrap" as const,
};

const participantTitleStyle = {
  fontFamily: "Georgia, serif",
  fontSize: "31px",
  margin: "0 0 7px",
};

const participantDescriptionStyle = {
  color: "#717871",
  margin: 0,
  fontSize: "14px",
};

const participantCountStyle = {
  background: "#e7eee2",
  borderRadius: "100px",
  padding: "8px 16px",
  fontSize: "13px",
  color: "#596a55",
  fontWeight: 700,
};

const boardFrameStyle = {
  background: "#a97845",
  padding: "12px",
  borderRadius: "7px",
  boxShadow: "0 10px 28px rgba(73,48,26,0.18)",
};

const corkBoardStyle = {
  position: "relative" as const,
  minHeight: "480px",
  padding: "45px 35px 80px",
  overflow: "hidden",
  backgroundColor: "#cfa36f",
  backgroundImage:
    "radial-gradient(rgba(111,75,43,0.14) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
  backgroundPosition: "0 0, 4px 4px",
  backgroundSize: "8px 8px",
  border: "2px solid rgba(94,59,30,0.2)",
};

const stickyGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "34px",
  alignItems: "start",
};

const stickyNoteStyle = {
  position: "relative" as const,
  width: "100%",
  minHeight: "205px",
  padding: "37px 20px 20px",
  border: "none",
  color: "#344039",
  textAlign: "left" as const,
  cursor: "pointer",
  boxShadow: "4px 7px 12px rgba(71,45,25,0.24)",
  fontFamily: "inherit",
  transition: "transform 0.15s ease",
};

const pinStyle = {
  position: "absolute" as const,
  top: "9px",
  left: "50%",
  transform: "translateX(-50%)",
  width: "15px",
  height: "15px",
  borderRadius: "50%",
  background: "#c94949",
  boxShadow:
    "0 3px 4px rgba(0,0,0,0.25), inset 0 2px 2px rgba(255,255,255,0.45)",
};

const stickyNameStyle = {
  textAlign: "center" as const,
  fontFamily: "Georgia, serif",
  fontWeight: 700,
  fontSize: "20px",
  marginBottom: "12px",
};

const stickyDividerStyle = {
  width: "30px",
  height: "1px",
  background: "rgba(49,64,57,0.25)",
  margin: "0 auto 14px",
};

const stickyInfoStyle = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  margin: "8px 0",
  fontSize: "14px",
};

const stickyTapStyle = {
  marginTop: "18px",
  textAlign: "right" as const,
  fontSize: "11px",
  color: "rgba(49,64,57,0.62)",
};

const boardMessageStyle = {
  position: "absolute" as const,
  bottom: "18px",
  right: "24px",
  fontFamily: "Georgia, serif",
  fontStyle: "italic",
  transform: "rotate(-3deg)",
  color: "rgba(72,53,36,0.75)",
  fontSize: "13px",
  lineHeight: 1.4,
};

const emptyBoardStyle = {
  textAlign: "center" as const,
  padding: "120px 20px",
  color: "#6d5036",
  lineHeight: 1.8,
};

const footerStyle = {
  textAlign: "center" as const,
  padding: "35px 0 0",
  color: "#778076",
  lineHeight: 1.8,
};

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 1000,
  background: "rgba(39,47,40,0.52)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px",
};

const profileModalStyle = {
  position: "relative" as const,
  width: "100%",
  maxWidth: "410px",
  boxSizing: "border-box" as const,
  padding: "38px 32px 28px",
  background: "#fffdf3",
  borderRadius: "7px",
  boxShadow: "0 22px 70px rgba(0,0,0,0.25)",
};

const closeButtonStyle = {
  position: "absolute" as const,
  top: "12px",
  right: "16px",
  border: "none",
  background: "transparent",
  color: "#777",
  fontSize: "27px",
  cursor: "pointer",
};

const profilePinStyle = {
  width: "15px",
  height: "15px",
  borderRadius: "50%",
  background: "#c94b4b",
  margin: "4px auto 15px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
};

const profileNameStyle = {
  fontFamily: "Georgia, serif",
  textAlign: "center" as const,
  fontSize: "28px",
  margin: "0 0 27px",
};

const profileLineStyle = {
  display: "flex",
  alignItems: "center",
  gap: "15px",
  borderBottom: "1px solid #ebe8dc",
  padding: "13px 3px",
};

const profileLabelStyle = {
  fontSize: "11px",
  color: "#999",
  marginBottom: "3px",
};

const dmButtonStyle = {
  width: "100%",
  border: "none",
  borderRadius: "7px",
  background: "#567653",
  color: "#fff",
  padding: "14px",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: "27px",
};

const modalCancelButtonStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  color: "#888",
  padding: "14px",
  cursor: "pointer",
};

const dmContainerStyle = {
  maxWidth: "650px",
  margin: "0 auto",
  paddingTop: "35px",
};

const backButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#62705f",
  cursor: "pointer",
  fontSize: "14px",
  padding: "10px 0",
};

const dmHeaderStyle = {
  background: "#fffdf7",
  padding: "25px",
  border: "1px solid #e5e4da",
  borderRadius: "10px",
  boxShadow: "0 5px 20px rgba(0,0,0,0.05)",
};

const dmNameStyle = {
  fontFamily: "Georgia, serif",
  fontSize: "27px",
  margin: "5px 0",
};

const dmProfileTextStyle = {
  color: "#626a61",
};

const dmSnsStyle = {
  color: "#8b9188",
  marginTop: "6px",
  fontSize: "13px",
};

const messageAreaStyle = {
  minHeight: "380px",
  background: "#fffdf7",
  marginTop: "12px",
  padding: "25px",
  borderRadius: "10px",
  border: "1px solid #e5e4da",
};

const emptyMessageStyle = {
  textAlign: "center" as const,
  color: "#a0a49d",
  marginTop: "110px",
  lineHeight: 1.8,
};

const messageBubbleStyle = {
  padding: "10px 14px",
  borderRadius: "17px",
  maxWidth: "75%",
  lineHeight: 1.6,
};

const messageInputRowStyle = {
  display: "flex",
  gap: "8px",
  marginTop: "12px",
};

const messageInputStyle = {
  flex: 1,
  minWidth: 0,
  padding: "13px",
  border: "1px solid #d6d7cf",
  borderRadius: "8px",
  fontSize: "16px",
};

const sendButtonStyle = {
  border: "none",
  borderRadius: "8px",
  padding: "0 22px",
  background: "#567653",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};