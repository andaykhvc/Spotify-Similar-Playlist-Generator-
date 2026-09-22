# EchoList — Spotify Similar Playlist Generator

EchoList, Spotify'ın eski “Create Similar Playlist” akışının yararlı kısmını yeniden kuran mobil öncelikli bir Next.js uygulamasıdır. Spotify hesabını bağlar, okunabilir bir kaynak çalma listesi seçer, temsilî seed grupları üzerinden benzer parçalar üretir, sonuçları Spotify'da doğrular ve kullanıcının seçtiği parçaları **yeni** bir listeye kaydeder.

## Özellikler

- Spotify Authorization Code + PKCE (`S256`), OAuth state doğrulaması ve şifreli `HttpOnly` oturum
- Otomatik access-token yenileme; refresh token ve sırlar yalnızca sunucuda
- Tüm kullanıcı listeleri ve liste öğeleri için sınırlandırılmış sayfalama
- Hesaptan seçim veya Spotify playlist URL/ID yapıştırma
- ReccoBeats birincil, FreqBlog opsiyonel ikincil sağlayıcı
- Listenin tamamına yayılan, deterministik en fazla 25 temsilî seed; ReccoBeats için 5'li gruplar
- Kaynak parça eleme, Spotify ID → ISRC → normalize sanatçı/başlık sıralı deduplikasyon
- Spotify'da exact ID, ISRC veya konservatif sanatçı/başlık eşlemesi
- Seed grubu ve sağlayıcı uzlaşmasına dayalı şeffaf sıralama; uydurma yüzde yok
- Sanatçı çeşitliliği sınırı, 20/30/50/100 hedef uzunlukları, parça kaldırma ve gerçek yeniden üretim
- Güncel `POST /me/playlists` ve `POST /playlists/{playlist_id}/items` ile yeni liste oluşturma
- 100 öğelik güvenli yazma parçaları ve eksik yazma için görünür partial-success durumu
- Minimal gizlilik sayfası; veritabanı, kalıcı müzik profili veya eğitim veri kümesi yok

## Mimari

```text
app/
  api/auth/spotify/                     OAuth login, callback, logout
  api/spotify/                           Spotify BFF ve playlist yazma
  api/recommendations/generate/          Sunucu tarafı üretim orkestrasyonu
  dashboard/                             Hesap ve kaynak liste seçimi
  playlist/[playlistId]/                 Kaynak inceleme
  playlist/[playlistId]/similar/         Öneri inceleme, kaldırma ve kaydetme
  privacy/                               Veri kullanımı özeti
components/                              İstemci UI bileşenleri
lib/spotify/                             Auth, istemci, sayfalama, normalize, eşleme, yazma
lib/recommendations/                     Seed, provider, dedupe, ranking, üretim bileti
  providers/reccobeats.ts
  providers/freqblog.ts
```

Tarayıcı Spotify access/refresh tokenı, client secret, FreqBlog anahtarı veya session secret almaz. Üretim API'si tarayıcıdan parça dizisine güvenmez; kaynak listeyi giriş yapan kullanıcının Spotify oturumuyla yeniden okur. Sonuçlarla birlikte verilen 30 dakikalık, AES-GCM ile mühürlenmiş üretim bileti kullanıcı kimliğine ve izin verilen Spotify track ID'lerine bağlıdır. Kaydetme endpoint'i yalnızca bu listedeki seçili ID'leri kabul eder.

Spotify metadata'sı ve sağlayıcı sonuçları tek istek boyunca bellekte işlenir. Veritabanı kullanılmaz. Şarkı bazlı dinleme profili veya bireysel müzik zevki analitiği loglanmaz; yapılandırılmış sunucu logları yalnızca toplam sayılar, sağlayıcı durumları ve yazma sonucunu içerir.

### Öneri ve sıralama

Kaynak ID'ler önce tekilleştirilir. Seed seçimi listenin tamamını deterministik bucket'lara ayırır ve her bucket'tan kararlı bir seçim yapar. “Yeniden oluştur” aynı diziyi karıştırmaz; varyant numarası seed seçimini/gruplamasını deterministik biçimde değiştirir ve yeni sağlayıcı isteği yapar.

ReccoBeats sonuçları sağlayıcı sırası, aynı adayın farklı seed gruplarında görülmesi ve varsa farklı sağlayıcı uzlaşmasıyla puanlanır. FreqBlog'un gerçek cosine skoru yalnızca dahili sıralamaya küçük bir katkı yapar. UI puan yüzdesi göstermez; sıralamadaki konuma göre **Güçlü eşleşme**, **Benzer** veya **Keşif** etiketi verir. 30 parçada varsayılan sanatçı sınırı yaklaşık 2'dir; havuz yetersizse hedef uzunluğa yaklaşmak için sınır kontrollü biçimde gevşer.

## Harici sağlayıcı ve Spotify politika sınırı

`EXTERNAL_RECOMMENDER_ENABLED=false` iken uygulama ReccoBeats veya FreqBlog'a **hiçbir Spotify kaynaklı veri göndermez**; hem UI eylemi kapalıdır hem sunucu endpoint'i çağrıyı reddeder. Bu değişken dağıtım sahibinin açık compliance kontrolüdür.

Değeri `true` yapmak tek başına Spotify politikalarına uygunluk garantisi değildir. Dağıtım sahibi kullanım senaryosunu, Spotify Developer şartlarını ve dış sağlayıcı veri işleme koşullarını ayrıca değerlendirmelidir. Bu proje Spotify verisiyle model eğitmez, kendi ML modelini oluşturmaz ve sağlayıcıların veriyi eğitim/profil çıkarma amacıyla kullanmasına yönelik bir izin iddiasında bulunmaz.

