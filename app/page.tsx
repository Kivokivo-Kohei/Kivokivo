
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
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
  generation: string;
  occupation: string;
  industry: string;
  sns?: string;
  oneLiner?: string;
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
  const [generation, setGeneration] = useState("");
  const [occupation, setOccupation] = useState("");
  const [industry, setIndustry] = useState("");
  const [sns, setSns] = useState("");
  const [oneLiner, setOneLiner] = useState("");

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
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Googleログイン状態
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
  }, []);

  // 掲示板の参加者を取得
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
            generation: data.generation || "",
            occupation: data.occupation || "",
            industry: data.industry || "",
            sns: data.sns || "",
            oneLiner: data.oneLiner || "",
          };
        });

        setParticipants(list);
      },
      (error) => {
        console.error("参加者取得エラー:", error);
      }
    );
  }, []);

  // 自分のプロフィールを反映
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
      setGeneration(profile.generation || "");
      setOccupation(profile.occupation);
      setIndustry(profile.industry);
      setSns(profile.sns || "");
      setOneLiner(profile.oneLiner || "");
    } else {
      setMyProfile(null);
      setName(user.displayName || "");
      setGeneration("");
      setOccupation("");
      setIndustry("");
      setSns("");
      setOneLiner("");
    }
  }, [user, participants]);

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

  // プロフィール登録・編集
  const saveProfile = async () => {
    if (!user) {
      await loginWithGoogle();
      return;
    }

    if (!name.trim()) {
      alert("名前を入力してください。");
      return;
    }

    const normalizedGeneration = generation
      .trim()
      .replace(/期$/, "");

    if (
      !/^\d{1,3}$/.test(normalizedGeneration) ||
      Number(normalizedGeneration) < 1
    ) {
      alert("KIVO所属期を数字で入力してください。例：14");
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

    if (oneLiner.length > 100) {
      alert("ひとことは100文字以内で入力してください。");
      return;
    }

    if (saving) return;

    setSaving(true);

    try {
      const profileRef = doc(db, "participants", user.uid);

      const profileData = {
        uid: user.uid,
        name: name.trim(),
        generation: normalizedGeneration,
        occupation: occupation.trim(),
        industry: industry.trim(),
        sns: sns.trim(),
        oneLiner: oneLiner.trim(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(
        profileRef,
        myProfile
          ? profileData
          : {
              ...profileData,
              createdAt: serverTimestamp(),
            },
        { merge: true }
      );

      setMyProfile({
        id: user.uid,
        uid: user.uid,
        name: name.trim(),
        generation: normalizedGeneration,
        occupation: occupation.trim(),
        industry: industry.trim(),
        sns: sns.trim(),
        oneLiner: oneLiner.trim(),
      });

      alert("プロフィールを保存しました！");
      setTab("board");
    } catch (error: any) {
      console.error("プロフィール保存エラー:", error);
      alert(
        "プロフィールを保存できませんでした。\n" +
          (error?.message || "")
      );
    } finally {
      setSaving(false);
    }
  };

  // 2人のUIDから会話IDを生成
  const makeConversationId = (uid1: string, uid2: string) => {
    return [uid1, uid2].sort().join("_");
  };

  // DMを開始
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
        "DMを利用する前にプロフィールを登録してください。"
      );
      return;
    }

    if (!participant.uid) {
      alert("このプロフィールにはDMできません。");
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

      await setDoc(
        doc(db, "conversations", conversationId),
        {
          members,
          memberNames,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const existing = conversations.find(
        (conversation) => conversation.id === conversationId
      );

      const conversation: Conversation = existing || {
        id: conversationId,
        members,
        memberNames,
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
        "DMを開始できませんでした。\n" +
          (error?.message || "")
      );
    }
  };

  // 自分のDM一覧を取得
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
            (a.lastMessageAt?.seconds || 0) * 1000;

          const bTime =
            b.lastMessageAt?.toMillis?.() ||
            (b.lastMessageAt?.seconds || 0) * 1000;

          return bTime - aTime;
        });

        setConversations(list);
      },
      (error) => {
        console.error("会話一覧取得エラー:", error);
      }
    );
  }, [user]);

  const unreadTotal = useMemo(() => {
    if (!user) return 0;

    return conversations.reduce(
      (total, conversation) =>
        total + (conversation.unread?.[user.uid] || 0),
      0
    );
  }, [conversations, user]);

  // 会話を開く
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

  // メッセージ一覧
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

  // メッセージ送信
  const sendMessage = async () => {
    if (
      !user ||
      !activeConversation ||
      !messageText.trim() ||
      sending
    ) {
      return;
    }

    const otherUid = activeConversation.members.find(
      (uid) => uid !== user.uid
    );

    if (!otherUid) return;

    const text = messageText.trim();
    setSending(true);

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
          [`unread.${user.uid}`]: 0,
        }
      );

      setMessageText("");
    } catch (error: any) {
      console.error("メッセージ送信エラー:", error);
      alert(
        "メッセージを送信できませんでした。\n" +
          (error?.message || "")
      );
    } finally {
      setSending(false);
    }
  };

  // ==========================================
  // DM画面
  // ==========================================

  if (activeConversation && user) {
    const otherUid = activeConversation.members.find(
      (uid) => uid !== user.uid
    );

    const otherName =
      (otherUid &&
        activeConversation.memberNames?.[otherUid]) ||
      "参加者";

    const initial = otherName.trim().charAt(0) || "人";

    return (
      <main className="app chatApp">
        <div className="newChatPage">
          <button
            className="newBackButton"
            onClick={() => {
              setActiveConversation(null);
              setTab("messages");
            }}
          >
            <span>←</span>
            メッセージ一覧
          </button>

          <section className="newChatHeader">
            <div className="chatAvatar">{initial}</div>

            <div className="chatPerson">
              <h2>{otherName}</h2>
              <div className="directMessageLabel">
                DIRECT MESSAGE
              </div>
            </div>
          </section>

          <section className="newChatMessages">
            {messages.length === 0 ? (
              <div className="newEmptyChat">
                <strong>まだメッセージはありません。</strong>
                <span>気軽に話しかけてみましょう。</span>
              </div>
            ) : (
              <div className="messageArea">
                {messages.map((message) => {
                  const mine = message.senderUid === user.uid;

                  return (
                    <div
                      key={message.id}
                      className={
                        mine
                          ? "messageRow mine"
                          : "messageRow"
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
                })}
              </div>
            )}
          </section>

          <div className="newChatInputArea">
            <div className="newChatInputInner">
              <input
                value={messageText}
                onChange={(e) =>
                  setMessageText(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sending) {
                    sendMessage();
                  }
                }}
                placeholder="メッセージを入力..."
              />

              <button
                onClick={sendMessage}
                disabled={!messageText.trim() || sending}
              >
                {sending ? "送信中" : "送信"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // 掲示板・DM一覧・マイページ
  // ==========================================

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
          <div className="errorMessage">{loginMessage}</div>
        )}

        {/* 掲示板 */}

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

                        <strong className="stickyName">
                          {participant.name}
                          {participant.generation && (
                            <span className="generationLabel">
                              {" "}
                              {participant.generation}期
                            </span>
                          )}
                        </strong>

                        <div className="stickyLine" />

                        <span>
                          💼 {participant.occupation || "未設定"}
                        </span>

                        <span>
                          🏷️ {participant.industry || "未設定"}
                        </span>

                        {participant.sns && (
                          <span>📱 {participant.sns}</span>
                        )}

                        {participant.oneLiner && (
                          <span className="stickyOneLiner">
                            💬 {participant.oneLiner}
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

        {/* DM一覧 */}

        {tab === "messages" && (
          <section className="contentCard">
            <div className="eyebrow">MESSAGES</div>
            <h2>💬 メッセージ</h2>

            {!user ? (
              <div className="loginPrompt">
                <h3>メッセージを見るにはログイン</h3>
                <p>
                  DMは会話している本人同士だけが
                  確認できます。
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
                まだメッセージはありません。
                <br />
                掲示板から話してみたい人を
                探してみましょう。
              </div>
            ) : (
              <div className="conversationList">
                {conversations.map((conversation) => {
                  const otherUid = conversation.members.find(
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

        {/* マイページ */}

        {tab === "mypage" && (
          <section className="contentCard">
            <div className="eyebrow">MY PAGE</div>
            <h2>👤 マイページ</h2>

            {!user ? (
              <div className="loginPrompt">
                <h3>あなた専用のマイページ</h3>
                <p>Googleアカウントで本人確認します。</p>
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
                    💬 新着メッセージがあります
                    <span>
                      {unreadTotal > 99 ? "99+" : unreadTotal}
                    </span>
                  </button>
                )}

                <div className="profileForm">
                  <label>
                    名前
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例）山口 耕平"
                      maxLength={50}
                    />
                  </label>

                  <label>
                    KIVO所属期
                    <div className="generationInputWrap">
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={generation}
                        onChange={(e) =>
                          setGeneration(e.target.value)
                        }
                        placeholder="例）14"
                      />
                      <span>期</span>
                    </div>
                  </label>

                  <label>
                    職業
                    <input
                      value={occupation}
                      onChange={(e) =>
                        setOccupation(e.target.value)
                      }
                      placeholder="例）会社員"
                    />
                  </label>

                  <label>
                    業界
                    <input
                      value={industry}
                      onChange={(e) =>
                        setIndustry(e.target.value)
                      }
                      placeholder="例）コンサルティング"
                    />
                  </label>

                  <label>
                    SNSユーザーネーム
                    <input
                      value={sns}
                      onChange={(e) => setSns(e.target.value)}
                      placeholder="例）@kohei_y"
                    />
                  </label>

                  <label>
                    ひとこと（任意）
                    <textarea
                      className="oneLinerInput"
                      value={oneLiner}
                      onChange={(e) =>
                        setOneLiner(e.target.value)
                      }
                      maxLength={100}
                      rows={3}
                      placeholder="例）久しぶりに皆さんと会えるのが楽しみです！"
                    />
                    <span className="characterCount">
                      {oneLiner.length}/100文字
                    </span>
                  </label>

                  <button
                    className="primaryButton"
                    onClick={saveProfile}
                    disabled={saving}
                  >
                    {saving
                      ? "保存中..."
                      : myProfile
                      ? "プロフィールを更新"
                      : "プロフィールを登録"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* 下部ナビゲーション */}

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

      {/* 参加者プロフィール詳細 */}

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
              onClick={() => setSelectedParticipant(null)}
            >
              ×
            </button>

            <div className="modalPin" />

            <h2>
              {selectedParticipant.name}
              {selectedParticipant.generation && (
                <span className="modalGeneration">
                  {" "}
                  {selectedParticipant.generation}期
                </span>
              )}
            </h2>

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

            {selectedParticipant.oneLiner && (
              <div className="profileItem">
                <small>ひとこと</small>
                <span className="oneLinerDetail">
                  {selectedParticipant.oneLiner}
                </span>
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
                自分のマイページを開く
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

      {/* 掲示板・マイページ用デザイン */}

      <style>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
        }

        button,
        input,
        textarea {
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
          padding-bottom: 100px;
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

        .boardHeading {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          margin: 20px 5px;
        }

        .eyebrow {
          color: #85937f;
          letter-spacing: 3px;
          font-size: 11px;
          font-weight: 800;
          margin-bottom: 7px;
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
          box-shadow:
            0 12px 30px rgba(65, 42, 22, 0.18);
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
          grid-template-columns:
            repeat(auto-fit, minmax(180px, 1fr));
          gap: 30px;
        }

        .sticky {
          position: relative;
          min-height: 205px;
          border: 0;
          padding: 38px 20px 20px;
          cursor: pointer;
          text-align: left;
          color: #354038;
          box-shadow:
            4px 7px 13px rgba(68, 43, 23, 0.23);
        }

        .sticky strong {
          display: block;
          text-align: center;
          font-family: Georgia, serif;
          font-size: 20px;
          margin-bottom: 13px;
          overflow-wrap: anywhere;
        }

        .sticky .generationLabel {
          display: inline;
          font-family: "Yu Gothic", Meiryo, sans-serif;
          font-size: 0.7em;
          font-weight: 600;
          white-space: nowrap;
        }

        .sticky > span:not(.pin) {
          display: block;
          margin: 8px 0;
          font-size: 14px;
          overflow-wrap: anywhere;
        }

        .sticky .stickyOneLiner {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
          line-clamp: 3;
          overflow: hidden;
          white-space: pre-wrap;
          line-height: 1.5;
          margin-top: 12px;
          font-size: 12px;
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
          box-shadow:
            0 3px 4px rgba(0, 0, 0, 0.25);
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
          box-shadow:
            0 7px 25px rgba(0, 0, 0, 0.05);
        }

        .loginPrompt,
        .emptyContent {
          text-align: center;
          padding: 55px 20px;
          color: #727970;
          line-height: 1.7;
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

        .primaryButton:disabled {
          opacity: 0.6;
          cursor: default;
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

        .profileForm input,
        .profileForm textarea {
          width: 100%;
          border: 1px solid #d2d6ce;
          border-radius: 8px;
          background: white;
          padding: 13px;
          font-size: 16px;
          outline: none;
          color: #344039;
        }

        .profileForm textarea {
          resize: vertical;
          line-height: 1.6;
        }

        .generationInputWrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .generationInputWrap input {
          max-width: 160px;
        }

        .generationInputWrap span {
          font-size: 16px;
        }

        .characterCount {
          text-align: right;
          font-size: 12px;
          color: #788177;
          font-weight: 400;
        }

        .myPageNotification {
          width: 100%;
          margin-top: 22px;
          border: 0;
          border-radius: 10px;
          padding: 15px;
          background: #fff0f0;
          cursor: pointer;
          font-weight: 700;
          color: #5c4444;
        }

        .myPageNotification span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 10px;
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          border-radius: 20px;
          background: #e43c3c;
          color: white;
        }

        .conversationList {
          margin-top: 20px;
          display: grid;
          gap: 8px;
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
          max-height: 90dvh;
          overflow-y: auto;
          background: #fffdf2;
          padding: 37px 30px 28px;
          border-radius: 10px;
          box-shadow:
            0 25px 70px rgba(0, 0, 0, 0.25);
        }

        .profileModal h2 {
          text-align: center;
          font-family: Georgia, serif;
          font-size: 28px;
          overflow-wrap: anywhere;
        }

        .modalGeneration {
          font-family: "Yu Gothic", Meiryo, sans-serif;
          font-size: 0.6em;
          white-space: nowrap;
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
        }

        .profileItem small {
          color: #999;
        }

        .oneLinerDetail {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          line-height: 1.6;
        }

        .bottomNav {
          position: fixed;
          z-index: 1500;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: min(600px, 100%);
          height: 72px;
          background: rgba(255, 255, 252, 0.97);
          border-top: 1px solid #dedfd8;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          box-shadow:
            0 -5px 20px rgba(0, 0, 0, 0.06);
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
          right: -13px;
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

        @media (max-width: 650px) {
          .container {
            width: calc(100% - 20px);
          }

          .header {
            min-height: auto;
            padding: 22px 4px 25px;
            display: block;
          }

          .header h1 {
            font-size: 35px;
            letter-spacing: 2px;
          }

          .header h1 span {
            font-size: 23px;
          }

          .header p {
            font-size: 11px;
            letter-spacing: 1.5px;
          }

          .headerRight {
            margin-top: 17px;
            justify-content: space-between;
          }

          .loginName {
            max-width: 55%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .boardHeading {
            align-items: flex-start;
            margin-top: 10px;
          }

          .boardHeading h2,
          .contentCard h2 {
            font-size: 24px;
          }

          .boardHeading p {
            font-size: 12px;
            line-height: 1.6;
          }

          .peopleCount {
            font-size: 10px;
          }

          .boardFrame {
            padding: 7px;
          }

          .corkBoard {
            padding: 28px 15px 75px;
            min-height: 450px;
          }

          .stickyGrid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 18px 12px;
          }

          .sticky {
            min-height: 175px;
            padding: 31px 12px 14px;
          }

          .sticky strong {
            font-size: 16px;
            margin-bottom: 9px;
          }

          .sticky > span:not(.pin) {
            font-size: 12px;
            margin: 6px 0;
          }

          .sticky .stickyOneLiner {
            font-size: 11px;
          }

          .sticky small {
            font-size: 9px;
            margin-top: 12px;
          }

          .pin {
            width: 12px;
            height: 12px;
          }

          .boardQuote {
            font-size: 10px;
            right: 13px;
            bottom: 12px;
          }

          .contentCard {
            padding: 22px 17px;
            margin: 10px auto;
          }

          .profileModal {
            padding: 34px 22px 24px;
          }

          .bottomNav {
            height: 68px;
            padding-bottom:
              env(safe-area-inset-bottom);
          }
        }

        @media (max-width: 370px) {
          .stickyGrid {
            grid-template-columns: 1fr;
          }

          .sticky {
            max-width: 240px;
            width: 100%;
            margin: 0 auto;
          }
        }
      `}</style>
    </main>
  );
}
