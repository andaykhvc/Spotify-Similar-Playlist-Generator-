import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gizlilik" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl py-12 sm:py-20">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Gizlilik</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Müzik zevkin sana ait.</h1>
      <div className="surface mt-10 space-y-8 rounded-[2rem] p-6 leading-7 text-[var(--muted)] sm:p-10">
        <section>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Spotify bağlantısı</h2>
          <p className="mt-2">Giriş yalnızca Spotify&apos;ın resmi yetkilendirme sayfasında yapılır. Uygulama şifreni görmez. Bağlantı; profilini, özel ve ortak çalma listelerini okumak ve onayınla yeni özel veya herkese açık liste oluşturmak için gereken kapsamlarla sınırlıdır.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Geçici işleme</h2>
          <p className="mt-2">Seçtiğin çalma listesinin parça kimlikleri ve sınırlı metadata&apos;sı yalnızca açık isteğini işlemek için bellekte geçici olarak kullanılır. Kalıcı dinleme profili, kişisel müzik analitiği veya eğitim veri kümesi oluşturulmaz.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Dış öneri sağlayıcıları</h2>
          <p className="mt-2">Sunucu yöneticisi dış öneri özelliğini etkinleştirirse, seçilen listedeki kullanılabilir parçaların kimlikleri ReccoBeats&apos;e; FreqBlog anahtarı yapılandırılmışsa ISRC veya parça adı ve sanatçısı FreqBlog&apos;a ses özelliği analizi için gönderilir. Her müzikal grubun temsilî parçalarıyla öneri istenir; öneri adaylarının kimlikleri ve gerektiğinde ad/sanatçı bilgileri de iki sağlayıcıda özellik kontrolünden geçebilir. Özellik kapalıyken Spotify kaynaklı hiçbir veri bu sağlayıcılara gönderilmez.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Bağlantıyı kesme</h2>
          <p className="mt-2">“Bağlantıyı kes” eylemi şifreli uygulama oturumunu ve Spotify tokenlarını tarayıcıdan siler. Daha önce Spotify hesabına kaydettiğin listeler hesabında kalır.</p>
        </section>
      </div>
    </article>
  );
}