Kullanılan harici endpoint'ler:

- ReccoBeats: `GET https://api.reccobeats.com/v1/track/recommendation`
  - Her çağrıda 1–5 Spotify Base-62 seed ID ve ihtiyaca göre sınırlı `size`
  - HTTP 429'da `Retry-After` gözetilir; en fazla bir kısa otomatik tekrar yapılır
- FreqBlog (yalnızca `FREQBLOG_API_KEY` varsa): `GET https://api.freqblog.com/recommendations`
  - Bir deterministik seed adı/sanatçısıyla istek başına tek second-opinion çağrısı
  - `/lookup` ve `/similar` bu sürümde kullanılmaz; ücretsiz kotayı korumak için ek çağrı yapılmaz

FreqBlog başarısız olsa bile ReccoBeats sonucu kullanılabilir. ReccoBeats başarısız olur ve FreqBlog kullanılabilir durumdaysa FreqBlog fallback olabilir. İki sağlayıcı da başarısızsa kullanıcıya geçici servis hatası gösterilir.

## Spotify Developer Dashboard kurulumu

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) içinde uygulama oluşturun.
2. Uygulama ayarlarına Web API'yi ve aşağıdaki redirect URI'yi ekleyin:

   ```text
   http://127.0.0.1:3000/api/auth/spotify/callback
   ```

3. Client ID'yi `.env.local` dosyasına yazın. Bu PKCE uygulaması client secret gerektirmez; `SPOTIFY_CLIENT_SECRET` opsiyoneldir ve istemciye gönderilmez.
4. Development Mode kullanıyorsanız **Settings / User Management** alanına en fazla 5 yetkili test kullanıcısını ekleyin. Uygulama sahibi Premium hesaba sahip olmalıdır.

`SPOTIFY_REDIRECT_URI` Dashboard değeriyle karakter karakter aynı olmalıdır. `localhost` ve `127.0.0.1` farklı URI'lerdir.

İstenen Spotify kapsamları tam olarak şunlardır:

```text
user-read-private
playlist-read-private
playlist-read-collaborative
playlist-modify-private
playlist-modify-public
```

E-posta, playback, streaming, recently played, top tracks veya library kapsamları istenmez.

## Ortam değişkenleri

```bash
cp .env.example .env.local
```

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `SPOTIFY_CLIENT_ID` | Evet | Spotify uygulama Client ID |
| `SPOTIFY_CLIENT_SECRET` | Hayır | PKCE akışında kullanılmaz; yalnızca gelecekteki confidential-client geçişi için ayrılmıştır |
| `SPOTIFY_REDIRECT_URI` | Evet | Dashboard'a kayıtlı tam callback URI |
| `APP_URL` | Evet | Uygulama origin'i, sonda `/` olmadan |
| `SESSION_SECRET` | Evet | En az 32 bayt güçlü rastgele sır |
| `EXTERNAL_RECOMMENDER_ENABLED` | Evet | Harici öneri aktarımını açıkça açan/kapatılan compliance kapısı |
| `FREQBLOG_API_KEY` | Hayır | Varsa FreqBlog second opinion/fallback'i etkinleştirir |

Güçlü session secret:

```bash
openssl rand -base64 48
```

Gerçek sırları repoya commit etmeyin. `NEXT_PUBLIC_` önekli hiçbir sır kullanılmaz.

## Development Mode sınırlamaları (2026)

- Uygulama sahibi Premium hesaba sahip olmalıdır.
- En fazla 5 allowlist kullanıcısı yetkilendirilebilir.
- Kota developer hesabı düzeyinde paylaşılır.
- Playlist içerikleri yalnızca giriş yapan kullanıcının sahibi olduğu veya birlikte düzenlediği listelerde okunabilir; takip edilen başka listeler `403` döndürebilir.
- Search sonuç limiti en fazla 10'dur; eşleme katmanı bu sınırı kullanır.

Uygulama bu sınırları atlatmaz. Okunamayan listeler devre dışı gösterilir, `403` açıklanır ve mimari Extended Quota Mode'a daha sonra geçişle uyumludur. Hizmetin sınırsız genel Spotify kullanıcılarını desteklediği iddia edilmez.

## Yerelde çalıştırma

Node.js 20.9 veya üstü gerekir.

```bash
npm install
npm run dev
```

Ardından `http://127.0.0.1:3000` adresini açın.

Kalite kontrolleri:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Unit testler gerçek Spotify, ReccoBeats veya FreqBlog ağına çıkmaz; HTTP sağlayıcıları mock'lanır.

## API akışı

1. `GET /api/auth/spotify/login` → Spotify onay sayfası
2. `GET /api/auth/spotify/callback` → state/PKCE doğrulama ve şifreli oturum
3. `GET /me`, `GET /me/playlists`, `GET /playlists/{id}/items` → kaynak doğrulama
4. `POST /api/recommendations/generate` → seed/provider/dedupe/ranking/Spotify resolution
5. `POST /api/spotify/playlists/create-similar` → yeni liste ve seçili parçalar
6. Spotify: `POST /me/playlists`, ardından 100'lük gruplarla `POST /playlists/{id}/items`

Orijinal kaynak liste hiçbir zaman değiştirilmez.

## Resmi kaynaklar

- [Spotify February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Spotify Search](https://developer.spotify.com/documentation/web-api/reference/search)
- [Spotify Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist)
- [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [ReccoBeats recommendation API](https://reccobeats.com/docs/apis/get-recommendation)
- [FreqBlog API documentation](https://api.freqblog.com/docs)
