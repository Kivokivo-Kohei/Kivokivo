"use client";

import { useEffect, useState } from "react";
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
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
  sns?: string;
  uid: string;
};

type Message = {
  id: string;
  text: string;
  senderUid: string;
  receiverUid: string;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  const [name, setName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [sns, setSns] = useState("");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joined, setJoined] = useState(false);

  // DM関連
  const [selectedParticipant, setSelectedParticipant] =
    useState<Participant | null>(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  // -------------------------
  // 匿名ログイン
  // -------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          const result = await signInAnonymously(auth);
          setUser(result.user);
        } catch (error) {
          console.error("匿名ログインエラー:", error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // -------------------------
  // 参加者一覧をリアルタイム取得
  // -------------------------
  useEffect(() => {
    const participantsRef = collection(db, "participants");

    const q = query(participantsRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const participantList: Participant[] = snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            name: data.name || "",
            occupation: data.occupation || "",
            sns: data.sns || "",
            uid: data.uid || "",
          };
        });

        setParticipants(participantList);
      },
      (error) => {
        console.error("参加者取得エラー:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // -------------------------
  // 参加登録
  // -------------------------
  const handleJoin = async () => {
    if (!user) {
      alert("接続中です。少し待ってからもう一度押してください。");
      return;
    }

    if (!name.trim()) {
      alert("お名前を入力してください。");
      return;
    }

    if (!occupation.trim()) {
      alert("ご職業を入力してください。");
      return;
    }

    try {
      await addDoc(collection(db, "participants"), {
        name: name.trim(),
        occupation: occupation.trim(),
        sns: sns.trim(),
        uid: user.uid,
        createdAt: serverTimestamp(),
      });

      setJoined(true);
    } catch (error) {
      console.error("参加登録エラー:", error);
      alert("参加登録に失敗しました。");
    }
  };

  // -------------------------
  // DMをリアルタイム取得
  // -------------------------
  useEffect(() => {
    if (!user || !selectedParticipant) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, "messages");

    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allMessages: Message[] = snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            text: data.text || "",
            senderUid: data.senderUid || "",
            receiverUid: data.receiverUid || "",
          };
        });

        const dmMessages = allMessages.filter((msg) => {
          return (
            (msg.senderUid === user.uid &&
              msg.receiverUid === selectedParticipant.uid) ||
            (msg.senderUid === selectedParticipant.uid &&
              msg.receiverUid === user.uid)
          );
        });

        setMessages(dmMessages);
      },
      (error) => {
        console.error("DM取得エラー:", error);
      }
    );

    return () => unsubscribe();
  }, [user, selectedParticipant]);

  // -------------------------
  // DM送信
  // -------------------------
  const sendMessage = async () => {
    if (!user || !selectedParticipant) {
      return;
    }

    if (!message.trim()) {
      return;
    }

    try {
      await addDoc(collection(db, "messages"), {
        text: message.trim(),
        senderUid: user.uid,
        receiverUid: selectedParticipant.uid,
        createdAt: serverTimestamp(),
      });

      setMessage("");
    } catch (error) {
      console.error("DM送信エラー:", error);
      alert("メッセージの送信に失敗しました。");
    }
  };

  // ==================================================
  // DM画面
  // ==================================================
  if (selectedParticipant && user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f7f7f7",
          padding: "20px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
          <button
            onClick={() => setSelectedParticipant(null)}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "16px",
              marginBottom: "20px",
            }}
          >
            ← 参加者一覧に戻る
          </button>

          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "16px",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: "8px",
              }}
            >
              {selectedParticipant.name}さん
            </h2>

            <p
              style={{
                color: "#666",
                margin: "0 0 8px 0",
              }}
            >
              {selectedParticipant.occupation}
            </p>

            {selectedParticipant.sns && (
              <p
                style={{
                  color: "#888",
                  margin: 0,
                }}
              >
                SNS：{selectedParticipant.sns}
              </p>
            )}
          </div>

          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "20px",
              minHeight: "350px",
            }}
          >
            {messages.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "#999",
                }}
              >
                まだメッセージはありません。
              </p>
            ) : (
              messages.map((msg) => {
                const mine = msg.senderUid === user.uid;

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent: mine ? "flex-end" : "flex-start",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        background: mine ? "#222" : "#eeeeee",
                        color: mine ? "white" : "#222",
                        padding: "10px 14px",
                        borderRadius: "16px",
                        maxWidth: "75%",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "15px",
            }}
          >
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder="メッセージを入力..."
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "10px",
                border: "1px solid #ccc",
                fontSize: "16px",
              }}
            />

            <button
              onClick={sendMessage}
              style={{
                border: "none",
                borderRadius: "10px",
                background: "#222",
                color: "white",
                padding: "0 22px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              送信
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ==================================================
  // メイン画面
  // ==================================================
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 20px",
        fontFamily: "sans-serif",
        background: "#f7f7f7",
      }}
    >
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            marginBottom: "8px",
          }}
        >
          KIVO Cafe
        </h1>

        <p
          style={{
            color: "#666",
            marginTop: 0,
          }}
        >
          参加者同士で気軽につながるイベントスペース
        </p>

        {!joined ? (
          <div
            style={{
              background: "white",
              padding: "24px",
              borderRadius: "16px",
              marginTop: "30px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <h2
              style={{
                marginTop: 0,
              }}
            >
              参加プロフィール
            </h2>

            <label
              style={{
                display: "block",
                marginTop: "16px",
                marginBottom: "6px",
                fontWeight: "bold",
              }}
            >
              お名前
            </label>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：山口耕平"
              style={inputStyle}
            />

            <label
              style={{
                display: "block",
                marginTop: "16px",
                marginBottom: "6px",
                fontWeight: "bold",
              }}
            >
              ご職業
            </label>

            <input
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="例：学生 / 会社員 / 教員"
              style={inputStyle}
            />

            <label
              style={{
                display: "block",
                marginTop: "16px",
                marginBottom: "6px",
                fontWeight: "bold",
              }}
            >
              SNSユーザーネーム
              <span
                style={{
                  fontWeight: "normal",
                  color: "#888",
                  fontSize: "13px",
                  marginLeft: "6px",
                }}
              >
                任意
              </span>
            </label>

            <input
              value={sns}
              onChange={(e) => setSns(e.target.value)}
              placeholder="例：@kohei123"
              style={inputStyle}
            />

            <button
              onClick={handleJoin}
              style={{
                width: "100%",
                padding: "14px",
                marginTop: "24px",
                border: "none",
                borderRadius: "10px",
                background: "#222",
                color: "white",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              参加する
            </button>
          </div>
        ) : (
          <div
            style={{
              background: "white",
              padding: "18px 22px",
              borderRadius: "14px",
              marginTop: "25px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            ✓ 参加しました！
          </div>
        )}

        <section
          style={{
            marginTop: "40px",
          }}
        >
          <h2>参加者一覧</h2>

          {participants.length === 0 ? (
            <p
              style={{
                color: "#777",
              }}
            >
              まだ参加者はいません。
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(230px, 1fr))",
                gap: "16px",
                marginTop: "20px",
              }}
            >
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  onClick={() => {
                    // 全員タップできる
                    setSelectedParticipant(participant);
                  }}
                  style={{
                    background: "white",
                    padding: "22px",
                    borderRadius: "14px",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: "bold",
                    }}
                  >
                    {participant.name}
                  </div>

                  {participant.occupation && (
                    <div
                      style={{
                        marginTop: "10px",
                        color: "#555",
                        fontSize: "17px",
                      }}
                    >
                      {participant.occupation}
                    </div>
                  )}

                  {participant.sns && (
                    <div
                      style={{
                        marginTop: "10px",
                        color: "#777",
                        fontSize: "15px",
                      }}
                    >
                      SNS：{participant.sns}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: "18px",
                      fontSize: "14px",
                      fontWeight: "bold",
                    }}
                  >
                    タップしてDM →
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px",
  fontSize: "16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  boxSizing: "border-box" as const,
};