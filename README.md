# EchoList — Spotify Similar Playlist Generator

EchoList, Spotify'ın eski “Create Similar Playlist” akışının yararlı kısmını yeniden kuran mobil öncelikli bir Next.js uygulamasıdır. Spotify hesabını bağlar, okunabilir bir kaynak çalma listesi seçer, parçalarının ses özelliklerinden birden fazla müzikal grup çıkarır, her grup için yeni parçalar bulur ve kullanıcının seçtiklerini **yeni** bir listeye kaydeder.

## Özellikler

- Spotify Authorization Code + PKCE (`S256`), OAuth state doğrulaması ve şifreli `HttpOnly` oturum
- Otomatik access-token yenileme; refresh token ve sırlar yalnızca sunucuda
- Tüm kullanıcı listeleri ve liste öğeleri için sınırlandırılmış sayfalama
- Hesaptan seçim veya Spotify playlist URL/ID yapıştırma
- Her kullanılabilir kaynak parça için ReccoBeats ve opsiyonel FreqBlog ses özelliği sorgusu
- Sağlayıcı başına ayrı normalizasyon ve deterministik medoid kümeleme; iki görünümden co-association uzlaşması
- Her müzikal grubun temsilî parçalarından hedef ses özellikli ReccoBeats aday üretimi, kaynak sanatçı kataloğu ve opsiyonel FreqBlog özellik kontrolü
- Kaynak parça eleme, Spotify ID → ISRC → normalize sanatçı/başlık sıralı deduplikasyon
- Öneri adaylarında yalnızca sağlayıcının doğrulanabilir Spotify parça bağlantısından çıkarılan ID; Spotify Search kullanılmaz
- Kaynak grubun yarıçapına göre gerçek Yakın/Dengeli/Keşif eşikleri; Yakın başlangıçta seçili, açıklanabilir puan ve uydurma yüzde yok
- Grup oranlarını koruyan kota dağıtımı, uyarlanabilir sanatçı/albüm sınırı, 20/30/50/100 hedef uzunlukları, parça kaldırma ve gerçek yeniden üretim
- Yalnızca geliştirme ortamında, oturum gerektiren `/dev/recommender-lab` tanı ekranı
- Güncel `POST /me/playlists` ve `POST /playlists/{playlist_id}/items` ile yeni liste oluşturma
- 100 öğelik güvenli yazma parçaları ve eksik yazma için görünür partial-success durumu
- Minimal gizlilik sayfası; veritabanı, kalıcı müzik profili veya eğitim veri kümesi yok

## Mimari

```text
app/
  api/auth/spotify/                     OAuth login, callback, logout
  api/spotify/                           Spotify BFF ve playlist yazma
  api/recommendations/generate/          Sunucu tarafı üretim orkestrasyonu
  api/dev/recommender-lab/                Yalnızca geliştirmede ayrıntılı tanılar
  dashboard/                             Hesap ve kaynak liste seçimi
  playlist/[playlistId]/                 Kaynak inceleme
  playlist/[playlistId]/similar/         Öneri inceleme, kaldırma ve kaydetme
  privacy/                               Veri kullanımı özeti
components/                              İstemci UI bileşenleri
lib/spotify/                             Auth, istemci, sayfalama, normalize, eşleme, yazma
lib/recommendations/                     Özellik, kümeleme, uzlaşma, aday ve sıralama motoru
  features/                              İki ayrı özellik görünümü, normalizasyon, mesafeler
  clustering/                            Medoid, silhouette, co-association, ARI
  engine/                                Playlist profili, aday üretimi, kota
  scoring/                               Radius kabulü ve açıklanabilir puan
  cache/                                 İstek ömürlü özellik önbelleği
  providers/reccobeats.ts
  providers/freqblog.ts
docs/recommendation-engine.md            Algoritma ve sağlayıcı yetenek haritası
```

Tarayıcı Spotify access/refresh tokenı, client secret, FreqBlog anahtarı veya session secret almaz. Üretim API'si tarayıcıdan parça dizisine güvenmez; kaynak listeyi giriş yapan kullanıcının Spotify oturumuyla yeniden okur. Sonuçlarla birlikte verilen 30 dakikalık, AES-GCM ile mühürlenmiş üretim bileti kullanıcı kimliğine ve izin verilen Spotify track ID'lerine bağlıdır. Kaydetme endpoint'i yalnızca bu listedeki seçili ID'leri kabul eder.

Spotify metadata'sı ve sağlayıcı sonuçları tek istek boyunca bellekte işlenir. Veritabanı kullanılmaz. Şarkı bazlı dinleme profili veya bireysel müzik zevki analitiği loglanmaz; yapılandırılmış sunucu logları yalnızca toplam sayılar, sağlayıcı durumları ve yazma sonucunu içerir.

### Öneri ve sıralama

Kaynak parçalar tekilleştirilir ve tamamı için mevcut sağlayıcılardan özellik istenir. ReccoBeats ve FreqBlog değerleri birbirine ham olarak eklenmez veya ortalanmaz. Her sağlayıcı kendi medyan/IQR ölçeğinde ve eksik değeri açıkça koruyarak deterministik k-medoids ile gruplanır. İki kümelemenin parça çiftleri hakkındaki uzlaşması müzikal grupları oluşturur. FreqBlog yoksa veya örtüşme azsa tek-sağlayıcı fallback'i açıkça işaretlenir.

