"use client";

import Link from "next/link";
import { useApp } from "@/components/providers";

type DocumentKey = "terms" | "privacy" | "community";
type Section = { title: string; body: string };
const content: Record<string, Record<DocumentKey, { title: string; intro: string; sections: Section[] }>> = {
  "uz": {
    terms: { title: "UZON foydalanish shartlari", intro: "UZON — Oʻzbekistonda yaratilgan va dunyo foydalanuvchilari uchun ochiq ijtimoiy platforma. Roʻyxatdan oʻtish yoki xizmatdan foydalanish orqali ushbu shartlarni qabul qilasiz.", sections: [
      { title: "1. Yosh va akkaunt", body: "Platformadan foydalanish uchun kamida 13 yoshda boʻlishingiz yoki yashayotgan mamlakatingiz qonunlari talab qilgan yuqoriroq yoshga yetgan boʻlishingiz kerak. Voyaga yetmaganlar ota-ona yoki qonuniy vakil roziligi talab qilinadigan joylarda bunday rozilik bilan foydalanadi. Akkaunt maʼlumotlari toʻgʻri va xavfsiz saqlanishi kerak." },
      { title: "2. Xizmatlar", body: "UZON xabarlar, postlar, hikoyalar, kliplar, uzun videolar, kanallar, guruhlar va qoʻngʻiroqlarni taqdim etadi. Xizmatlar rivojlantirilishi, ayrim funksiyalar esa vaqtincha oʻzgartirilishi yoki toʻxtatilishi mumkin." },
      { title: "3. Foydalanuvchi kontenti", body: "Siz joylagan kontentga egalik huquqi sizda qoladi. UZONga kontentni platformada saqlash, koʻrsatish, tarqatish va xizmatni ishlatish uchun zarur boʻlgan cheklangan, oddiy litsenziyani berasiz. Faqat foydalanish huquqiga ega boʻlgan materiallarni joylang." },
      { title: "4. Taqiqlangan harakatlar", body: "Qonunga zid kontent, tahdid, taʼqib, firibgarlik, spam, zararli dastur, boshqalarning huquqlarini buzish yoki platforma xavfsizligiga zarar yetkazish taqiqlanadi. UZON qoidabuzarliklarni tekshirishi, kontentni cheklashi yoki akkauntni vaqtincha toʻxtatishi mumkin." },
      { title: "5. Mualliflar va monetizatsiya", body: "Monetizatsiya alohida dastur va shartlar asosida, UZON uni ishga tushirgandan keyin taqdim etiladi. Toʻlov olish uchun kamida 18 yosh yoki tegishli hudud qonunchiligida belgilangan yosh talab qilinadi; voyaga yetmaganlar uchun qonuniy vakil ishtiroki talab etilishi mumkin. Hozircha monetizatsiya kafolatlanmaydi." },
      { title: "6. Akkauntni toʻxtatish va oʻchirish", body: "Siz akkauntingizni oʻchirishni soʻrashingiz mumkin. Qonun, xavfsizlik, nizolarni hal qilish yoki ushbu shartlarni bajarish uchun zarur boʻlgan ayrim maʼlumotlar belgilangan muddat saqlanishi mumkin." },
      { title: "7. Aloqa", body: "Savollar va huquqiy murojaatlar: uzon1989@gmail.com. Ushbu matn amaldagi qonunchilik talablariga muvofiq yangilanishi mumkin." },
    ] },
    privacy: { title: "UZON maxfiylik siyosati", intro: "Ushbu siyosat UZON xizmatidan foydalanganda qanday maʼlumotlar yigʻilishi, nima maqsadda ishlatilishi va qanday boshqarilishini tushuntiradi.", sections: [
      { title: "1. Qanday maʼlumotlar olinadi", body: "Akkaunt maʼlumotlari (foydalanuvchi nomi, ism, email, telefon), profil va joylangan kontent, xabarlar va qoʻngʻiroqlar metamaʼlumotlari, qurilma va brauzer maʼlumotlari, IP-manzil, xavfsizlik jurnallari hamda sozlamalar qayta ishlanishi mumkin." },
      { title: "2. Maʼlumotlardan foydalanish", body: "Maʼlumotlar akkaunt yaratish, tizimga kirish, xabar va kontentni yetkazish, qoʻngʻiroqlarni ulash, xavfsizlikni taʼminlash, firibgarlikning oldini olish, moderatsiya, texnik yordam va xizmatni yaxshilash uchun ishlatiladi." },
      { title: "3. Saqlash va xizmat koʻrsatuvchilar", body: "Maʼlumotlar UZON infratuzilmasida va xizmat koʻrsatuvchi hamkorlar tizimlarida saqlanishi yoki qayta ishlanishi mumkin. Ayrim xizmatlar boshqa mamlakatlarda joylashgan boʻlishi mumkin; xalqaro uzatishlar tegishli qonuniy kafolatlar asosida amalga oshirilishi kerak." },
      { title: "4. Ulashish", body: "Maʼlumotlar faqat xizmatni koʻrsatish uchun zarur boʻlgan provayderlar, qonuniy talab mavjud boʻlganda vakolatli organlar yoki foydalanuvchi oʻzi tanlagan auditoriya bilan ulashiladi. Shaxsiy maʼlumotlar reklama beruvchilarga sotilmaydi." },
      { title: "5. Saqlash muddati va xavfsizlik", body: "Maʼlumotlar maqsad uchun zarur muddat yoki qonun talab qilgan davr davomida saqlanadi. UZON ruxsatsiz kirish, yoʻqotish va oʻzgartirish xavfini kamaytirish uchun texnik va tashkiliy choralar koʻradi; internet orqali uzatish mutlaq xavfsizlikni kafolatlamaydi." },
      { title: "6. Sizning huquqlaringiz", body: "Siz qonunchilikda belgilangan doirada maʼlumotlaringizga kirish, ularni tuzatish, oʻchirish, qayta ishlashni cheklash yoki eʼtiroz bildirishni soʻrashingiz mumkin. Akkauntni oʻchirish uchun UZON sozlamalaridan foydalaning yoki bizga yozing." },
      { title: "7. Aloqa", body: "Maxfiylik va shaxsiy maʼlumotlar boʻyicha: uzon1989@gmail.com." },
    ] },
    community: { title: "UZON hamjamiyat qoidalari", intro: "UZON hamma uchun hurmatli, xavfsiz va ochiq muhit boʻlishi kerak.", sections: [
      { title: "1. Hurmat", body: "Haqorat, tahdid, taʼqib, doxxing, kamsitish va zoʻravonlikka undash mumkin emas." },
      { title: "2. Xavfsizlik", body: "Bolalarni ekspluatatsiya qilish, jinsiy zoʻravonlik, oʻziga yoki boshqalarga zarar yetkazishga undash, noqonuniy savdo va xavfli faoliyatni targʻib qilish taqiqlanadi." },
      { title: "3. Haqiqiylik va spam", body: "Firibgarlik, soxta akkaunt orqali aldash, spam, sunʼiy faollik, zararli havolalar va boshqalarning shaxsiga taqlid qilish taqiqlanadi." },
      { title: "4. Mualliflik huquqi", body: "Boshqalarning musiqa, video, rasm, matn va boshqa asarlarini ruxsatsiz joylamang. Huquq buzilishi haqida uzon1989@gmail.com manziliga xabar bering." },
      { title: "5. Shikoyat va moderatsiya", body: "Qoidabuzarlik haqida platformadagi shikoyat vositasi orqali xabar bering. UZON xabarlarni tekshirishi, kontentni olib tashlashi, funksiyalarni cheklashi yoki akkauntni toʻxtatishi mumkin." },
      { title: "6. Aloqa", body: "Qoidalar boʻyicha savollar: uzon1989@gmail.com." },
    ] },
  },
  ru: {
    terms: { title: "Пользовательское соглашение UZON", intro: "UZON — социальная платформа, созданная в Узбекистане и открытая пользователям по всему миру. Регистрируясь или используя сервис, вы принимаете эти условия.", sections: [
      { title: "1. Возраст и аккаунт", body: "Для использования платформы вам должно быть не менее 13 лет либо больше, если более высокий возраст установлен законом вашей страны. Там, где это требуется законом, несовершеннолетние используют сервис с согласием родителя или законного представителя. Данные аккаунта должны быть достоверными, а доступ — защищённым." },
      { title: "2. Сервис", body: "UZON предоставляет сообщения, публикации, истории, клипы, длинные видео, каналы, группы и звонки. Функции могут развиваться, изменяться или временно приостанавливаться." },
      { title: "3. Контент пользователей", body: "Вы сохраняете права на опубликованный вами контент. Вы предоставляете UZON ограниченную неисключительную лицензию на хранение, показ и распространение контента в объёме, необходимом для работы платформы. Публикуйте только материалы, на которые у вас есть права." },
      { title: "4. Запрещённые действия", body: "Запрещены незаконный контент, угрозы, травля, мошенничество, спам, вредоносные программы, нарушение чужих прав и действия, угрожающие безопасности платформы. UZON может проверять нарушения, ограничивать контент и временно блокировать аккаунты." },
      { title: "5. Авторы и монетизация", body: "Монетизация будет доступна только после запуска отдельной программы и принятия дополнительных условий. Для получения выплат требуется возраст не менее 18 лет либо более высокий возраст, установленный применимым законом; для несовершеннолетних может потребоваться участие законного представителя. До запуска монетизация не гарантируется." },
      { title: "6. Приостановка и удаление аккаунта", body: "Вы можете запросить удаление аккаунта. Некоторые данные могут сохраняться в течение установленного срока, если это необходимо по закону, для безопасности, разрешения споров или исполнения настоящих условий." },
      { title: "7. Контакты", body: "Вопросы и юридические обращения: uzon1989@gmail.com. Условия могут обновляться для соблюдения применимого законодательства." },
    ] },
    privacy: { title: "Политика конфиденциальности UZON", intro: "Политика объясняет, какие данные обрабатываются при использовании UZON, для каких целей и как ими можно управлять.", sections: [
      { title: "1. Какие данные обрабатываются", body: "Данные аккаунта (имя пользователя, имя, email, телефон), профиль и опубликованный контент, сообщения и метаданные звонков, сведения об устройстве и браузере, IP-адрес, журналы безопасности и настройки." },
      { title: "2. Цели обработки", body: "Данные используются для создания аккаунта, входа, доставки сообщений и контента, соединения звонков, безопасности, предотвращения мошенничества, модерации, поддержки и улучшения сервиса." },
      { title: "3. Хранение и поставщики услуг", body: "Данные могут храниться и обрабатываться в инфраструктуре UZON и системах поставщиков услуг. Некоторые поставщики могут находиться в других странах; международная передача должна осуществляться с соблюдением применимых требований и правовых гарантий." },
      { title: "4. Передача данных", body: "Данные передаются поставщикам, необходимым для работы сервиса, компетентным органам при наличии законного требования или аудитории, которую выбрал пользователь. Персональные данные не продаются рекламодателям." },
      { title: "5. Сроки и безопасность", body: "Данные хранятся столько, сколько необходимо для целей обработки или требует закон. UZON применяет технические и организационные меры для снижения риска несанкционированного доступа, утраты и изменения данных; абсолютная безопасность передачи через интернет не гарантируется." },
      { title: "6. Ваши права", body: "В пределах, предусмотренных законом, вы можете запросить доступ к данным, их исправление, удаление, ограничение обработки или возразить против неё. Для удаления аккаунта используйте настройки UZON или свяжитесь с нами." },
      { title: "7. Контакты", body: "По вопросам конфиденциальности и персональных данных: uzon1989@gmail.com." },
    ] },
    community: { title: "Правила сообщества UZON", intro: "UZON должен оставаться уважительной, безопасной и открытой площадкой для всех.", sections: [
      { title: "1. Уважение", body: "Запрещены оскорбления, угрозы, травля, публикация чужих личных данных, дискриминация и призывы к насилию." },
      { title: "2. Безопасность", body: "Запрещены эксплуатация детей, сексуальное насилие, призывы причинить вред себе или другим, незаконная торговля и продвижение опасной деятельности." },
      { title: "3. Подлинность и спам", body: "Запрещены мошенничество, обман с помощью поддельных аккаунтов, спам, искусственная накрутка, вредоносные ссылки и выдача себя за другого человека." },
      { title: "4. Авторские права", body: "Не публикуйте чужую музыку, видео, изображения, тексты и другие произведения без разрешения. Сообщения о нарушении прав направляйте на uzon1989@gmail.com." },
      { title: "5. Жалобы и модерация", body: "Сообщайте о нарушениях через функцию жалобы. UZON может проверять сообщения, удалять контент, ограничивать функции или приостанавливать аккаунты." },
      { title: "6. Контакты", body: "Вопросы о правилах: uzon1989@gmail.com." },
    ] },
  },
  en: {
    terms: { title: "UZON Terms of Service", intro: "UZON is a social platform created in Uzbekistan and open to people around the world. By registering or using the service, you agree to these terms.", sections: [
      { title: "1. Age and account", body: "You must be at least 13 years old, or older if the law where you live requires it. Where required by law, minors may use the service only with parent or legal guardian consent. Keep account information accurate and protect your access credentials." },
      { title: "2. The service", body: "UZON provides messaging, posts, stories, clips, long-form videos, channels, groups and calls. Features may evolve, change or be temporarily suspended." },
      { title: "3. User content", body: "You retain ownership of content you publish. You grant UZON a limited, non-exclusive licence to host, display and distribute that content as needed to operate the platform. Only upload material you have the rights to use." },
      { title: "4. Prohibited conduct", body: "Illegal content, threats, harassment, fraud, spam, malware, infringement of others’ rights and actions that compromise platform security are prohibited. UZON may review violations, restrict content or suspend accounts." },
      { title: "5. Creators and monetization", body: "Monetization will be available only after a separate program launches and additional terms are accepted. Payouts require users to be at least 18, or older where applicable law requires; guardian involvement may be required for minors. Monetization is not currently guaranteed." },
      { title: "6. Suspension and deletion", body: "You may request account deletion. Some data may be retained for a legally required period or where necessary for security, dispute resolution or compliance with these terms." },
      { title: "7. Contact", body: "Questions and legal requests: uzon1989@gmail.com. These terms may be updated to meet applicable legal requirements." },
    ] },
    privacy: { title: "UZON Privacy Policy", intro: "This policy explains what information is processed when you use UZON, why it is used and how you can exercise control over it.", sections: [
      { title: "1. Information processed", body: "This may include account details (username, name, email, phone), profile information and uploaded content, messages and call metadata, device and browser details, IP address, security logs and preferences." },
      { title: "2. Purposes", body: "Information is used to create accounts, authenticate users, deliver messages and content, connect calls, maintain security, prevent fraud, moderate the platform, provide support and improve the service." },
      { title: "3. Storage and service providers", body: "Information may be stored and processed on UZON infrastructure and by service providers. Some providers may be located in other countries; international transfers must follow applicable legal requirements and safeguards." },
      { title: "4. Sharing", body: "Information is shared with providers needed to operate the service, competent authorities when legally required, or audiences selected by the user. Personal information is not sold to advertisers." },
      { title: "5. Retention and security", body: "Information is retained for as long as needed for the stated purposes or as required by law. UZON uses technical and organisational measures to reduce risks of unauthorised access, loss or alteration; no internet transmission can be guaranteed absolutely secure." },
      { title: "6. Your rights", body: "Subject to applicable law, you may request access, correction, deletion, restriction of processing or object to processing. Use UZON account settings or contact us to request account deletion." },
      { title: "7. Contact", body: "For privacy and personal-data requests: uzon1989@gmail.com." },
    ] },
    community: { title: "UZON Community Guidelines", intro: "UZON should remain a respectful, safe and open place for everyone.", sections: [
      { title: "1. Respect", body: "Insults, threats, harassment, doxxing, discrimination and encouragement of violence are prohibited." },
      { title: "2. Safety", body: "Child exploitation, sexual abuse, encouragement of self-harm or harm to others, illegal trade and promotion of dangerous activities are prohibited." },
      { title: "3. Authenticity and spam", body: "Fraud, deceptive fake accounts, spam, artificial engagement, malicious links and impersonation are prohibited." },
      { title: "4. Copyright", body: "Do not post other people’s music, videos, images, text or other works without permission. Send copyright reports to uzon1989@gmail.com." },
      { title: "5. Reports and moderation", body: "Report violations using the in-app reporting feature. UZON may review reports, remove content, restrict features or suspend accounts." },
      { title: "6. Contact", body: "Questions about these guidelines: uzon1989@gmail.com." },
    ] },
  },
};

export function LegalDocument({ document }: { document: DocumentKey }) {
  const { locale } = useApp();
  const language = locale === "ru" || locale === "en" ? locale : "uz";
  const doc = content[language][document];
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8 text-ink">
      <Link href="/register" className="text-sm text-brand hover:underline">← UZON</Link>
      <h1 className="mt-5 text-2xl font-bold">{doc.title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{doc.intro}</p>
      <div className="mt-6 space-y-5">
        {doc.sections.map((section) => <section key={section.title}><h2 className="text-base font-semibold">{section.title}</h2><p className="mt-1 text-sm leading-6 text-muted">{section.body}</p></section>)}
      </div>
      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">UZON · uzon1989@gmail.com</p>
    </main>
  );
}
