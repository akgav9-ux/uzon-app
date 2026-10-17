import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  appConfig,
  blocks,
  comments,
  conversationMembers,
  conversations,
  demoAccounts,
  follows,
  likes,
  media,
  messages,
  moderationActions,
  notifications,
  playlists,
  playlistItems,
  posts,
  postMedia,
  privacySettings,
  profiles,
  reports,
  stories,
  storyViews,
  userSettings,
  videos,
  videoJobs,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";

/**
 * Local demo dataset. Every counter in the app is derived from real rows
 * (analytics_events, likes, follows), so the seeded numbers are internally
 * consistent and never incremented artificially at runtime.
 *
 * Media uses public stock assets (Pexels / Google sample bucket) referenced by
 * `remoteUrl`; user uploads always go to the local/S3 store instead.
 */

export const DEMO_PASSWORD = "uzon-demo-2026";

const IMG = {
  registan: "https://images.pexels.com/photos/39662533/pexels-photo-39662533.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  samarkand: "https://images.pexels.com/photos/39662686/pexels-photo-39662686.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  tiles: "https://images.pexels.com/photos/19227934/pexels-photo-19227934.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  courtyard: "https://images.pexels.com/photos/32354686/pexels-photo-32354686.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  mosque: "https://images.pexels.com/photos/39662536/pexels-photo-39662536.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  aerial: "https://images.pexels.com/photos/39662682/pexels-photo-39662682.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
};

const CLIP_SRC = [
  { url: "https://videos.pexels.com/video-files/6032849/6032849-hd_1080_1920_30fps.mp4", ms: 7000 },
  { url: "https://videos.pexels.com/video-files/17243363/17243363-hd_1080_1920_24fps.mp4", ms: 11000 },
  { url: "https://videos.pexels.com/video-files/12145866/12145866-hd_1080_1920_60fps.mp4", ms: 32000 },
  { url: "https://videos.pexels.com/video-files/9921096/9921096-uhd_2160_3840_30fps.mp4", ms: 17000 },
];

const LONG_SRC = [
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", ms: 596_000 },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", ms: 888_000 },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", ms: 734_000 },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", ms: 653_000 },
];

