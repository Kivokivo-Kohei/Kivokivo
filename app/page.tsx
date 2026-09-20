"use client";

import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";

import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db, googleProvider } from "./firebase";

type Participant = {
  id: string;
  uid: string;
  name: string;
  occupation: string;
  industry: string;
  sns?: string;
};

type Conversation = {
  id: string;
  members: string[];
  memberNames: Record<string, string>;
  lastMessage?: string;
  lastMessageAt?: any;
  unread?: Record<string, number>;
};

type ChatMessage = {
  id: string;
  text: string;
  senderUid: string;
  receiverUid: string;
  createdAt?: any;
};

const stickyColors = [
  "#FFF0A8",
  "#FFD3DF",
  "#CFEFFF",
  "#DDF4C8",
  "#FFE2B8",
  "#E5DBFF",
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myProfile, setMyProfile] = useState<Participant | null>(null);

  const [name, setName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [industry, setIndustry] = useState("");
  const [sns, setSns] = useState("");

  const [selectedParticipant, setSelectedParticipant] =
    useState<Participant | null>(null);

  const [tab, setTab] =
    useState<"board" | "messages" | "mypage">("board");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loginMessage, setLoginMessage] = useState("");

  // =========================================================
  // AUTH
  // =========================================================

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
  }, []);

  // =========================================================
  // PARTICIPANTS
  // =========================================================

  useEffect(() => {
    const q = query(
      collection(db, "participants"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: Participant[] = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            uid: data.uid || item.id,
            name: data.name || "",
            occupation: data.occupation || "",
            industry: data.industry || "",
            sns: data.sns || "",
          };
        });

        setParticipants(list);
      },
      (error) => {
        console.error("参加者取得エラー:", error);
      }
    );
  }, []);

  // =========================================================
  // LOAD MY PROFILE
  // participantsのリアルタイム一覧から自分を取得
  // =========================================================

  useEffect(() => {
    if (!user) {
      setMyProfile(null);
      return;
    }

    const profile = participants.find(
      (participant) =>
        participant.id === user.uid ||
        participant.uid === user.uid
    );

    if (profile) {
      setMyProfile(profile);
      setName(profile.name);
      setOccupation(profile.occupation);
      setIndustry(profile.industry);
      setSns(profile.sns || "");
    } else {
      setMyProfile(null);

      if (!name) {
        setName(user.displayName || "");
      }
    }
  }, [user, participants]);

  // =========================================================
  // LOGIN
  // =========================================================

  const loginWithGoogle = async () => {
    try {
      setLoginMessage("");
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Googleログインエラー:", error);

      setLoginMessage(
        error?.message || "Googleログインに失敗しました。"
      );
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);

      setTab("board");
      setActiveConversation(null);
      setMessages([]);
      setMyProfile(null);
    } catch (error) {
      console.error("ログアウトエラー:", error);
    }
  };

  // =========================================================
  // SAVE PROFILE
  // Google UIDをdocument IDにする
  // =========================================================

  const saveProfile = async () => {
    if (!user) {
      await loginWithGoogle();
      return;
    }

    if (!name.trim()) {
      alert("名前を入力してください。");
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
      const ref = doc(db, "participants", user.uid);

      await setDoc(
        ref,
        {
          uid: user.uid,
          name: name.trim(),
          occupation: occupation.trim(),
          industry: industry.trim(),
          sns: sns.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMyProfile({
        id: user.uid,
        uid: user.uid,
        name: name.trim(),
        occupation: occupation.trim(),
        industry: industry.trim(),
        sns: sns.trim(),
      });

      alert("プロフィールを保存しました！");
    } catch (error: any) {
      console.error("プロフィール保存エラー:", error);
      alert(
        `プロフィールを保存できませんでした。\n${error?.message || ""}`
      );
    }
  };

  // =========================================================
  // CONVERSATION ID
  // =========================================================

  const makeConversationId = (uid1: string, uid2: string) => {
    return [uid1, uid2].sort().join("_");
  };

  // =========================================================
  // START DM
  // getDocを先にしない。setDoc mergeで直接作成。
  // =========================================================

  const contactParticipant = async (participant: Participant) => {
    if (!user) {
      setSelectedParticipant(null);

      alert(
        `${participant.name}さんにDMするにはGoogleログインしてください。`
      );

      await loginWithGoogle();
      return;
    }

    if (!myProfile) {
      setSelectedParticipant(null);
      setTab("mypage");

      alert(
        "DMを利用する前に、マイページからプロフィールを登録してください。"
      );

      return;
    }

    if (!participant.uid) {
      alert(
        "このプロフィールは古いテストデータのためDMできません。"
      );
      return;
    }

    if (participant.uid === user.uid) {
      alert("自分自身にはDMできません。");
      return;
    }

    try {
      const conversationId = makeConversationId(
        user.uid,
        participant.uid
      );

      const members = [user.uid, participant.uid].sort();

      const memberNames = {
        [user.uid]: myProfile.name,
        [participant.uid]: participant.name,
      };

      const conversationRef = doc(
        db,
        "conversations",
        conversationId
      );

      // conversationを直接作る/既存なら統合
      await setDoc(
        conversationRef,
        {
          members,
          memberNames,
          lastMessage: "",
          lastMessageAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          [`unread.${user.uid}`]: 0,
          [`unread.${participant.uid}`]: 0,
        },
        { merge: true }
      );

      const conversation: Conversation = {
        id: conversationId,
        members,
        memberNames,
        lastMessage: "",
        unread: {
          [user.uid]: 0,
          [participant.uid]: 0,
        },
      };

      setActiveConversation(conversation);
      setSelectedParticipant(null);
    } catch (error: any) {
      console.error("DM開始エラー:", error);

      alert(
        `DMを開始できませんでした。\n\n${error?.message || "Unknown error"}`
      );
    }
  };

  // =========================================================
  // MY CONVERSATIONS
  // 自分がmembersにいるものしか問い合わせない
  // =========================================================

  useEffect(() => {
    if (!user) {
      setConversations([]);
      return;
    }

    const q = query(
      collection(db, "conversations"),
      where("members", "array-contains", user.uid)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: Conversation[] = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            members: data.members || [],
            memberNames: data.memberNames || {},
            lastMessage: data.lastMessage || "",
            lastMessageAt: data.lastMessageAt,
            unread: data.unread || {},
          };
        });

        list.sort((a, b) => {
          const aTime =
            a.lastMessageAt?.toMillis?.() ||
            a.lastMessageAt?.seconds ||
            0;

          const bTime =
            b.lastMessageAt?.toMillis?.() ||
            b.lastMessageAt?.seconds ||
            0;

          return bTime - aTime;
        });

        setConversations(list);
      },
      (error) => {
        console.error("会話一覧取得エラー:", error);
      }
    );
  }, [user]);

  // =========================================================
  // UNREAD TOTAL
  // =========================================================

  const unreadTotal = useMemo(() => {
    if (!user) return 0;

    return conversations.reduce((total, conversation) => {
      return total + (conversation.unread?.[user.uid] || 0);
    }, 0);
  }, [conversations, user]);

  // =========================================================
  // OPEN CONVERSATION
  // =========================================================

  const openConversation = async (conversation: Conversation) => {
    if (!user) return;

    setActiveConversation(conversation);

    try {
      await updateDoc(
        doc(db, "conversations", conversation.id),
        {
          [`unread.${user.uid}`]: 0,
        }
      );
    } catch (error) {
      console.error("既読処理エラー:", error);
    }
  };

  // =========================================================
  // MESSAGES
  // =========================================================

  useEffect(() => {
    if (!user || !activeConversation) {
      setMessages([]);
      return;
    }

    if (!activeConversation.members.includes(user.uid)) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(
        db,
        "conversations",
        activeConversation.id,
        "messages"
      ),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: ChatMessage[] = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            text: data.text || "",
            senderUid: data.senderUid || "",
            receiverUid: data.receiverUid || "",
            createdAt: data.createdAt,
          };
        });

        setMessages(list);
      },
      (error) => {
        console.error("メッセージ取得エラー:", error);
      }
    );
  }, [user, activeConversation]);

  // =========================================================
  // SEND MESSAGE
  // =========================================================

  const sendMessage = async () => {
    if (!user || !activeConversation || !messageText.trim()) {
      return;
    }

    const otherUid = activeConversation.members.find(
      (uid) => uid !== user.uid
    );

    if (!otherUid) return;

    const text = messageText.trim();

    try {
      await addDoc(
        collection(
          db,
          "conversations",
          activeConversation.id,
          "messages"
        ),
        {
          text,
          senderUid: user.uid,
          receiverUid: otherUid,
          createdAt: serverTimestamp(),
        }
      );

      await updateDoc(
        doc(db, "conversations", activeConversation.id),
        {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          [`unread.${otherUid}`]: increment(1),
        }
      );

      setMessageText("");
    } catch (error: any) {
      console.error("メッセージ送信エラー:", error);

      alert(
        `メッセージを送信できませんでした。\n${error?.message || ""}`
      );
    }
  };

  // =========================================================
  // CHAT SCREEN
  // =========================================================

  if (activeConversation && user) {
    const otherUid = activeConversation.members.find(
      (uid) => uid !== user.uid
    );

    const otherName =
      (otherUid &&
        activeConversation.memberNames?.[otherUid]) ||
      "参加者";

    return (
      <main className="app">
        <div className="chatPage">
          <button
            className="backButton"
            onClick={() => {
              setActiveConversation(null);
              setTab("messages");
            }}
          >
            ← メッセージ一覧
          </button>

          <section className="chatHeader">
            <div>
              <div className="eyebrow">DIRECT MESSAGE</div>
              <h2>{otherName}</h2>
            </div>

            <div className="secureLabel">
              🔒 2人だけの会話
            </div>
          </section>

          <section className="chatMessages">
            {messages.length === 0 ? (
              <div className="emptyChat">
                <div className="coffee">☕</div>
                まだメッセージはありません。
                <br />
                気軽に話しかけてみましょう。
              </div>
            ) : (
              messages.map((message) => {
                const mine = message.senderUid === user.uid;

                return (
                  <div
                    key={message.id}
                    className={
                      mine ? "messageRow mine" : "messageRow"
                    }
                  >
                    <div
                      className={
                        mine
                          ? "bubble mineBubble"
                          : "bubble otherBubble"
                      }
                    >
                      {message.text}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <div className="chatInput">
            <input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder="メッセージを入力..."
            />

            <button onClick={sendMessage}>送信</button>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================
  // MAIN
  // =========================================================

  return (
    <main className="app">
      <div className="container">
        <header className="header">
          <div>
            <h1>
              KIVO Cafe <span>☕</span>
            </h1>
            <p>つながる・ひろがる・また会える</p>
          </div>

          <div className="headerRight">
            {!authReady ? (
              <span>Loading...</span>
            ) : user ? (
              <>
                <span className="loginName">
                  {myProfile?.name ||
                    user.displayName ||
                    "ログイン中"}
                </span>

                <button
                  className="smallButton"
                  onClick={logout}
                >
                  ログアウト
                </button>
              </>
            ) : (
              <button
                className="googleButton"
                onClick={loginWithGoogle}
              >
                Googleでログイン
              </button>
            )}
          </div>
        </header>

        {loginMessage && (
          <div className="errorMessage">
            {loginMessage}
          </div>
        )}

        {/* BOARD */}

        {tab === "board" && (
          <>
            <section className="boardHeading">
              <div>
                <div className="eyebrow">
                  COMMUNITY BOARD
                </div>

                <h2>👥 参加者のみなさん</h2>

                <p>
                  ログインしなくても参加者のプロフィールを
                  見ることができます。
                </p>
              </div>

              <span className="peopleCount">
                {participants.length} people
              </span>
            </section>

            <section className="boardFrame">
              <div className="corkBoard">
                {participants.length === 0 ? (
                  <div className="emptyBoard">
                    📌
                    <br />
                    まだプロフィールがありません。
                  </div>
                ) : (
                  <div className="stickyGrid">
                    {participants.map((participant, index) => (
                      <button
                        key={participant.id}
                        className="sticky"
                        style={{
                          background:
                            stickyColors[
                              index % stickyColors.length
                            ],
                          transform: `rotate(${
                            index % 2 === 0 ? "-1deg" : "1deg"
                          })`,
                        }}
                        onClick={() =>
                          setSelectedParticipant(participant)
                        }
                      >
                        <span className="pin" />

                        <strong>{participant.name}</strong>

                        <div className="stickyLine" />

                        <span>
                          💼 {participant.occupation || "未設定"}
                        </span>

                        <span>
                          🏷️ {participant.industry || "未設定"}
                        </span>

                        {participant.sns && (
                          <span>
                            📱 {participant.sns}
                          </span>
                        )}

                        <small>プロフィールを見る →</small>
                      </button>
                    ))}
                  </div>
                )}

                <div className="boardQuote">
                  Good people
                  <br />
                  Good conversations
                  <br />
                  Better future!
                </div>
              </div>
            </section>
          </>
        )}

        {/* MESSAGES */}

        {tab === "messages" && (
          <section className="contentCard">
            <div className="eyebrow">MESSAGES</div>
            <h2>💬 メッセージ</h2>

            {!user ? (
              <div className="loginPrompt">
                <div className="bigIcon">🔐</div>

                <h3>メッセージを見るにはログイン</h3>

                <p>
                  DMは会話している本人同士だけが確認できます。
                </p>

                <button
                  className="primaryButton"
                  onClick={loginWithGoogle}
                >
                  Googleでログイン
                </button>
              </div>
            ) : !myProfile ? (
              <div className="loginPrompt">
                <h3>まずプロフィールを登録してください</h3>

                <p>
                  プロフィール登録後にDMを利用できます。
                </p>

                <button
                  className="primaryButton"
                  onClick={() => setTab("mypage")}
                >
                  マイページへ
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="emptyContent">
                <div className="bigIcon">💬</div>
                まだメッセージはありません。
                <br />
                掲示板から話してみたい人を探してみましょう。
              </div>
            ) : (
              <div className="conversationList">
                {conversations.map((conversation) => {
                  const otherUid =
                    conversation.members.find(
                      (uid) => uid !== user.uid
                    );

                  const otherName =
                    (otherUid &&
                      conversation.memberNames?.[otherUid]) ||
                    "参加者";

                  const unread =
                    conversation.unread?.[user.uid] || 0;

                  return (
                    <button
                      key={conversation.id}
                      className="conversation"
                      onClick={() =>
                        openConversation(conversation)
                      }
                    >
                      <div className="avatar">
                        {otherName.charAt(0)}
                      </div>

                      <div className="conversationText">
                        <strong>{otherName}</strong>

                        <span>
                          {conversation.lastMessage ||
                            "会話を始めましょう"}
                        </span>
                      </div>

                      {unread > 0 && (
                        <span className="unreadBadge">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* MY PAGE */}

        {tab === "mypage" && (
          <section className="contentCard">
            <div className="eyebrow">MY PAGE</div>
            <h2>👤 マイページ</h2>

            {!user ? (
              <div className="loginPrompt">
                <div className="bigIcon">👤</div>

                <h3>あなた専用のマイページ</h3>

                <p>
                  Googleアカウントで本人確認します。
                  他の参加者があなたのマイページに
                  ログインすることはできません。
                </p>

                <button
                  className="primaryButton"
                  onClick={loginWithGoogle}
                >
                  Googleでログイン
                </button>
              </div>
            ) : (
              <>
                {unreadTotal > 0 && (
                  <button
                    className="myPageNotification"
                    onClick={() => setTab("messages")}
                  >
                    <span className="notificationText">
                      💬 新着メッセージがあります
                    </span>

                    <span className="notificationNumber">
                      {unreadTotal > 99 ? "99+" : unreadTotal}
                    </span>
                  </button>
                )}

                <div className="profileForm">
                  <label>
                    名前
                    <input
                      value={name}
                      onChange={(e) =>
                        setName(e.target.value)
                      }
                      placeholder="例）山口 耕平"
                    />
                  </label>

                  <label>
                    職業
                    <input
                      value={occupation}
                      onChange={(e) =>
                        setOccupation(e.target.value)
                      }
                      placeholder="例）大学院生"
                    />
                  </label>

                  <label>
                    業界
                    <input
                      value={industry}
                      onChange={(e) =>
                        setIndustry(e.target.value)
                      }
                      placeholder="例）教育"
                    />
                  </label>

                  <label>
                    SNSユーザーネーム
                    <input
                      value={sns}
                      onChange={(e) =>
                        setSns(e.target.value)
                      }
                      placeholder="例）@kohei_y"
                    />
                  </label>

                  <button
                    className="primaryButton"
                    onClick={saveProfile}
                  >
                    {myProfile
                      ? "プロフィールを更新"
                      : "プロフィールを登録"}
                  </button>
                </div>

                {myProfile && (
                  <div className="profileSaved">
                    ✓ このプロフィールはあなたのGoogleアカウントに
                    紐づいています。
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* BOTTOM NAV */}

      <nav className="bottomNav">
        <button
          className={tab === "board" ? "active" : ""}
          onClick={() => setTab("board")}
        >
          <span>📌</span>
          掲示板
        </button>

        <button
          className={tab === "messages" ? "active" : ""}
          onClick={() => setTab("messages")}
        >
          <span className="navIcon">
            💬

            {unreadTotal > 0 && (
              <b>
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </b>
            )}
          </span>

          DM
        </button>

        <button
          className={tab === "mypage" ? "active" : ""}
          onClick={() => setTab("mypage")}
        >
          <span>👤</span>
          マイページ
        </button>
      </nav>

      {/* PROFILE MODAL */}

      {selectedParticipant && (
        <div
          className="overlay"
          onClick={() => setSelectedParticipant(null)}
        >
          <div
            className="profileModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() =>
                setSelectedParticipant(null)
              }
            >
              ×
            </button>

            <div className="modalPin" />

            <h2>{selectedParticipant.name}</h2>

            <div className="profileItem">
              <small>職業</small>
              <span>
                {selectedParticipant.occupation || "未設定"}
              </span>
            </div>

            <div className="profileItem">
              <small>業界</small>
              <span>
                {selectedParticipant.industry || "未設定"}
              </span>
            </div>

            {selectedParticipant.sns && (
              <div className="profileItem">
                <small>SNS</small>
                <span>{selectedParticipant.sns}</span>
              </div>
            )}

            {user?.uid === selectedParticipant.uid ? (
              <button
                className="secondaryButton"
                onClick={() => {
                  setSelectedParticipant(null);
                  setTab("mypage");
                }}
              >
                👤 自分のマイページを開く
              </button>
            ) : (
              <button
                className="primaryButton"
                onClick={() =>
                  contactParticipant(selectedParticipant)
                }
              >
                ✉ この人にDMする
              </button>
            )}
          </div>
        </div>
      )}

      {/* CSS */}

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          overflow-x: hidden;
          background: #f8f7f0;
        }

        body {
          padding-bottom: 90px;
        }

        button,
        input {
          font-family: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        .app {
          min-height: 100vh;
          background: linear-gradient(
            180deg,
            #fbfaf5 0%,
            #f4f5ec 100%
          );
          color: #344039;
          font-family:
            "Hiragino Kaku Gothic ProN",
            "Yu Gothic",
            Meiryo,
            sans-serif;
        }

        .container {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
        }

        .header {
          min-height: 130px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 30px 5px;
        }

        .header h1 {
          margin: 0;
          font-family: Georgia, serif;
          font-size: clamp(36px, 6vw, 56px);
          font-weight: 500;
          letter-spacing: 3px;
          color: #365046;
        }

        .header h1 span {
          font-size: 30px;
        }

        .header p {
          margin: 8px 0 0;
          letter-spacing: 3px;
          color: #66756c;
          font-size: 13px;
        }

        .headerRight {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .loginName {
          font-weight: 700;
        }

        .googleButton,
        .smallButton {
          border: 1px solid #d3d8ce;
          background: white;
          padding: 11px 17px;
          border-radius: 8px;
          cursor: pointer;
          color: #3c493f;
        }

        .errorMessage {
          padding: 12px;
          margin-bottom: 15px;
          background: #ffe7e7;
          border-radius: 7px;
        }

        .eyebrow {
          color: #85937f;
          letter-spacing: 3px;
          font-size: 11px;
          font-weight: 800;
          margin-bottom: 7px;
        }

        .boardHeading {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          margin: 20px 5px;
        }

        .boardHeading h2,
        .contentCard h2 {
          font-family: Georgia, serif;
          font-size: 30px;
          margin: 0 0 8px;
        }

        .boardHeading p {
          color: #777e76;
          font-size: 14px;
          margin: 0;
        }

        .peopleCount {
          background: #e4ecdf;
          border-radius: 100px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }

        .boardFrame {
          background: #9d6c3d;
          padding: 11px;
          border-radius: 8px;
          box-shadow: 0 12px 30px
            rgba(65, 42, 22, 0.18);
        }

        .corkBoard {
          position: relative;
          min-height: 500px;
          padding: 42px 32px 80px;
          overflow: hidden;
          background-color: #cfa36e;
          background-image:
            radial-gradient(
              rgba(91, 58, 30, 0.13) 1px,
              transparent 1px
            ),
            radial-gradient(
              rgba(255, 255, 255, 0.09) 1px,
              transparent 1px
            );
          background-size: 8px 8px;
          background-position: 0 0, 4px 4px;
        }

        .stickyGrid {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(180px, 1fr)
          );
          gap: 30px;
        }

        .sticky {
          position: relative;
          min-width: 0;
          min-height: 205px;
          border: 0;
          padding: 38px 20px 20px;
          cursor: pointer;
          text-align: left;
          color: #354038;
          box-shadow: 4px 7px 13px
            rgba(68, 43, 23, 0.23);
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease;
        }

        .sticky:hover {
          box-shadow: 5px 10px 18px
            rgba(68, 43, 23, 0.3);
        }

        .sticky strong {
          display: block;
          text-align: center;
          font-family: Georgia, serif;
          font-size: 20px;
          margin-bottom: 13px;
          overflow-wrap: anywhere;
        }

        .sticky > span:not(.pin) {
          display: block;
          margin: 8px 0;
          font-size: 14px;
          overflow-wrap: anywhere;
        }

        .sticky small {
          display: block;
          margin-top: 20px;
          text-align: right;
          opacity: 0.55;
        }

        .pin {
          position: absolute;
          top: 10px;
          left: 50%;
          width: 15px;
          height: 15px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: #ca4949;
          box-shadow: 0 3px 4px
            rgba(0, 0, 0, 0.25);
        }

        .stickyLine {
          width: 32px;
          height: 1px;
          margin: 0 auto 15px;
          background: rgba(40, 50, 40, 0.2);
        }

        .boardQuote {
          position: absolute;
          right: 25px;
          bottom: 17px;
          font-family: Georgia, serif;
          font-style: italic;
          transform: rotate(-3deg);
          color: rgba(75, 52, 34, 0.7);
          font-size: 13px;
        }

        .emptyBoard {
          text-align: center;
          padding: 150px 20px;
          line-height: 2;
        }

        .contentCard {
          max-width: 720px;
          margin: 20px auto;
          padding: 30px;
          background: #fffef9;
          border: 1px solid #e7e5da;
          border-radius: 14px;
          box-shadow: 0 7px 25px
            rgba(0, 0, 0, 0.05);
        }

        .loginPrompt,
        .emptyContent {
          text-align: center;
          padding: 55px 20px;
          color: #727970;
          line-height: 1.7;
        }

        .bigIcon {
          font-size: 38px;
          margin-bottom: 12px;
        }

        .primaryButton,
        .secondaryButton {
          border: 0;
          width: 100%;
          padding: 14px 18px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 15px;
        }

        .primaryButton {
          background: #567653;
          color: white;
        }

        .secondaryButton {
          background: #e9eee5;
          color: #455745;
        }

        .profileForm {
          display: grid;
          gap: 17px;
          margin-top: 25px;
        }

        .profileForm label {
          display: grid;
          gap: 7px;
          font-size: 13px;
          font-weight: 700;
        }

        .profileForm input {
          width: 100%;
          min-width: 0;
          border: 1px solid #d2d6ce;
          border-radius: 8px;
          background: white;
          padding: 13px;
          font-size: 16px;
          outline: none;
        }

        .profileForm input:focus,
        .chatInput input:focus {
          border-color: #718b6d;
          outline: 2px solid
            rgba(113, 139, 109, 0.12);
        }

        .profileSaved {
          margin-top: 18px;
          padding: 12px;
          border-radius: 8px;
          background: #edf4e9;
          color: #5a6e57;
          font-size: 12px;
          line-height: 1.6;
        }

        .myPageNotification {
          width: 100%;
          margin: 20px 0 5px;
          border: 0;
          border-radius: 12px;
          padding: 15px;
          background: #fff0f0;
          cursor: pointer;
          font-weight: 700;
          color: #5c4444;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .notificationNumber {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 27px;
          height: 27px;
          padding: 0 7px;
          border-radius: 50px;
          background: #e43c3c;
          color: white;
          font-size: 12px;
        }

        .conversationList {
          margin-top: 20px;
          display: grid;
          gap: 5px;
        }

        .conversation {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 14px;
          border: 0;
          border-bottom: 1px solid #ecebe4;
          background: transparent;
          cursor: pointer;
          text-align: left;
          border-radius: 8px;
        }

        .conversation:hover {
          background: #f7f7f1;
        }

        .avatar {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #dfe8d9;
          font-weight: 800;
          flex-shrink: 0;
        }

        .conversationText {
          flex: 1;
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .conversationText span {
          color: #888e87;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 13px;
        }

        .unreadBadge {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 25px;
          height: 25px;
          padding: 0 7px;
          border-radius: 20px;
          background: #e43c3c;
          color: white;
          font-size: 12px;
          font-weight: 800;
          flex-shrink: 0;
        }

        .overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(36, 44, 38, 0.52);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .profileModal {
          position: relative;
          width: min(410px, 100%);
          max-height: calc(100dvh - 40px);
          overflow-y: auto;
          background: #fffdf2;
          padding: 37px 30px 28px;
          border-radius: 10px;
          box-shadow: 0 25px 70px
            rgba(0, 0, 0, 0.25);
        }

        .profileModal h2 {
          text-align: center;
          font-family: Georgia, serif;
          font-size: 28px;
          overflow-wrap: anywhere;
        }

        .close {
          position: absolute;
          right: 15px;
          top: 10px;
          border: 0;
          background: transparent;
          font-size: 28px;
          cursor: pointer;
        }

        .modalPin {
          width: 15px;
          height: 15px;
          margin: 0 auto;
          background: #c84949;
          border-radius: 50%;
        }

        .profileItem {
          display: grid;
          gap: 4px;
          padding: 12px 3px;
          border-bottom: 1px solid #ebe8db;
          overflow-wrap: anywhere;
        }

        .profileItem small {
          color: #999;
        }

        .chatPage {
          width: min(680px, calc(100% - 24px));
          margin: 0 auto;
          padding: 25px 0 100px;
        }

        .backButton {
          border: 0;
          background: transparent;
          padding: 12px 0;
          cursor: pointer;
          color: #60705e;
        }

        .chatHeader {
          background: #fffef9;
          border: 1px solid #e5e4da;
          padding: 18px 20px;
          border-radius: 12px 12px 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .chatHeader h2 {
          margin: 0;
          font-family: Georgia, serif;
        }

        .secureLabel {
          color: #748072;
          font-size: 11px;
          white-space: nowrap;
        }

        .chatMessages {
          height: min(58vh, 550px);
          overflow-y: auto;
          padding: 20px;
          background: #fffef9;
          border-left: 1px solid #e5e4da;
          border-right: 1px solid #e5e4da;
        }

        .emptyChat {
          text-align: center;
          color: #999f98;
          padding-top: 100px;
          line-height: 1.8;
        }

        .coffee {
          font-size: 30px;
          margin-bottom: 8px;
        }

        .messageRow {
          display: flex;
          justify-content: flex-start;
          margin-bottom: 12px;
        }

        .messageRow.mine {
          justify-content: flex-end;
        }

        .bubble {
          max-width: 78%;
          padding: 10px 14px;
          border-radius: 17px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .mineBubble {
          background: #60785d;
          color: white;
          border-bottom-right-radius: 5px;
        }

        .otherBubble {
          background: #ecece5;
          border-bottom-left-radius: 5px;
        }

        .chatInput {
          display: flex;
          gap: 8px;
          background: #fffef9;
          border: 1px solid #e5e4da;
          padding: 12px;
          border-radius: 0 0 12px 12px;
        }

        .chatInput input {
          flex: 1;
          min-width: 0;
          border: 1px solid #d5d8d1;
          border-radius: 8px;
          padding: 13px;
          font-size: 16px;
        }

        .chatInput button {
          border: 0;
          background: #567653;
          color: white;
          border-radius: 8px;
          padding: 0 22px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
        }

        .bottomNav {
          position: fixed;
          z-index: 1500;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: min(600px, 100%);
          min-height: 72px;
          background: rgba(255, 255, 252, 0.97);
          border-top: 1px solid #dedfd8;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          box-shadow: 0 -5px 20px
            rgba(0, 0, 0, 0.06);
          padding-bottom: env(safe-area-inset-bottom);
        }

        .bottomNav button {
          position: relative;
          border: 0;
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          cursor: pointer;
          color: #8a9189;
          font-size: 11px;
          min-height: 68px;
        }

        .bottomNav button > span {
          font-size: 20px;
        }

        .bottomNav button.active {
          color: #4e694d;
          font-weight: 800;
        }

        .navIcon {
          position: relative;
        }

        .navIcon b {
          position: absolute;
          top: -8px;
          right: -16px;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 20px;
          background: #e33c3c;
          color: white;
          font-size: 10px;
        }

        /* iPHONE / SMARTPHONE */

        @media (max-width: 650px) {
          body {
            padding-bottom: calc(
              76px + env(safe-area-inset-bottom)
            );
          }

          .container {
            width: calc(100% - 16px);
          }

          .header {
            min-height: auto;
            padding: 18px 4px 20px;
            display: block;
          }

          .header h1 {
            font-size: 32px;
            letter-spacing: 1px;
          }

          .header h1 span {
            font-size: 22px;
          }

          .header p {
            font-size: 10px;
            letter-spacing: 1px;
          }

          .headerRight {
            margin-top: 14px;
            justify-content: space-between;
            width: 100%;
          }

          .loginName {
            max-width: 52%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
          }

          .googleButton,
          .smallButton {
            padding: 9px 12px;
            font-size: 12px;
          }

          .boardHeading {
            align-items: flex-start;
            margin: 8px 2px 14px;
            gap: 8px;
          }

          .boardHeading h2,
          .contentCard h2 {
            font-size: 22px;
          }

          .boardHeading p {
            font-size: 11px;
            line-height: 1.6;
          }

          .peopleCount {
            font-size: 9px;
            padding: 6px 9px;
          }

          .boardFrame {
            padding: 6px;
          }

          .corkBoard {
            padding: 24px 10px 70px;
            min-height: 440px;
          }

          .stickyGrid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
            gap: 16px 9px;
          }

          .sticky {
            width: 100%;
            min-width: 0;
            min-height: 168px;
            padding: 29px 9px 12px;
          }

          .sticky strong {
            font-size: 15px;
            margin-bottom: 8px;
          }

          .sticky > span:not(.pin) {
            font-size: 11px;
            margin: 6px 0;
          }

          .sticky small {
            font-size: 8px;
            margin-top: 11px;
          }

          .pin {
            width: 11px;
            height: 11px;
          }

          .boardQuote {
            font-size: 9px;
            right: 10px;
            bottom: 10px;
          }

          .contentCard {
            padding: 20px 15px;
            margin: 8px auto;
            border-radius: 11px;
          }

          .loginPrompt,
          .emptyContent {
            padding: 40px 10px;
          }

          .profileModal {
            width: 100%;
            padding: 32px 20px 22px;
          }

          .profileModal h2 {
            font-size: 24px;
          }

          .chatPage {
            width: calc(100% - 10px);
            padding-top: 5px;
            padding-bottom: 15px;
          }

          .chatHeader {
            padding: 14px;
          }

          .chatHeader h2 {
            font-size: 20px;
          }

          .secureLabel {
            font-size: 9px;
          }

          .chatMessages {
            height: calc(100dvh - 210px);
            min-height: 300px;
            padding: 12px;
          }

          .bubble {
            max-width: 84%;
            font-size: 14px;
          }

          .chatInput {
            position: sticky;
            bottom: 0;
            padding: 8px;
          }

          .chatInput input {
            padding: 11px;
          }

          .chatInput button {
            padding: 0 14px;
          }

          .bottomNav {
            width: 100%;
          }
        }

        @media (max-width: 360px) {
          .stickyGrid {
            grid-template-columns: 1fr;
          }

          .sticky {
            max-width: 240px;
            margin: 0 auto;
          }
        }
      `}</style>
    </main>
  );
}