Her grubun temsilî parçaları ve grubun medyan ses özellikleriyle sınırlı sayıda sağlayıcı isteği yapılır. ReccoBeats'teki kaynak sanatçıların diğer parçaları da aday havuzuna katılır. Yalnızca doğrulanabilir Spotify parça bağlantısı taşıyan adaylar alınır; öneri aşamasında Spotify Search veya tek tek parça metadata sorguları yapılmaz. Adaylar mevcut sağlayıcı özellikleriyle kaynak parçalarla karşılaştırılır. Kabul için aynı kaynak sanatçı veya eşleşen tür ailesi kanıtı gerekir; tür ailesi açıkça uyuşmuyorsa parça elenir. “Yeniden oluştur” seed alt kümesini ve aday isteğini değiştirir. Yeterince güvenilir aday yoksa istenen sayıdan az sonuç döner. Öneri önizlemesinde albüm kapakları bulunmayabilir; Spotify'da kaydedilen liste yine gerçek Spotify parça URI'lerini kullanır. Bu Spotify'ın özel öneri algoritmasının aynısı değildir. Ayrıntılar: [öneri motoru teknik belgesi](docs/recommendation-engine.md).

## Harici sağlayıcı ve Spotify politika sınırı

`EXTERNAL_RECOMMENDER_ENABLED=false` iken uygulama ReccoBeats veya FreqBlog'a **hiçbir Spotify kaynaklı veri göndermez**; hem UI eylemi kapalıdır hem sunucu endpoint'i çağrıyı reddeder. Bu değişken dağıtım sahibinin açık compliance kontrolüdür.

Değeri `true` yapmak tek başına Spotify politikalarına uygunluk garantisi değildir. Dağıtım sahibi kullanım senaryosunu, Spotify Developer şartlarını ve dış sağlayıcı veri işleme koşullarını ayrıca değerlendirmelidir. Bu proje Spotify verisiyle model eğitmez, kendi ML modelini oluşturmaz ve sağlayıcıların veriyi eğitim/profil çıkarma amacıyla kullanmasına yönelik bir izin iddiasında bulunmaz.

Kullanılan harici endpoint'ler:

- ReccoBeats: `GET https://api.reccobeats.com/v1/audio-features`, `GET /v1/track/recommendation`, `GET /v1/track/{id}` ve `GET /v1/artist/{id}/track`
  - Özellik sorguları en çok 40 ID'lik batch'ler; grup başına 1–5 Spotify Base-62 medoid seed ID, medyan özellik hedefleri ve grup başına en çok üç kaynak sanatçı kataloğu sorgusu (istek genelinde en çok 12)
  - HTTP 429'da `Retry-After` gözetilir; en fazla bir kısa otomatik tekrar yapılır
- FreqBlog (yalnızca `FREQBLOG_API_KEY` varsa): `POST https://api.freqblog.com/bulk`
  - Özellik sorguları en çok 25'lik batch'ler; tür ve ikinci ses özelliği görünümü adayları filtrelemek/sıralamak için kullanılır
  - FreqBlog iTunes kimlikli önerilerini Spotify Search ile eşlemek yerine aday olarak kullanmayız; `202`/backfill bekleyen parçalar mevcut verilerle devam eder

FreqBlog başarısız olsa bile ReccoBeats sonucu kullanılabilir. ReccoBeats aday üretimi başarısızsa Spotify kimliği güvenilir biçimde elde edilemeyen FreqBlog önerileriyle liste doldurulmaz; kullanıcıya geçici servis hatası gösterilir.

`FREQBLOG_API_KEY` olmadan tür verisi genellikle bulunmaz. Bu durumda kalite koruması için özellikle kaynak sanatçıların henüz listede olmayan şarkılarına öncelik verilir; farklı sanatçılar arasındaki keşif daha sınırlı ve sonuç listesi daha kısa olabilir. Anahtar eklemek tür bilgisi ve ikinci bağımsız özellik görünümü sağlar, fakat tek başına Spotify düzeyinde sonuç garantisi vermez. Harici servis kotaları ve veri kapsaması da sonucu etkiler.

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
| `FREQBLOG_API_KEY` | Hayır | Varsa FreqBlog tür ve ses özelliği görünümünü etkinleştirir; Spotify Search gerektiren aday üretiminde kullanılmaz |

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
- Öneri üretimi Spotify Search kullanmaz; 2026 Development Mode'da kaldırılan toplu track endpoint'ine de dayanmaz.

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
4. `POST /api/recommendations/generate` → bütün kaynak parçaların özellikleri, bağımsız sağlayıcı kümeleri, uzlaşma profili, Spotify ID taşıyan adaylar, çapraz özellik kabulü ve sıralama (Spotify Search yok)
5. `POST /api/spotify/playlists/create-similar` → yeni liste ve seçili parçalar
6. Spotify: `POST /me/playlists`, ardından 100'lük gruplarla `POST /playlists/{id}/items`

Orijinal kaynak liste hiçbir zaman değiştirilmez.

## Resmi kaynaklar

- [Spotify February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Spotify February 2026 API changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [Spotify Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist)
- [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [ReccoBeats recommendation API](https://reccobeats.com/docs/apis/get-recommendation)
- [ReccoBeats audio features API](https://reccobeats.com/docs/apis/get-audio-features)
- [FreqBlog API documentation](https://api.freqblog.com/docs)