async function tableExists(name: string): Promise<boolean> {
  const rows = await db
    .execute(sql`select to_regclass(${`public.${name}`}) as t`)
    .then((r) => (r as unknown as { rows: { t: string | null }[] }).rows ?? []);
  return Boolean(rows[0]?.t);
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

export async function seedIfEmpty(): Promise<{ seeded: boolean; reason?: string }> {
  if (process.env.SEED_ON_BOOT === "false") return { seeded: false, reason: "SEED_ON_BOOT=false" };
  if (!(await tableExists("profiles"))) return { seeded: false, reason: "schema-not-pushed" };
  const existing = await db.select({ id: profiles.id }).from(profiles).limit(1);
  if (existing.length) return { seeded: false, reason: "already-seeded" };

  const passwordHash = hashPassword(DEMO_PASSWORD);

  const people = [
    {
      username: "aziza",
      displayName: "Aziza Karimova",
      bio: "Travel creator • Samarqand → world ✈️\nSayohat haqida hikoyalar",
      role: "user",
      isCreator: true,
      email: "aziza@uzon.demo",
      phone: "+998901110001",
      links: [{ label: "Blog", url: "https://example.com/aziza" }],
    },
    {
      username: "javohir",
      displayName: "Javohir Toshpoʻlatov",
      bio: "Software engineer in Tashkent. Building open tools, writing about IT in Uzbek.",
      role: "user",
      isCreator: true,
      email: "javohir@uzon.demo",
      phone: "+998901110002",
      links: [{ label: "GitHub", url: "https://github.com" }],
    },
    {
      username: "madina",
      displayName: "Madina Nazarova",
      bio: "Newsroom editor • UZON News anchor",
      role: "user",
      isCreator: true,
      email: "madina@uzon.demo",
      phone: "+998901110003",
      links: [],
    },
    {
      username: "sardor",
      displayName: "Sardor Aliyev",
      bio: "Buxoro. Football, photography, good plov.",
      role: "user",
      isCreator: false,
      email: "sardor@uzon.demo",
      phone: "+998901110004",
      links: [],
    },
    {
      username: "dilnoza",
      displayName: "Dilnoza Rahimova",
      bio: "Teacher of English • Fargʻona 📚",
      role: "user",
      isCreator: true,
      email: "dilnoza@uzon.demo",
      phone: "+998901110005",
      links: [],
    },
    {
      username: "bekzod",
      displayName: "Bekzod Tursunov",
      bio: "Drone pilot & videographer",
      role: "user",
      isCreator: true,
      email: "bekzod@uzon.demo",
      phone: "+998901110006",
      links: [],
    },
    {
      username: "nilufar",
      displayName: "Nilufar Yoʻldosheva",
      bio: "UZON Trust & Safety",
      role: "moderator",
      isCreator: false,
      email: "nilufar@uzon.demo",
      phone: "+998901110007",
      links: [],
    },
  ];

  const ids: Record<string, string> = {};
  for (const person of people) {
    const [row] = await db
      .insert(profiles)
      .values({
        username: person.username,
        displayName: person.displayName,
        bio: person.bio,
        role: person.role,
        isCreator: person.isCreator,
        email: person.email,
        phone: person.phone,
        phoneCountry: "+998",
        passwordHash,
        links: person.links,
        coverKey: person.username === "aziza" ? null : null,
        createdAt: daysAgo(30 + Math.floor(Math.random() * 300)),
      })
      .returning({ id: profiles.id });
    ids[person.username] = row!.id;
    await db.insert(userSettings).values({
      userId: row!.id,
      theme: "dark",
      locale: person.username === "dilnoza" ? "en" : "ru",
    });
    await db.insert(privacySettings).values({
      userId: row!.id,
      phoneVisibility: "nobody",
      findableByPhone: "contacts",
      whoCanMessage: person.username === "madina" ? "contacts" : "everyone",
      whoCanCall: "contacts",
      whoCanSeeStories: "everyone",
      whoCanComment: "everyone",
      profileVisibility: person.username === "sardor" ? "private" : "public",
    });
    await db.insert(demoAccounts).values({
      username: person.username,
      password: DEMO_PASSWORD,
      role: person.role,
      note: "Local demo account created by the seeder",
    });
  }

  /* ---------------- follows ---------------- */
  const followPairs: [string, string][] = [
    ["sardor", "aziza"],
    ["sardor", "javohir"],
    ["dilnoza", "aziza"],
    ["dilnoza", "madina"],
    ["bekzod", "aziza"],
    ["bekzod", "javohir"],
    ["javohir", "aziza"],
    ["aziza", "bekzod"],
    ["madina", "aziza"],
    ["nilufar", "madina"],
    ["sardor", "madina"],
  ];
  for (const [follower, following] of followPairs) {
    await db.insert(follows).values({
      followerId: ids[follower]!,
      followingId: ids[following]!,
      createdAt: daysAgo(Math.ceil(Math.random() * 40)),
    });
  }
  for (const person of people) {
    const [followers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followingId, ids[person.username]!));
    const [following] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followerId, ids[person.username]!));
    await db
      .update(profiles)
      .set({ followersCount: followers?.count ?? 0, followingCount: following?.count ?? 0 })
      .where(eq(profiles.id, ids[person.username]!));
  }

  await db.insert(blocks).values({ blockerId: ids.sardor!, blockedId: ids.nilufar!, createdAt: daysAgo(3) }).catch(() => undefined);

  /* ---------------- media ---------------- */
  async function addMedia(ownerId: string, url: string, kind: "image" | "video", mime: string, extra?: Partial<typeof media.$inferInsert>) {
    const key = `remote-${url.split("/").pop()?.split("?")[0] ?? "asset"}`;
    const [row] = await db
      .insert(media)
      .values({
        ownerId,
        key: `${key}-${Math.random().toString(36).slice(2, 8)}`,
        remoteUrl: url,
        mime,
        kind,
        size: 0,
        visibility: "public",
        ...extra,
      })
      .returning();
    return row!;
  }

  /* ---------------- channels & groups ---------------- */
  const channelDefs = [
    { slug: "uzon", title: "UZON Official", owner: "madina", description: "Product updates and community rules." },
    { slug: "uzon_news", title: "UZON News", owner: "madina", description: "Daily news digest from Uzbekistan and the world." },
    { slug: "tashkent_tech", title: "Tashkent Tech", owner: "javohir", description: "IT, startups and engineering in Uzbekistan." },
    { slug: "sayohat", title: "Sayohat • Travel UZ", owner: "aziza", description: "Travel stories across Uzbekistan." },
  ];
  const channelIds: Record<string, string> = {};
  for (const def of channelDefs) {
    const [row] = await db
      .insert(conversations)
      .values({
        kind: "channel",
        slug: def.slug,
        title: def.title,
        description: def.description,
        ownerId: ids[def.owner]!,
        isPrivate: false,
        onlyAdminsCanPost: true,
        createdAt: daysAgo(60),
      })
      .returning({ id: conversations.id });
    channelIds[def.slug] = row!.id;
    await db.insert(conversationMembers).values({ conversationId: row!.id, userId: ids[def.owner]!, role: "owner" });
    for (const person of people) {
      if (person.username === def.owner) continue;
      await db
        .insert(conversationMembers)
        .values({ conversationId: row!.id, userId: ids[person.username]!, role: "subscriber" })
        .catch(() => undefined);
    }
    await db
      .update(conversations)
      .set({ membersCount: people.length })
      .where(eq(conversations.id, row!.id));
  }

  const [group] = await db
    .insert(conversations)
    .values({
      kind: "group",
      title: "UZON Creators Hub",
      description: "Coordination group for verified creators.",
      ownerId: ids.javohir!,
      isPrivate: false,
      createdAt: daysAgo(40),
    })
    .returning();
  for (const person of ["javohir", "aziza", "madina", "bekzod", "dilnoza"]) {
    await db.insert(conversationMembers).values({
      conversationId: group!.id,
      userId: ids[person]!,
      role: person === "javohir" ? "owner" : person === "madina" ? "admin" : "member",
    });
  }
  await db.update(conversations).set({ membersCount: 5 }).where(eq(conversations.id, group!.id));

  /* ---------------- direct chat ---------------- */
  const [direct] = await db
    .insert(conversations)
    .values({ kind: "direct", ownerId: ids.aziza!, createdAt: daysAgo(12) })
    .returning();
  await db.insert(conversationMembers).values([
    { conversationId: direct!.id, userId: ids.aziza!, role: "member", lastReadAt: hoursAgo(1) },
    { conversationId: direct!.id, userId: ids.javohir!, role: "member", lastReadAt: hoursAgo(5) },
  ]);
  const directScript: [string, string, number][] = [
    ["aziza", "Salom! Yangi klipni koʻrdingmi? Registan boʻyicha montaj tugadi.", 6],
    ["javohir", "Ha, juda zoʻr chiqqan. Pleerdagi sifatni almashtirish ishladimi?", 5.5],
    ["aziza", "Ishladi. Faqat mobil tarmoqda yuklash uzoq davom etadi.", 5],
    ["javohir", "Bu CDN bilan bogʻliq, productionda obyektli xotiraga oʻtkazamiz.", 4.6],
    ["aziza", "Kelishdik. Ertaga efirga beramiz 👍", 4],
  ];
  for (const [who, text, ago] of directScript) {
    await db.insert(messages).values({
      conversationId: direct!.id,
      senderId: ids[who]!,
      text,
      createdAt: hoursAgo(ago),
    });
  }

  /* ---------------- channel posts ---------------- */
  const channelPosts: [string, string, string, number, string | null][] = [
    ["uzon_news", "madina", "Prezident qarori: 2026-yilda IT-parklar soni ikki baravar oshadi. Batafsil — kanalda.", 3, IMG.courtyard],
    ["tashkent_tech", "javohir", "PostgreSQL 18 va Drizzle bilan ishlash boʻyicha qisqa qoʻllanma tayyor. Klipda asosiy fikrlar.", 8, null],
    ["sayohat", "aziza", "Samarqand: Registon maydoni kunduzi va kechqurun. Yangi klip yuklandi 🎬", 14, IMG.registan],
    ["uzon", "madina", "Welcome to UZON! Please read the Community Rules before publishing.", 48, null],
  ];
  for (const [slug, author, text, ago, image] of channelPosts) {
    const [post] = await db
      .insert(posts)
      .values({
        authorId: ids[author]!,
        conversationId: channelIds[slug]!,
        text,
        kind: image ? "photo" : "text",
        audience: "public",
        createdAt: hoursAgo(ago),
      })
      .returning();
    if (image) {
      const m = await addMedia(ids[author]!, image, "image", "image/jpeg", { width: 1200, height: 627 });
      await db.insert(postMedia).values({ postId: post!.id, mediaId: m.id, position: 0 });
    }
  }

  /* ---------------- personal posts ---------------- */
  const personalPosts: [string, string, number, string | null][] = [
    ["aziza", "Bugun tongda Shahrisabzga chiqdik. Yoʻl 3 soat davom etdi, ammo manzara bunga arziydi 🏔️", 5, IMG.aerial],
    ["dilnoza", "Yangi dars: ingliz tilida 12 zamon — jadval va mashqlar. Kimga kerak boʻlsa, saqlab qoʻying.", 11, null],
    ["bekzod", "Kecha kechqurun dron bilan Toshkent ustidan suratga oldim. Klip tez orada.", 20, IMG.mosque],
    ["sardor", "Plov tayyor! Retsept soʻraganlar uchun: guruch 1 kg, sabzi 1 kg, goʻsht 1 kg 🙂", 30, null],
    ["aziza", "Izoh yozing: qaysi shaharga keyingi sayohatni rejalashtiray?", 52, null],
    ["javohir", "Bugun UZON API da yangi versiyani chiqardik: kliplar uchun server tomonidagi limitlar.", 70, null],
  ];
  const postIds: string[] = [];
  for (const [author, text, ago, image] of personalPosts) {
    const [post] = await db
      .insert(posts)
      .values({
        authorId: ids[author]!,
        text,
        kind: image ? "photo" : "text",
        audience: author === "sardor" ? "followers" : "public",
        createdAt: hoursAgo(ago),
      })
      .returning();
    postIds.push(post!.id);
    if (image) {
      const m = await addMedia(ids[author]!, image, "image", "image/jpeg", { width: 1200, height: 627 });
      await db.insert(postMedia).values({ postId: post!.id, mediaId: m.id, position: 0 });
    }
  }

  /* ---------------- stories ---------------- */
  const storyDefs: [string, string, number, string][] = [
    ["aziza", IMG.registan, 2, "Registon, 07:40"],
    ["bekzod", IMG.tiles, 4, "Yangi kadr"],
    ["madina", IMG.courtyard, 6, "Newsroom"],
    ["dilnoza", IMG.mosque, 9, "Juma kuni"],
  ];
  for (const [author, image, ago, caption] of storyDefs) {
    const m = await addMedia(ids[author]!, image, "image", "image/jpeg", { width: 1200, height: 627 });
    const [story] = await db
      .insert(stories)
      .values({
        userId: ids[author]!,
        mediaId: m.id,
        caption,
        overlayText: caption,
        audience: "public",
        createdAt: hoursAgo(ago),
        expiresAt: new Date(Date.now() + (24 - ago) * 3_600_000),
      })
      .returning();
    for (const viewer of ["sardor", "javohir", "dilnoza"]) {
      if (viewer === author) continue;
      await db
        .insert(storyViews)
        .values({ storyId: story!.id, viewerId: ids[viewer]!, viewedAt: hoursAgo(ago - 0.5) })
        .catch(() => undefined);
    }
  }

  /* ---------------- clips ---------------- */
  const clipDefs = [
    { owner: "bekzod", title: "Toshkent tungi hayot 🌃", desc: "Drone kadr, kechki shahar #tashkent #night", tags: ["tashkent", "night", "drone"], src: CLIP_SRC[0], cat: "travel" },
    { owner: "aziza", title: "Registon maydoni 60 soniyada", desc: "Samarqandning yuragi #samarkand #registan", tags: ["samarkand", "registan"], src: CLIP_SRC[2], cat: "travel" },
    { owner: "javohir", title: "3 ta VS Code triki", desc: "Dasturchilar uchun tez maslahatlar #it #coding", tags: ["it", "coding", "vscode"], src: CLIP_SRC[1], cat: "technology" },
    { owner: "bekzod", title: "Kechki koʻcha", desc: "Yomgʻirdan keyin #city #street", tags: ["city", "street"], src: CLIP_SRC[3], cat: "entertainment" },
  ];
  const clipIds: string[] = [];
  for (const clip of clipDefs) {
    const m = await addMedia(ids[clip.owner]!, clip.src.url, "video", "video/mp4", {
      width: 1080,
      height: 1920,
      durationMs: clip.src.ms,
    });
    const [video] = await db
      .insert(videos)
      .values({
        ownerId: ids[clip.owner]!,
        title: clip.title,
        description: clip.desc,
        category: clip.cat,
        kind: "clip",
        mediaId: m.id,
        hashtags: clip.tags,
        durationMs: clip.src.ms,
        status: "ready",
        createdAt: hoursAgo(3 + Math.random() * 60),
      })
      .returning();
    clipIds.push(video!.id);
    await db.insert(videoJobs).values({ videoId: video!.id, stage: "done", status: "ready", progress: 100 });
  }

  /* ---------------- long videos ---------------- */
  const longDefs = [
    {
      owner: "aziza",
      title: "Samarqand boʻylab toʻliq sayohat | Registon, Shohi Zinda",
      desc: "Bir kunlik sayohat: Registon maydoni, Shohi Zinda majmuasi va mahalliy bozor. Subtitrlar oʻzbek va rus tilida.",
      cat: "travel",
      src: LONG_SRC[0],
      tags: ["travel", "samarkand", "uzbekistan"],
      poster: IMG.registan,
    },
    {
      owner: "javohir",
      title: "Next.js va PostgreSQL bilan ijtimoiy tarmoq: amaliy dars",
      desc: "Server komponentlari, Drizzle ORM, sessiyalar va xavfsizlik — boshdan oxirigacha.",
      cat: "education",
      src: LONG_SRC[1],
      tags: ["nextjs", "postgres", "education"],
      poster: IMG.tiles,
    },
    {
      owner: "madina",
      title: "Hafta yakunlari: Oʻzbekiston va dunyo iqtisodiyoti",
      desc: "Tahliliy dastur: eksport, IT-parklar va yangi investitsiyalar.",
      cat: "news",
      src: LONG_SRC[2],
      tags: ["news", "analytics"],
      poster: IMG.courtyard,
    },
    {
      owner: "bekzod",
      title: "Toshkent kechqurun — kinematik dron filmi",
      desc: "4K dron kadr, original musiqasiz, montaj muallifi Bekzod.",
      cat: "documentary",
      src: LONG_SRC[3],
      tags: ["drone", "cinematic", "tashkent"],
      poster: IMG.samarkand,
    },
  ];
  const longIds: string[] = [];
  for (const def of longDefs) {
    const m = await addMedia(ids[def.owner]!, def.src.url, "video", "video/mp4", {
      width: 1280,
      height: 720,
      durationMs: def.src.ms,
    });
    const poster = await addMedia(ids[def.owner]!, def.poster, "image", "image/jpeg", { width: 1200, height: 627 });
    const [video] = await db
      .insert(videos)
      .values({
        ownerId: ids[def.owner]!,
        title: def.title,
        description: def.desc,
        category: def.cat,
        kind: "long",
        mediaId: m.id,
        posterKey: poster.key,
        hashtags: def.tags,
        durationMs: def.src.ms,
        status: "ready",
        processingNote: "Demo asset served from an external CDN; uploaded files are transcoded when a media service is connected.",
        createdAt: daysAgo(1 + Math.floor(Math.random() * 25)),
      })
      .returning();
    longIds.push(video!.id);
    await db.insert(videoJobs).values({ videoId: video!.id, stage: "done", status: "ready", progress: 100 });
    const [pl] = await db
      .insert(playlists)
      .values({ ownerId: ids[def.owner]!, title: def.cat === "travel" ? "Sayohat toʻplami" : "Tanlangan", kind: "playlist" })
      .returning()
      .catch(() => [undefined]);
    if (pl) await db.insert(playlistItems).values({ playlistId: pl.id, videoId: video!.id, position: 0 }).catch(() => undefined);
  }

  /* ---------------- engagement: likes, comments, views ---------------- */
  const allVideoIds = [...clipIds, ...longIds];
  const likers = Object.values(ids);
  for (const videoId of allVideoIds) {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
    if (!video) continue;
    const viewers = likers.filter((id) => id !== video.ownerId).slice(0, 2 + Math.floor(Math.random() * 4));
    for (const viewer of viewers) {
      const createdAt = hoursAgo(Math.random() * 60);
      const watchMs = Math.min(video.durationMs ?? 20_000, 3_000 + Math.floor(Math.random() * 60_000));
      await db.insert(analyticsEvents).values({
        entityType: "video",
        entityId: videoId,
        ownerId: video.ownerId,
        type: "view",
        actorId: viewer,
        source: video.kind === "clip" ? "clips" : "videos",
        watchMs,
        createdAt,
      });
    }
    await db
      .update(videos)
      .set({ viewCount: viewers.length })
      .where(eq(videos.id, videoId));
  }

  const commentTexts = [
    "Juda zoʻr chiqqan! 🔥",
    "Menga ham shu joy yoqadi, borib koʻrganman.",
    "Sifatni oshirsa boʻladimi?",
    "Rahmat, foydali kontent.",
    "Keyingi qismini ham kutyapmiz!",
  ];
  for (const videoId of allVideoIds.slice(0, 6)) {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
    if (!video) continue;
    for (let i = 0; i < 2; i += 1) {
      const author = likers[(i + videoId.length) % likers.length]!;
      if (author === video.ownerId) continue;
      await db.insert(comments).values({
        entityType: "video",
        entityId: videoId,
        authorId: author,
        text: commentTexts[i % commentTexts.length]!,
        createdAt: hoursAgo(2 + i * 5),
      });
    }
    await db
      .update(videos)
      .set({ commentCount: sql`(select count(*)::int from comments where entity_type='video' and entity_id = ${videoId})` })
      .where(eq(videos.id, videoId));
  }

  for (const postId of postIds) {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) continue;
    const likersForPost = likers.filter((id) => id !== post.authorId).slice(0, 1 + Math.floor(Math.random() * 4));
    for (const liker of likersForPost) {
      await db.insert(likes).values({ entityType: "post", entityId: postId, userId: liker, createdAt: hoursAgo(1 + Math.random() * 20) });
      await db.insert(analyticsEvents).values({
        entityType: "post",
        entityId: postId,
        ownerId: post.authorId,
        type: "like",
        actorId: liker,
        source: "feed",
        createdAt: hoursAgo(1 + Math.random() * 20),
      });
    }
    await db.insert(comments).values({
      entityType: "post",
      entityId: postId,
      authorId: likersForPost[0] ?? likers[0]!,
      text: commentTexts[postId.length % commentTexts.length]!,
      createdAt: hoursAgo(1.5),
    });
    await db
      .update(posts)
      .set({ likeCount: likersForPost.length, commentCount: 1 })
      .where(eq(posts.id, postId));
  }

  /* ---------------- follow analytics + notifications ---------------- */
  for (const [follower, following] of followPairs.slice(0, 6)) {
    await db.insert(analyticsEvents).values({
      entityType: "channel",
      entityId: ids[following]!,
      ownerId: ids[following]!,
      type: "follow",
      actorId: ids[follower]!,
      source: "profile",
      createdAt: daysAgo(Math.ceil(Math.random() * 20)),
    });
  }
  await db.insert(notifications).values([
    { userId: ids.aziza!, type: "follow", actorId: ids.sardor!, entityType: "user", entityId: ids.sardor!, preview: "sardor" },
    { userId: ids.aziza!, type: "comment", actorId: ids.dilnoza!, entityType: "post", entityId: postIds[0]!, preview: "Juda zoʻr chiqqan! 🔥" },
    { userId: ids.javohir!, type: "like", actorId: ids.bekzod!, entityType: "video", entityId: longIds[1]!, preview: "bekzod" },
    { userId: ids.madina!, type: "processing", entityType: "video", entityId: longIds[2]!, preview: "Hafta yakunlari" },
  ]);

  /* ---------------- moderation demo data ---------------- */
  await db.insert(reports).values([
    {
      reporterId: ids.dilnoza!,
      entityType: "comment",
      entityId: postIds[3]!,
      reason: "spam",
      details: "Reklam havolalari bilan takroriy izohlar.",
      status: "open",
      createdAt: hoursAgo(7),
    },
    {
      reporterId: ids.sardor!,
      entityType: "video",
      entityId: clipIds[3]!,
      reason: "copyright",
      details: "Musiqadan foydalanish huquqi koʻrsatilmagan.",
      status: "open",
      createdAt: hoursAgo(20),
    },
  ]);
  await db.insert(moderationActions).values({
    moderatorId: ids.nilufar!,
    action: "dismiss",
    entityType: "video",
    entityId: clipIds[0]!,
    note: "Mualliflik huquqi buzilishi tasdiqlanmadi.",
    createdAt: daysAgo(2),
  });

  /* ---------------- server runtime config ---------------- */
  await db
    .insert(appConfig)
    .values([
      { key: "clipMaxSeconds", value: 300 },
      { key: "viewRegisterMs", value: 3000 },
      { key: "viewCooldownMinutes", value: 30 },
      { key: "storyLifetimeHours", value: 24 },
    ])
    .onConflictDoNothing();

  return { seeded: true };
}

/** Auto-join every new account to the official announcement channel. */
export async function joinOfficialChannel(userId: string): Promise<void> {
  const [channel] = await db.select().from(conversations).where(and(eq(conversations.slug, "uzon"))).limit(1);
  if (!channel) return;
  await db
    .insert(conversationMembers)
    .values({ conversationId: channel.id, userId, role: "subscriber" })
    .onConflictDoNothing();
  await db
    .update(conversations)
    .set({ membersCount: sql`${conversations.membersCount} + 1` })
    .where(eq(conversations.id, channel.id));
}
